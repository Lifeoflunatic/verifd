import { FastifyPluginAsync } from 'fastify';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

interface AdminAuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: 'kill_switch_activate' | 'kill_switch_deactivate' | 'flag_update' | 'key_rotation';
  target?: string;
  previousValue?: any;
  newValue?: any;
  reason: string;
  ipAddress: string;
  userAgent?: string;
  signature?: string; // Signed by admin key
}

interface ConfigUpdateRequest {
  feature: string;
  changes: Record<string, any>;
  reason: string;
  adminToken: string;
}

interface KeyRotationRequest {
  oldKeyId: string;
  newKeyId: string;
  newPublicKey: string;
  adminToken: string;
}

const configAdminRoute: FastifyPluginAsync = async (fastify) => {
  // Audit log storage (append-only)
  const AUDIT_LOG_PATH = process.env.AUDIT_LOG_PATH || './logs/config-audit.jsonl';
  
  // Ed25519 key pair for signing configs
  let signingKeyPair = generateKeyPair();
  let currentKeyId = 'verifd-config-key-1';
  
  /**
   * Generate Ed25519 key pair
   */
  function generateKeyPair() {
    return crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
  }
  
  /**
   * Sign configuration payload
   */
  function signConfig(payload: string): string {
    const sign = crypto.createSign('SHA256');
    sign.update(payload);
    sign.end();
    return sign.sign(signingKeyPair.privateKey, 'base64');
  }
  
  /**
   * Append to audit log (append-only)
   */
  async function appendAuditLog(entry: AdminAuditEntry): Promise<void> {
    const logLine = JSON.stringify(entry) + '\n';
    
    try {
      // Ensure directory exists
      const dir = path.dirname(AUDIT_LOG_PATH);
      await fs.mkdir(dir, { recursive: true });
      
      // Append to log file
      await fs.appendFile(AUDIT_LOG_PATH, logLine, 'utf8');
      
      // Also log to stdout for monitoring
      fastify.log.warn({
        audit: true,
        ...entry
      }, 'CONFIG_ADMIN_ACTION');
    } catch (error) {
      fastify.log.error({ error }, 'Failed to write audit log');
      throw new Error('Audit log write failed');
    }
  }
  
  /**
   * Verify admin token and permissions
   */
  function verifyAdminAccess(token: string, action: string): boolean {
    const expectedToken = process.env.CONFIG_ADMIN_TOKEN;
    
    if (!expectedToken) {
      throw new Error('Admin token not configured');
    }
    
    // In production, implement proper JWT/OAuth
    return token === expectedToken;
  }
  
  // Get audit log (paginated)
  fastify.get<{
    Querystring: {
      limit?: number;
      offset?: number;
      actor?: string;
      action?: string;
      since?: string;
      adminToken: string;
    };
  }>('/config/admin-audit', {
    schema: {
      description: 'Get configuration audit log',
      tags: ['config', 'admin'],
      querystring: {
        type: 'object',
        required: ['adminToken'],
        properties: {
          limit: { type: 'number', default: 100, maximum: 1000 },
          offset: { type: 'number', default: 0 },
          actor: { type: 'string' },
          action: { type: 'string' },
          since: { type: 'string', format: 'date-time' },
          adminToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            entries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  timestamp: { type: 'string' },
                  actor: { type: 'string' },
                  action: { type: 'string' },
                  target: { type: 'string' },
                  reason: { type: 'string' }
                }
              }
            },
            total: { type: 'number' },
            hasMore: { type: 'boolean' }
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
    const { limit = 100, offset = 0, actor, action, since, adminToken } = request.query;
    
    if (!verifyAdminAccess(adminToken, 'read_audit')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    
    try {
      // Read audit log file
      const logContent = await fs.readFile(AUDIT_LOG_PATH, 'utf8');
      const lines = logContent.trim().split('\n').filter(Boolean);
      
      // Parse and filter entries
      let entries: AdminAuditEntry[] = lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as AdminAuditEntry[];
      
      // Apply filters
      if (actor) {
        entries = entries.filter(e => e.actor === actor);
      }
      
      if (action) {
        entries = entries.filter(e => e.action === action);
      }
      
      if (since) {
        const sinceTime = new Date(since).getTime();
        entries = entries.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
      }
      
      // Reverse for most recent first
      entries.reverse();
      
      // Paginate
      const total = entries.length;
      const paginatedEntries = entries.slice(offset, offset + limit);
      
      return reply.send({
        entries: paginatedEntries,
        total,
        hasMore: offset + limit < total
      });
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // No audit log yet
        return reply.send({
          entries: [],
          total: 0,
          hasMore: false
        });
      }
      
      throw error;
    }
  });
  
  // Update feature flag configuration
  fastify.patch<{
    Body: ConfigUpdateRequest;
  }>('/config/admin/feature', {
    schema: {
      description: 'Update feature flag configuration',
      tags: ['config', 'admin'],
      body: {
        type: 'object',
        required: ['feature', 'changes', 'reason', 'adminToken'],
        properties: {
          feature: { type: 'string' },
          changes: { type: 'object' },
          reason: { type: 'string', minLength: 10 },
          adminToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            feature: { type: 'string' },
            changes: { type: 'object' },
            auditId: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { feature, changes, reason, adminToken } = request.body;
    
    if (!verifyAdminAccess(adminToken, 'update_feature')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    
    // Get current value
    const currentValue = process.env[feature] || null;
    
    // Apply changes
    Object.entries(changes).forEach(([key, value]) => {
      const envKey = `${feature}_${key}`.toUpperCase();
      process.env[envKey] = String(value);
    });
    
    // Create audit entry
    const auditEntry: AdminAuditEntry = {
      id: crypto.randomBytes(16).toString('hex'),
      timestamp: new Date().toISOString(),
      actor: 'admin', // In production, get from JWT
      action: 'flag_update',
      target: feature,
      previousValue: currentValue,
      newValue: changes,
      reason,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    };
    
    // Append to audit log
    await appendAuditLog(auditEntry);
    
    // Clear config cache to force reload
    (fastify as any).configCache = null;
    
    fastify.log.info({
      feature,
      changes,
      auditId: auditEntry.id
    }, 'Feature flag updated');
    
    return reply.send({
      success: true,
      feature,
      changes,
      auditId: auditEntry.id
    });
  });
  
  // Get signed configuration
  fastify.get('/config/signed', {
    schema: {
      description: 'Get signed feature configuration',
      tags: ['config'],
      response: {
        200: {
          type: 'object',
          properties: {
            config: { type: 'object' },
            signature: { type: 'string' },
            keyId: { type: 'string' },
            timestamp: { type: 'string' },
            validUntil: { type: 'string' },
            version: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    // Build config payload
    const config = {
      GLOBAL_KILL_SWITCH: process.env.FEATURE_KILL_SWITCH === 'true',
      features: {
        MISSED_CALL_ACTIONS: {
          enabled: process.env.ENABLE_MISSED_CALL_ACTIONS === 'true',
          percentage: parseInt(process.env.MISSED_CALL_ACTIONS_PERCENTAGE || '0')
        },
        QUICK_TILE_EXPECTING: {
          enabled: process.env.ENABLE_QUICK_TILE === 'true',
          percentage: parseInt(process.env.QUICK_TILE_PERCENTAGE || '0')
        },
        APP_SHORTCUTS_ENABLED: {
          enabled: process.env.ENABLE_APP_SHORTCUTS === 'true',
          percentage: parseInt(process.env.APP_SHORTCUTS_PERCENTAGE || '0')
        },
        IDENTITY_LOOKUP_ENABLED: {
          enabled: process.env.ENABLE_IDENTITY_LOOKUP === 'true',
          percentage: parseInt(process.env.IDENTITY_LOOKUP_PERCENTAGE || '0')
        },
        enableTemplates: {
          enabled: process.env.ENABLE_TEMPLATES === 'true',
          percentage: parseInt(process.env.TEMPLATES_PERCENTAGE || '0')
        },
        enableWhatsApp: {
          enabled: process.env.ENABLE_WHATSAPP === 'true',
          percentage: parseInt(process.env.WHATSAPP_PERCENTAGE || '0')
        },
        enableRiskScoring: {
          enabled: process.env.ENABLE_RISK_SCORING === 'true',
          percentage: parseInt(process.env.RISK_SCORING_PERCENTAGE || '0'),
          shadowMode: process.env.RISK_SHADOW_MODE !== 'false'
        }
      }
    };
    
    const timestamp = new Date().toISOString();
    const validUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes
    const version = process.env.CONFIG_VERSION || '1.0.0';
    
    // Create canonical payload for signing
    const payload = JSON.stringify({
      config,
      timestamp,
      validUntil,
      version
    });
    
    // Sign the payload
    const signature = signConfig(payload);
    
    // Set cache headers
    reply.header('Cache-Control', 'public, max-age=300');
    reply.header('X-Config-Signature', signature);
    reply.header('X-Config-Key-Id', currentKeyId);
    
    return reply.send({
      config,
      signature,
      keyId: currentKeyId,
      timestamp,
      validUntil,
      version
    });
  });
  
  // Key rotation endpoint
  fastify.post<{
    Body: KeyRotationRequest;
  }>('/config/admin/rotate-key', {
    schema: {
      description: 'Rotate configuration signing key',
      tags: ['config', 'admin'],
      body: {
        type: 'object',
        required: ['oldKeyId', 'newKeyId', 'newPublicKey', 'adminToken'],
        properties: {
          oldKeyId: { type: 'string' },
          newKeyId: { type: 'string' },
          newPublicKey: { type: 'string' },
          adminToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            newKeyId: { type: 'string' },
            publicKey: { type: 'string' },
            auditId: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { oldKeyId, newKeyId, newPublicKey, adminToken } = request.body;
    
    if (!verifyAdminAccess(adminToken, 'rotate_key')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    
    // Verify old key ID matches
    if (oldKeyId !== currentKeyId) {
      return reply.code(400).send({ error: 'Old key ID mismatch' });
    }
    
    // Generate new key pair
    const newKeyPair = generateKeyPair();
    
    // Create audit entry
    const auditEntry: AdminAuditEntry = {
      id: crypto.randomBytes(16).toString('hex'),
      timestamp: new Date().toISOString(),
      actor: 'admin',
      action: 'key_rotation',
      previousValue: { keyId: oldKeyId },
      newValue: { keyId: newKeyId },
      reason: 'Scheduled key rotation',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    };
    
    // Update keys
    signingKeyPair = newKeyPair;
    currentKeyId = newKeyId;
    
    // Append to audit log
    await appendAuditLog(auditEntry);
    
    fastify.log.warn({
      oldKeyId,
      newKeyId,
      auditId: auditEntry.id
    }, 'Configuration key rotated');
    
    return reply.send({
      success: true,
      newKeyId,
      publicKey: newKeyPair.publicKey,
      auditId: auditEntry.id
    });
  });
  
  // Get current public key
  fastify.get('/config/public-key', {
    schema: {
      description: 'Get current configuration public key',
      tags: ['config'],
      response: {
        200: {
          type: 'object',
          properties: {
            keyId: { type: 'string' },
            publicKey: { type: 'string' },
            algorithm: { type: 'string' },
            validFrom: { type: 'string' },
            validUntil: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    return reply.send({
      keyId: currentKeyId,
      publicKey: signingKeyPair.publicKey,
      algorithm: 'Ed25519',
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    });
  });
  
  // Audit log statistics
  fastify.get<{
    Querystring: {
      adminToken: string;
    };
  }>('/config/admin-audit/stats', {
    schema: {
      description: 'Get audit log statistics',
      tags: ['config', 'admin'],
      querystring: {
        type: 'object',
        required: ['adminToken'],
        properties: {
          adminToken: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            totalEntries: { type: 'number' },
            uniqueActors: { type: 'number' },
            actionCounts: { type: 'object' },
            recentActions: {
              type: 'array',
              items: {
                type: 'object'
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { adminToken } = request.query;
    
    if (!verifyAdminAccess(adminToken, 'read_audit')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    
    try {
      const logContent = await fs.readFile(AUDIT_LOG_PATH, 'utf8');
      const lines = logContent.trim().split('\n').filter(Boolean);
      
      const entries: AdminAuditEntry[] = lines
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as AdminAuditEntry[];
      
      // Calculate statistics
      const uniqueActors = new Set(entries.map(e => e.actor)).size;
      
      const actionCounts = entries.reduce((acc, entry) => {
        acc[entry.action] = (acc[entry.action] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      // Get last 10 actions
      const recentActions = entries
        .slice(-10)
        .reverse()
        .map(e => ({
          id: e.id,
          timestamp: e.timestamp,
          actor: e.actor,
          action: e.action,
          target: e.target
        }));
      
      return reply.send({
        totalEntries: entries.length,
        uniqueActors,
        actionCounts,
        recentActions
      });
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return reply.send({
          totalEntries: 0,
          uniqueActors: 0,
          actionCounts: {},
          recentActions: []
        });
      }
      
      throw error;
    }
  });
};

export default configAdminRoute;