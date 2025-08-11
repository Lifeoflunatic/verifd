import { FastifyPluginAsync } from 'fastify';
import { RemoteFeatureFlags } from '@verifd/shared/config/FeatureFlags';
import { getUserFeatureFlags, hasOverride, logOverrideUsage, getStagingOverrideNumbers, STAGING_GEO_GATE, STAGING_OVERRIDES } from '../config/overrides.js';
import * as crypto from 'crypto';

interface ConfigQueryParams {
  userId?: string;
  geo?: string;
  device?: 'ios' | 'android' | 'web';
  version?: string;
  phone?: string;
}

const configRoute: FastifyPluginAsync = async (fastify) => {
  // Cache configuration for 5 minutes
  let cachedConfig: RemoteFeatureFlags | null = null;
  let cacheTime = 0;
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Ed25519 signing configuration
  const STAGING_PRIVATE_KEY = process.env.STAGING_ED25519_PRIVATE_KEY;
  const STAGING_KID = process.env.STAGING_ED25519_KID || 'staging-2025-001';

  /**
   * Sign configuration with Ed25519
   */
  const signConfig = (config: RemoteFeatureFlags, kid: string): { signature: string; kid: string } | null => {
    if (!STAGING_PRIVATE_KEY || process.env.NODE_ENV !== 'staging') {
      return null;
    }

    try {
      // Convert hex private key to buffer
      const privateKeyBuffer = Buffer.from(STAGING_PRIVATE_KEY, 'hex');
      
      // Create payload to sign (deterministic JSON)
      const payload = JSON.stringify(config, Object.keys(config).sort());
      const payloadBuffer = Buffer.from(payload, 'utf8');
      
      // Sign with Ed25519
      const signature = crypto.sign(null, payloadBuffer, {
        key: privateKeyBuffer,
        format: 'der',
        type: 'ed25519'
      });

      return {
        signature: signature.toString('base64'),
        kid
      };
    } catch (error) {
      fastify.log.error({ error }, 'Failed to sign config');
      return null;
    }
  };
  
  // Get feature configuration
  fastify.get<{
    Querystring: ConfigQueryParams;
    Headers: {
      'x-user-id'?: string;
      'x-geo-location'?: string;
      'x-device-type'?: string;
      'x-app-version'?: string;
    };
  }>('/config/features', {
    schema: {
      description: 'Get feature flag configuration',
      tags: ['config'],
      headers: {
        type: 'object',
        properties: {
          'x-user-id': { type: 'string' },
          'x-geo-location': { type: 'string' },
          'x-device-type': { type: 'string', enum: ['ios', 'android', 'web'] },
          'x-app-version': { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            GLOBAL_KILL_SWITCH: { type: 'boolean' },
            configVersion: { type: 'string' },
            lastUpdated: { type: 'string' },
            updateIntervalMs: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const now = Date.now();
    
    // Extract user info from headers or query
    const phoneNumber = request.query.phone || request.headers['x-phone-number'];
    const userGeo = request.query.geo || request.headers['x-geo-location'] || 'IN';
    
    // Check cache (skip for override users)
    if (!phoneNumber || !hasOverride(phoneNumber as string)) {
      if (cachedConfig && (now - cacheTime) < CACHE_DURATION) {
        return reply.send(cachedConfig);
      }
    }
    
    // Get configuration based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const isStaging = process.env.NODE_ENV === 'staging' || true; // Force staging for now
    
    // Check for emergency kill switch
    const killSwitch = process.env.FEATURE_KILL_SWITCH === 'true';
    
    // Set default GEO gate for staging to IN (India)
    const defaultGeoTargets = isStaging ? [STAGING_GEO_GATE] : ['US', 'CA'];
    const missedCallGeos = process.env.MISSED_CALL_ACTIONS_GEOS || defaultGeoTargets.join(',');

    // Build configuration
    const config: RemoteFeatureFlags = {
      GLOBAL_KILL_SWITCH: killSwitch,
      
      MISSED_CALL_ACTIONS: {
        enabled: !isProduction || process.env.ENABLE_MISSED_CALL_ACTIONS === 'true',
        cohort: {
          percentage: parseInt(process.env.MISSED_CALL_ACTIONS_PERCENTAGE || '0'),
          geoTargets: missedCallGeos.split(','),
          deviceTypes: ['android']
        }
      },
      
      QUICK_TILE_EXPECTING: {
        enabled: !isProduction || process.env.ENABLE_QUICK_TILE === 'true',
        cohort: {
          percentage: parseInt(process.env.QUICK_TILE_PERCENTAGE || '0'),
          geoTargets: (process.env.QUICK_TILE_GEOS || 'US,CA').split(','),
          deviceTypes: ['android'],
          minAppVersion: process.env.QUICK_TILE_MIN_VERSION || '1.0.0'
        }
      },
      
      APP_SHORTCUTS_ENABLED: {
        enabled: !isProduction || process.env.ENABLE_APP_SHORTCUTS === 'true',
        cohort: {
          percentage: parseInt(process.env.APP_SHORTCUTS_PERCENTAGE || '0'),
          geoTargets: (process.env.APP_SHORTCUTS_GEOS || 'US,CA').split(','),
          deviceTypes: ['ios'],
          minAppVersion: process.env.APP_SHORTCUTS_MIN_VERSION || '1.0.0'
        }
      },
      
      IDENTITY_LOOKUP_ENABLED: {
        enabled: !isProduction || process.env.ENABLE_IDENTITY_LOOKUP === 'true',
        cohort: {
          percentage: parseInt(process.env.IDENTITY_LOOKUP_PERCENTAGE || '0'),
          geoTargets: (process.env.IDENTITY_LOOKUP_GEOS || 'US').split(','),
          deviceTypes: ['ios'],
          minAppVersion: process.env.IDENTITY_LOOKUP_MIN_VERSION || '1.0.0'
        }
      },
      
      enableTemplates: {
        enabled: !isProduction || process.env.ENABLE_TEMPLATES === 'true',
        cohort: {
          percentage: parseInt(process.env.TEMPLATES_PERCENTAGE || '0'),
          deviceTypes: ['web']
        }
      },
      
      enableWhatsApp: {
        enabled: !isProduction || process.env.ENABLE_WHATSAPP === 'true',
        cohort: {
          percentage: parseInt(process.env.WHATSAPP_PERCENTAGE || '0'),
          geoTargets: (process.env.WHATSAPP_GEOS || 'US,CA,GB,AU').split(','),
          deviceTypes: ['web']
        }
      },
      
      enableRiskScoring: {
        enabled: process.env.ENABLE_RISK_SCORING === 'true', // Always explicit opt-in
        cohort: {
          percentage: parseInt(process.env.RISK_SCORING_PERCENTAGE || '0'),
          geoTargets: (process.env.RISK_SCORING_GEOS || 'US').split(',')
        },
        metadata: {
          shadowMode: process.env.RISK_SHADOW_MODE !== 'false', // Default true
          highRiskThreshold: parseInt(process.env.RISK_HIGH_THRESHOLD || '70'),
          criticalRiskThreshold: parseInt(process.env.RISK_CRITICAL_THRESHOLD || '90')
        }
      },
      
      configVersion: process.env.CONFIG_VERSION || '1.0.0',
      lastUpdated: new Date().toISOString(),
      updateIntervalMs: parseInt(process.env.CONFIG_UPDATE_INTERVAL || '300000'), // 5 minutes
      fallbackBehavior: 'default_off' as const
    };
    
    // Add staging overrides
    if (isStaging) {
      // In staging, enable features at higher percentages for testing
      config.MISSED_CALL_ACTIONS.cohort!.percentage = 50;
      config.QUICK_TILE_EXPECTING.cohort!.percentage = 50;
      config.APP_SHORTCUTS_ENABLED.cohort!.percentage = 50;
      config.IDENTITY_LOOKUP_ENABLED.cohort!.percentage = 25;
      config.enableTemplates.cohort!.percentage = 75;
      config.enableWhatsApp.cohort!.percentage = 75;
      config.enableRiskScoring.cohort!.percentage = 10; // Still conservative for risk
    }

    // Apply user-specific overrides if phone number provided
    let finalConfig = config;
    if (phoneNumber && isStaging) {
      finalConfig = getUserFeatureFlags(phoneNumber as string, config, userGeo as string);
      
      // Log override usage
      if (hasOverride(phoneNumber as string)) {
        logOverrideUsage(phoneNumber as string, 'config_request');
      }
    }
    
    // Sign the configuration
    const signatureInfo = signConfig(finalConfig, STAGING_KID);
    
    // Prepare response with signature
    const response = {
      ...finalConfig,
      ...(signatureInfo && {
        signature: signatureInfo.signature,
        kid: signatureInfo.kid,
        signedAt: new Date().toISOString()
      })
    };
    
    // Cache the configuration
    cachedConfig = finalConfig;
    cacheTime = now;
    
    // Set cache headers
    reply.header('Cache-Control', 'public, max-age=300'); // 5 minutes
    reply.header('ETag', `"${finalConfig.configVersion}-${finalConfig.lastUpdated}"`);
    
    // Log configuration request with override info
    const isOverrideUser = phoneNumber ? hasOverride(phoneNumber as string) : false;
    
    fastify.log.info({
      userId: request.headers['x-user-id'] || 'anonymous',
      geo: request.headers['x-geo-location'] || 'unknown',
      device: request.headers['x-device-type'] || 'unknown',
      version: request.headers['x-app-version'] || '0.0.0',
      phoneNumber: phoneNumber ? `${(phoneNumber as string).slice(0, 4)}***` : 'none',
      killSwitch,
      configVersion: finalConfig.configVersion,
      isOverrideUser,
      signed: !!signatureInfo
    }, 'Feature config requested');
    
    // Log audit entry for config changes
    if (phoneNumber && hasOverride(phoneNumber as string)) {
      fastify.log.warn({
        phoneNumber: phoneNumber as string,
        userId: request.headers['x-user-id'] || 'anonymous',
        overriddenFeatures: Object.keys(finalConfig).filter(key => 
          JSON.stringify(config[key as keyof typeof config]) !== 
          JSON.stringify(finalConfig[key as keyof typeof finalConfig])
        ),
        timestamp: new Date().toISOString()
      }, 'Staging override applied to config');
    }
    
    return reply.send(response);
  });
  
  // Admin endpoint to trigger kill switch (protected)
  fastify.post('/config/kill-switch', {
    schema: {
      description: 'Activate or deactivate global kill switch',
      tags: ['config', 'admin'],
      body: {
        type: 'object',
        required: ['active', 'adminToken'],
        properties: {
          active: { type: 'boolean' },
          adminToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            killSwitchActive: { type: 'boolean' }
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
    const { active, adminToken } = request.body as { active: boolean; adminToken: string };
    
    // Verify admin token
    const expectedToken = process.env.ADMIN_KILL_SWITCH_TOKEN;
    if (!expectedToken || adminToken !== expectedToken) {
      return reply.code(401).send({ error: 'Invalid admin token' });
    }
    
    // Update kill switch state (in production, this would update a database or config service)
    process.env.FEATURE_KILL_SWITCH = active ? 'true' : 'false';
    
    // Clear cache to force immediate update
    cachedConfig = null;
    cacheTime = 0;
    
    // Log kill switch change
    fastify.log.warn({
      active,
      triggeredBy: request.ip,
      timestamp: new Date().toISOString()
    }, `KILL SWITCH ${active ? 'ACTIVATED' : 'DEACTIVATED'}`);
    
    // Send alert (in production, this would send to PagerDuty/Slack)
    if (active) {
      console.error('🚨 GLOBAL FEATURE KILL SWITCH ACTIVATED - All features disabled');
    } else {
      console.log('✅ Global feature kill switch deactivated');
    }
    
    return reply.send({
      success: true,
      killSwitchActive: active
    });
  });
  
  // Health check for config service
  fastify.get('/config/health', async (request, reply) => {
    return reply.send({
      healthy: true,
      cacheValid: cachedConfig !== null && (Date.now() - cacheTime) < CACHE_DURATION,
      killSwitchActive: process.env.FEATURE_KILL_SWITCH === 'true',
      configVersion: cachedConfig?.configVersion || 'none'
    });
  });

  // Staging overrides endpoint (staging only)
  fastify.get('/config/staging-overrides', {
    schema: {
      description: 'Get staging override configuration (staging only)',
      tags: ['config', 'staging'],
      response: {
        200: {
          type: 'object',
          properties: {
            overrideNumbers: { 
              type: 'array',
              items: { type: 'string' }
            },
            environment: { type: 'string' },
            defaultGeoGate: { type: 'string' },
            stagingKID: { type: 'string' },
            signingEnabled: { type: 'boolean' }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    // Only available in staging
    if (process.env.NODE_ENV !== 'staging') {
      return reply.code(404).send({ error: 'Staging overrides not available in this environment' });
    }

    return reply.send({
      overrideNumbers: getStagingOverrideNumbers(),
      environment: process.env.NODE_ENV,
      defaultGeoGate: 'IN',
      stagingKID: STAGING_KID,
      signingEnabled: !!STAGING_PRIVATE_KEY
    });
  });
};

export default configRoute;