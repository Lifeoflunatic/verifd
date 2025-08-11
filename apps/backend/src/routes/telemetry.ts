import { FastifyPluginAsync } from 'fastify';
import { AggregatedMetrics } from '@verifd/shared/telemetry/PrivacyTelemetry';

interface TelemetryBody {
  metrics: AggregatedMetrics[];
  timestamp: string;
  privacyMode: 'differential';
  epsilon: number;
}

const telemetryRoute: FastifyPluginAsync = async (fastify) => {
  // In-memory storage for demo (use TimeSeries DB in production)
  const metricsBuffer: AggregatedMetrics[] = [];
  const MAX_BUFFER_SIZE = 10000;
  
  // Receive telemetry data
  fastify.post<{
    Body: TelemetryBody;
  }>('/telemetry/metrics', {
    schema: {
      description: 'Receive privacy-safe telemetry metrics',
      tags: ['telemetry'],
      body: {
        type: 'object',
        required: ['metrics', 'timestamp', 'privacyMode', 'epsilon'],
        properties: {
          metrics: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                metric: { type: 'string' },
                count: { type: 'number' },
                sum: { type: 'number' },
                min: { type: 'number' },
                max: { type: 'number' },
                mean: { type: 'number' },
                noise: { type: 'number' },
                privacyBudget: { type: 'number' },
                period: {
                  type: 'object',
                  properties: {
                    start: { type: 'string' },
                    end: { type: 'string' }
                  }
                }
              }
            }
          },
          timestamp: { type: 'string' },
          privacyMode: { type: 'string', const: 'differential' },
          epsilon: { type: 'number' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accepted: { type: 'boolean' },
            metricsReceived: { type: 'number' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { metrics, privacyMode, epsilon } = request.body;
    
    // Validate privacy mode
    if (privacyMode !== 'differential') {
      return reply.code(400).send({ 
        error: 'Only differential privacy mode is accepted' 
      });
    }
    
    // Validate epsilon (privacy parameter)
    if (epsilon < 0.01 || epsilon > 1.0) {
      return reply.code(400).send({ 
        error: 'Epsilon must be between 0.01 and 1.0' 
      });
    }
    
    // Store metrics
    for (const metric of metrics) {
      metricsBuffer.push(metric);
      
      // Log important metrics
      if (metric.metric.startsWith('feature.') || 
          metric.metric.startsWith('risk.') ||
          metric.metric === 'vpass.granted') {
        fastify.log.info({
          metric: metric.metric,
          count: metric.count,
          mean: metric.mean,
          noise: metric.noise,
          privacyBudget: metric.privacyBudget
        }, 'Telemetry metric received');
      }
    }
    
    // Prevent unbounded growth
    if (metricsBuffer.length > MAX_BUFFER_SIZE) {
      metricsBuffer.splice(0, metricsBuffer.length - MAX_BUFFER_SIZE);
    }
    
    return reply.send({
      accepted: true,
      metricsReceived: metrics.length
    });
  });
  
  // Query aggregated metrics (admin endpoint)
  fastify.get<{
    Querystring: {
      metric?: string;
      start?: string;
      end?: string;
      adminToken?: string;
    };
  }>('/telemetry/query', {
    schema: {
      description: 'Query aggregated telemetry metrics',
      tags: ['telemetry', 'admin'],
      querystring: {
        type: 'object',
        properties: {
          metric: { type: 'string' },
          start: { type: 'string', format: 'date-time' },
          end: { type: 'string', format: 'date-time' },
          adminToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            metrics: {
              type: 'array',
              items: {
                type: 'object'
              }
            },
            summary: {
              type: 'object',
              properties: {
                totalMetrics: { type: 'number' },
                uniqueMetrics: { type: 'number' },
                averageNoise: { type: 'number' },
                averagePrivacyBudget: { type: 'number' }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { metric, start, end, adminToken } = request.query;
    
    // Verify admin token
    const expectedToken = process.env.TELEMETRY_ADMIN_TOKEN;
    if (!expectedToken || adminToken !== expectedToken) {
      return reply.code(401).send({ error: 'Invalid admin token' });
    }
    
    // Filter metrics
    let filtered = [...metricsBuffer];
    
    if (metric) {
      filtered = filtered.filter(m => m.metric.includes(metric));
    }
    
    if (start) {
      const startTime = new Date(start).getTime();
      filtered = filtered.filter(m => 
        new Date(m.period.start).getTime() >= startTime
      );
    }
    
    if (end) {
      const endTime = new Date(end).getTime();
      filtered = filtered.filter(m => 
        new Date(m.period.end).getTime() <= endTime
      );
    }
    
    // Calculate summary statistics
    const uniqueMetrics = new Set(filtered.map(m => m.metric)).size;
    const totalNoise = filtered.reduce((sum, m) => sum + m.noise, 0);
    const totalPrivacyBudget = filtered.reduce((sum, m) => sum + m.privacyBudget, 0);
    
    return reply.send({
      metrics: filtered,
      summary: {
        totalMetrics: filtered.length,
        uniqueMetrics,
        averageNoise: filtered.length > 0 ? totalNoise / filtered.length : 0,
        averagePrivacyBudget: filtered.length > 0 ? totalPrivacyBudget / filtered.length : 0
      }
    });
  });
  
  // Dashboard data endpoint
  fastify.get('/telemetry/dashboard', {
    schema: {
      description: 'Get telemetry dashboard data',
      tags: ['telemetry'],
      response: {
        200: {
          type: 'object',
          properties: {
            features: {
              type: 'object',
              properties: {
                MISSED_CALL_ACTIONS: { type: 'object' },
                QUICK_TILE_EXPECTING: { type: 'object' },
                APP_SHORTCUTS_ENABLED: { type: 'object' },
                IDENTITY_LOOKUP_ENABLED: { type: 'object' },
                enableTemplates: { type: 'object' },
                enableWhatsApp: { type: 'object' },
                enableRiskScoring: { type: 'object' }
              }
            },
            performance: {
              type: 'object',
              properties: {
                apiLatency: { type: 'object' },
                cacheHitRate: { type: 'number' },
                errorRate: { type: 'number' }
              }
            },
            vpass: {
              type: 'object',
              properties: {
                granted: { type: 'number' },
                checked: { type: 'number' },
                expired: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    // Aggregate metrics for dashboard
    const featureMetrics: Record<string, any> = {};
    const performanceMetrics: any = {
      apiLatency: { mean: 0, p95: 0, p99: 0 },
      cacheHitRate: 0,
      errorRate: 0
    };
    const vpassMetrics = {
      granted: 0,
      checked: 0,
      expired: 0
    };
    
    // Process buffer
    for (const metric of metricsBuffer) {
      // Feature metrics
      if (metric.metric.startsWith('feature.')) {
        const [, action, feature] = metric.metric.split('.');
        if (feature) {
          if (!featureMetrics[feature]) {
            featureMetrics[feature] = { enabled: 0, used: 0, errors: 0 };
          }
          
          if (action === 'enabled') {
            featureMetrics[feature].enabled += metric.count;
          } else if (action === 'used') {
            featureMetrics[feature].used += metric.count;
          } else if (action === 'error') {
            featureMetrics[feature].errors += metric.count;
          }
        }
      }
      
      // Performance metrics
      if (metric.metric === 'api.latency') {
        performanceMetrics.apiLatency.mean = metric.mean;
      } else if (metric.metric === 'cache.hit') {
        performanceMetrics.cacheHitRate += metric.count;
      } else if (metric.metric === 'cache.miss') {
        performanceMetrics.cacheHitRate -= metric.count;
      }
      
      // vPass metrics
      if (metric.metric === 'vpass.granted') {
        vpassMetrics.granted += metric.count;
      } else if (metric.metric === 'vpass.checked') {
        vpassMetrics.checked += metric.count;
      } else if (metric.metric === 'vpass.expired') {
        vpassMetrics.expired += metric.count;
      }
    }
    
    // Calculate cache hit rate
    const totalCacheOps = metricsBuffer
      .filter(m => m.metric.startsWith('cache.'))
      .reduce((sum, m) => sum + m.count, 0);
    
    if (totalCacheOps > 0) {
      performanceMetrics.cacheHitRate = performanceMetrics.cacheHitRate / totalCacheOps;
    }
    
    return reply.send({
      features: featureMetrics,
      performance: performanceMetrics,
      vpass: vpassMetrics
    });
  });
};

export default telemetryRoute;