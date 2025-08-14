/**
 * Canary rollout configuration and monitoring endpoints
 */

import { FastifyInstance } from 'fastify';
import { initializeCanaryRollout } from '../services/canary-rollout.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

// Export Phase type for reuse
export type Phase = 'off' | 'canary_5' | 'canary_20' | 'ga_50' | 'full_100';

// Canary configuration schema
const CanaryConfigSchema = z.object({
  version: z.number(),
  timestamp: z.string(),
  phase: z.enum(['off', 'canary_5', 'canary_20', 'ga_50', 'full_100'] as const),
  flags: z.object({
    MISSED_CALL_ACTIONS: z.object({
      enabled: z.boolean(),
      percentage: z.number().min(0).max(100),
      geo: z.array(z.string()),
    }),
    enableTemplates: z.boolean(),
    enableRiskScoring: z.object({
      enabled: z.boolean(),
      shadowMode: z.boolean(),
    }),
  }),
  successGates: z.object({
    verifyLift: z.number(), // Required % increase
    notifActionTap: z.number(), // Minimum tap rate
    falseAllow: z.number(), // Maximum false allow rate
    complaintRate: z.number(), // Maximum complaint rate
  }),
  monitoring: z.object({
    startDate: z.string(),
    endDate: z.string().optional(),
    consecutiveDays: z.number(),
    metricsSnapshot: z.any().optional(),
  }),
});

type CanaryConfig = z.infer<typeof CanaryConfigSchema>;

// Daily metrics schema
const DailyMetricsSchema = z.object({
  date: z.string(),
  metrics: z.object({
    verify_started: z.number(),
    verify_completed: z.number(),
    verify_lift: z.number(), // Percentage
    notif_action_tap: z.number(), // Percentage
    false_allow: z.number(), // Percentage
    complaint_rate: z.number(), // Percentage
  }),
  phase: z.string(),
  passedGates: z.boolean(),
});

type DailyMetrics = z.infer<typeof DailyMetricsSchema>;

const CANARY_CONFIG_PATH = './config/canary.json';
const METRICS_LOG_PATH = './logs/canary-metrics.jsonl';
const CANARY_SIGNING_KEY = process.env.CANARY_SIGNING_KEY || 'dev-canary-key';

export default async function canaryRoutes(fastify: FastifyInstance) {
  // Initialize canary rollout manager with Slack integration
  if (process.env.SLACK_BOT_TOKEN) {
    await initializeCanaryRollout(fastify);
  }
  
  // Get current canary configuration
  fastify.get('/canary/config', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            version: { type: 'number' },
            timestamp: { type: 'string' },
            phase: { type: 'string' },
            flags: { type: 'object' },
            successGates: { type: 'object' },
            monitoring: { type: 'object' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply: any) => {
    try {
      const config = await loadCanaryConfig();
      const signature = generateCanarySignature(config);
      
      return reply
        .header('x-canary-signature', signature)
        .header('x-canary-version', config.version.toString())
        .send(config);
    } catch (error) {
      fastify.log.error('Failed to load canary config:', error);
      return reply.status(500).send({ error: 'config_unavailable' });
    }
  });

  // Update canary phase (admin only)
  fastify.post<{
    Body: {
      adminToken: string;
      phase: Phase;
      reason: string;
    }
  }>('/canary/phase', {
    schema: {
      body: {
        type: 'object',
        required: ['adminToken', 'phase', 'reason'],
        properties: {
          adminToken: { type: 'string' },
          phase: { type: 'string' },
          reason: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            phase: { type: 'string' },
            version: { type: 'number' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply: any) => {
    const { adminToken, phase, reason } = request.body;
    
    // Verify admin token
    if (adminToken !== process.env.ADMIN_CANARY_TOKEN) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    
    try {
      const config = await loadCanaryConfig();
      const oldPhase = config.phase;
      
      // Update phase based on progression
      config.phase = phase;
      config.version += 1;
      config.timestamp = new Date().toISOString();
      
      // Update flag percentages based on phase
      switch (phase) {
        case 'off':
          config.flags.MISSED_CALL_ACTIONS.enabled = false;
          config.flags.MISSED_CALL_ACTIONS.percentage = 0;
          break;
        case 'canary_5':
          config.flags.MISSED_CALL_ACTIONS.enabled = true;
          config.flags.MISSED_CALL_ACTIONS.percentage = 5;
          config.flags.MISSED_CALL_ACTIONS.geo = ['US'];
          config.monitoring.startDate = new Date().toISOString();
          break;
        case 'canary_20':
          config.flags.MISSED_CALL_ACTIONS.percentage = 20;
          config.flags.MISSED_CALL_ACTIONS.geo = ['US', 'CA'];
          break;
        case 'ga_50':
          config.flags.MISSED_CALL_ACTIONS.percentage = 50;
          config.flags.MISSED_CALL_ACTIONS.geo = ['US', 'CA', 'GB', 'AU'];
          break;
        case 'full_100':
          config.flags.MISSED_CALL_ACTIONS.percentage = 100;
          config.flags.MISSED_CALL_ACTIONS.geo = []; // All countries
          break;
      }
      
      // Save updated config
      await saveCanaryConfig(config);
      
      // Log phase change
      await appendCanaryAuditLog({
        timestamp: new Date().toISOString(),
        action: 'phase_change',
        oldPhase,
        newPhase: phase,
        reason,
        actor: 'admin',
      });
      
      return reply.send({
        success: true,
        phase,
        version: config.version,
      });
    } catch (error) {
      fastify.log.error('Failed to update canary phase:', error);
      return reply.status(500).send({ error: 'update_failed' });
    }
  });

  // Submit daily metrics
  fastify.post<{
    Body: DailyMetrics
  }>('/canary/metrics', {
    schema: {
      body: {
        type: 'object',
        required: ['date', 'metrics', 'phase', 'passedGates'],
        properties: {
          date: { type: 'string' },
          metrics: { type: 'object' },
          phase: { type: 'string' },
          passedGates: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            gatesPassed: { type: 'boolean' },
            consecutiveDays: { type: 'number' },
            recommendation: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply: any) => {
    const metricsData = DailyMetricsSchema.parse(request.body);
    
    try {
      // Append to metrics log
      const logLine = JSON.stringify(metricsData) + '\n';
      await fs.appendFile(METRICS_LOG_PATH, logLine, 'utf8');
      
      // Check if gates are met
      const config = await loadCanaryConfig();
      const gatesPassed = checkSuccessGates(metricsData.metrics, config.successGates);
      
      // Update consecutive days counter
      if (gatesPassed) {
        config.monitoring.consecutiveDays = (config.monitoring.consecutiveDays || 0) + 1;
        config.monitoring.metricsSnapshot = metricsData.metrics;
        
        // Check if ready for phase advancement
        if (config.monitoring.consecutiveDays >= 5) {
          await appendCanaryAuditLog({
            timestamp: new Date().toISOString(),
            action: 'gates_met',
            phase: config.phase,
            consecutiveDays: config.monitoring.consecutiveDays,
            metrics: metricsData.metrics,
            recommendation: 'expand_rollout',
          });
        }
      } else {
        // Reset counter if gates not met
        config.monitoring.consecutiveDays = 0;
        
        // Log gate failure
        await appendCanaryAuditLog({
          timestamp: new Date().toISOString(),
          action: 'gates_missed',
          phase: config.phase,
          metrics: metricsData.metrics,
          failedGates: getFailedGates(metricsData.metrics, config.successGates),
        });
      }
      
      await saveCanaryConfig(config);
      
      return reply.send({
        success: true,
        gatesPassed,
        consecutiveDays: config.monitoring.consecutiveDays,
        recommendation: config.monitoring.consecutiveDays >= 5 ? 'expand_rollout' : 'continue_monitoring',
      });
    } catch (error) {
      fastify.log.error('Failed to process metrics:', error);
      return reply.status(500).send({ error: 'metrics_processing_failed' });
    }
  });

  // Get canary dashboard
  fastify.get('/canary/dashboard', {
    schema: {

      response: {
        200: {
          type: 'object',
          properties: {
            currentPhase: { type: 'string' },
            version: { type: 'number' },
            flags: { type: 'object' },
            monitoring: { type: 'object' },
            recentMetrics: { type: 'array' },
            successGates: { type: 'object' },
            recommendation: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply: any) => {
    try {
      const config = await loadCanaryConfig();
      const recentMetrics = await loadRecentMetrics(7); // Last 7 days
      
      const dashboard = {
        currentPhase: config.phase,
        version: config.version,
        flags: config.flags,
        monitoring: {
          startDate: config.monitoring.startDate,
          daysRunning: getDaysSince(config.monitoring.startDate),
          consecutiveDaysMetGates: config.monitoring.consecutiveDays,
          lastSnapshot: config.monitoring.metricsSnapshot,
        },
        recentMetrics,
        successGates: config.successGates,
        recommendation: getRecommendation(config, recentMetrics),
      };
      
      return reply.send(dashboard);
    } catch (error) {
      fastify.log.error('Failed to generate dashboard:', error);
      return reply.status(500).send({ error: 'dashboard_unavailable' });
    }
  });

  // Emergency rollback
  fastify.post<{
    Body: {
      adminToken: string;
      reason: string;
    }
  }>('/canary/rollback', {
    schema: {

      body: {
        type: 'object',
        required: ['adminToken', 'reason'],
        properties: {
          adminToken: { type: 'string' },
          reason: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            phase: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply: any) => {
    const { adminToken, reason } = request.body;
    
    if (adminToken !== process.env.ADMIN_CANARY_TOKEN) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    
    try {
      const config = await loadCanaryConfig();
      const oldPhase = config.phase;
      
      // Rollback to off
      config.phase = 'off';
      config.flags.MISSED_CALL_ACTIONS.enabled = false;
      config.flags.MISSED_CALL_ACTIONS.percentage = 0;
      config.version += 1;
      config.timestamp = new Date().toISOString();
      config.monitoring.endDate = new Date().toISOString();
      
      await saveCanaryConfig(config);
      
      // Log rollback
      await appendCanaryAuditLog({
        timestamp: new Date().toISOString(),
        action: 'emergency_rollback',
        oldPhase,
        reason,
        actor: 'admin',
      });
      
      // Trigger kill switch for immediate effect
      if (process.env.GLOBAL_KILL_SWITCH_URL) {
        await triggerKillSwitch(reason);
      }
      
      return reply.send({
        success: true,
        message: 'Canary rolled back successfully',
        phase: 'off',
      });
    } catch (error) {
      fastify.log.error('Failed to rollback canary:', error);
      return reply.status(500).send({ error: 'rollback_failed' });
    }
  });
}

// Helper functions

async function loadCanaryConfig(): Promise<CanaryConfig> {
  try {
    const data = await fs.readFile(CANARY_CONFIG_PATH, 'utf8');
    return CanaryConfigSchema.parse(JSON.parse(data));
  } catch (error) {
    // Return default config if file doesn't exist
    return getDefaultCanaryConfig();
  }
}

async function saveCanaryConfig(config: CanaryConfig): Promise<void> {
  const dir = path.dirname(CANARY_CONFIG_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(CANARY_CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getDefaultCanaryConfig(): CanaryConfig {
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    phase: 'off',
    flags: {
      MISSED_CALL_ACTIONS: {
        enabled: false,
        percentage: 0,
        geo: [],
      },
      enableTemplates: true, // Templates ON as requested
      enableRiskScoring: {
        enabled: true,
        shadowMode: true, // Shadow mode as requested
      },
    },
    successGates: {
      verifyLift: 20, // ≥ +20% lift
      notifActionTap: 12, // ≥ 12%
      falseAllow: 0.8, // ≤ 0.8%
      complaintRate: 0.2, // ≤ 0.2%
    },
    monitoring: {
      startDate: '',
      consecutiveDays: 0,
    },
  };
}

function generateCanarySignature(config: CanaryConfig): string {
  const payload = JSON.stringify(config);
  return crypto
    .createHmac('sha256', CANARY_SIGNING_KEY)
    .update(payload)
    .digest('hex');
}

function checkSuccessGates(
  metrics: DailyMetrics['metrics'],
  gates: CanaryConfig['successGates']
): boolean {
  return (
    metrics.verify_lift >= gates.verifyLift &&
    metrics.notif_action_tap >= gates.notifActionTap &&
    metrics.false_allow <= gates.falseAllow &&
    metrics.complaint_rate <= gates.complaintRate
  );
}

function getFailedGates(
  metrics: DailyMetrics['metrics'],
  gates: CanaryConfig['successGates']
): string[] {
  const failed = [];
  
  if (metrics.verify_lift < gates.verifyLift) {
    failed.push(`verify_lift: ${metrics.verify_lift}% < ${gates.verifyLift}%`);
  }
  if (metrics.notif_action_tap < gates.notifActionTap) {
    failed.push(`notif_action_tap: ${metrics.notif_action_tap}% < ${gates.notifActionTap}%`);
  }
  if (metrics.false_allow > gates.falseAllow) {
    failed.push(`false_allow: ${metrics.false_allow}% > ${gates.falseAllow}%`);
  }
  if (metrics.complaint_rate > gates.complaintRate) {
    failed.push(`complaint_rate: ${metrics.complaint_rate}% > ${gates.complaintRate}%`);
  }
  
  return failed;
}

async function loadRecentMetrics(days: number): Promise<DailyMetrics[]> {
  try {
    const content = await fs.readFile(METRICS_LOG_PATH, 'utf8');
    const lines = content.trim().split('\n');
    const metrics = lines
      .map(line => JSON.parse(line) as DailyMetrics)
      .slice(-days);
    return metrics;
  } catch {
    return [];
  }
}

function getDaysSince(startDate: string): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function getRecommendation(config: CanaryConfig, metrics: DailyMetrics[]): string {
  if (config.monitoring.consecutiveDays >= 5) {
    switch (config.phase) {
      case 'canary_5':
        return 'Ready to expand to 20% (canary_20)';
      case 'canary_20':
        return 'Ready for GA at 50% (ga_50)';
      case 'ga_50':
        return 'Ready for full rollout (full_100)';
      case 'full_100':
        return 'Fully rolled out - monitor for stability';
      default:
        return 'Ready to start canary at 5%';
    }
  }
  
  if (config.monitoring.consecutiveDays > 0) {
    return `Continue monitoring - ${5 - config.monitoring.consecutiveDays} more days needed`;
  }
  
  return 'Gates not met - continue monitoring or consider rollback';
}

async function appendCanaryAuditLog(entry: any): Promise<void> {
  const logPath = './logs/canary-audit.jsonl';
  const dir = path.dirname(logPath);
  await fs.mkdir(dir, { recursive: true });
  const logLine = JSON.stringify(entry) + '\n';
  await fs.appendFile(logPath, logLine, 'utf8');
}

async function triggerKillSwitch(reason: string): Promise<void> {
  try {
    const response = await fetch(process.env.GLOBAL_KILL_SWITCH_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        active: true,
        adminToken: process.env.ADMIN_KILL_SWITCH_TOKEN,
        reason,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Kill switch activation failed: ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to trigger kill switch:', error);
  }
}