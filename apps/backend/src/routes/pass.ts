import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { normalizePhoneNumber, isValidPhoneNumber } from '@verifd/shared';
import type { PassCheckResponse } from '@verifd/shared';
import { PrivacyLogger, hashPhoneNumber } from '../log.js';

const CheckPassSchema = z.object({
  fromNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  toNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/)
});

type CheckPassBody = z.infer<typeof CheckPassSchema>;

// Database result schemas with Zod
const PassRowSchema = z.object({
  id: z.string(),
  granted_to_name: z.string(),
  reason: z.string(),
  expires_at: z.number(), // epoch seconds
});

type PassRow = z.infer<typeof PassRowSchema>;

// Schema for sync endpoint
const SyncPassRowSchema = z.object({
  id: z.string(),
  number_e164: z.string(),
  granted_to_name: z.string(),
  expires_at: z.number(),
  created_at: z.number(),
  channel: z.string()
});

type SyncPassRow = z.infer<typeof SyncPassRowSchema>;

// Rate limiting stores
const ipRateLimits = new Map<string, { count: number; resetAt: number }>();
const numberRateLimits = new Map<string, { count: number; resetAt: number }>();

// Rate limit config from ENV
const PASSCHECK_RPM_IP = parseInt(process.env.PASSCHECK_RPM_IP || '5', 10);
const PASSCHECK_RPM_NUMBER = parseInt(process.env.PASSCHECK_RPM_NUMBER || '10', 10);

function checkRateLimit(key: string, store: Map<string, any>, limit: number): boolean {
  const now = Date.now();
  const entry = store.get(key);
  
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + 60000 }); // Reset after 1 minute
    return true;
  }
  
  if (entry.count >= limit) {
    return false;
  }
  
  entry.count++;
  return true;
}

// Export for testing
export function clearRateLimits() {
  ipRateLimits.clear();
  numberRateLimits.clear();
}

export const passRoutes: FastifyPluginAsync = async (server) => {
  // GET /pass/check endpoint - Check if a vPass exists for a number
  server.get<{
    Querystring: { number_e164?: string; phoneNumber?: string };
    Reply: PassCheckResponse | { error: string };
  }>('/check', async (request, reply: any) => {
    // Extract IP for rate limiting
    const clientIp = request.ip;
    
    // Check IP rate limit
    if (!checkRateLimit(clientIp, ipRateLimits, PASSCHECK_RPM_IP)) {
      PrivacyLogger.warn(`Rate limit exceeded for IP: ${clientIp}`);
      return reply.status(429).send({ error: 'rate_limited' });
    }
    
    // Support both number_e164 (primary) and phoneNumber (deprecated alias)
    const { number_e164, phoneNumber } = request.query;
    const phoneToCheck = number_e164 || phoneNumber;
    
    if (!phoneToCheck || !isValidPhoneNumber(phoneToCheck)) {
      return reply.status(400).send({ error: 'bad_number' });
    }
    
    const normalizedNumber = normalizePhoneNumber(phoneToCheck);
    
    // Check number rate limit
    if (!checkRateLimit(normalizedNumber, numberRateLimits, PASSCHECK_RPM_NUMBER)) {
      PrivacyLogger.warn(`Rate limit exceeded for number: ${normalizedNumber}`);
      return reply.status(429).send({ error: 'rate_limited' });
    }
    
    // Query database for active passes
    const db = getDb();
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    
    const pass = db.prepare(`
      SELECT id, expires_at, created_at
      FROM passes 
      WHERE number_e164 = ? 
      AND expires_at > ?
      ORDER BY expires_at DESC
      LIMIT 1
    `).get(normalizedNumber, nowSec) as { id: string; expires_at: number; created_at: number } | undefined;
    
    // Set response headers (Vary: Origin handled by CORS plugin)
    reply.header('Cache-Control', 'no-store');
    reply.header('Content-Type', 'application/json');
    
    if (!pass) {
      PrivacyLogger.debug(`No active pass found for number: ${normalizedNumber}`);
      return { allowed: false } as PassCheckResponse;
    }

    PrivacyLogger.info(`Active pass found for number: ${normalizedNumber}, expires: ${pass.expires_at}`);
    
    // Calculate scope based on pass duration
    const duration = pass.expires_at - pass.created_at;
    let scope: '30m' | '24h' | '30d';
    
    if (duration <= 1800) { // 30 minutes
      scope = '30m';
    } else if (duration <= 86400) { // 24 hours
      scope = '24h';
    } else { // 30 days
      scope = '30d';
    }
    
    // Return pass info with ISO8601 timestamp
    const response: PassCheckResponse = {
      allowed: true,
      scope,
      expires_at: new Date(pass.expires_at * 1000).toISOString()
    };
    
    return response;
  });
  
  // Check if a valid pass exists
  server.post<{
    Body: CheckPassBody;
  }>('/check', async (request, reply: any) => {
    const body = CheckPassSchema.parse(request.body);
    
    const db = getDb();
    const row = db.prepare(`
      SELECT
        id,
        granted_to_name,
        reason,
        expires_at
      FROM passes
      WHERE number_e164 = ?
        AND granted_by = ?
        AND expires_at > unixepoch()
        AND (max_uses IS NULL OR used_count < max_uses)
      ORDER BY expires_at DESC
      LIMIT 1
    `).get(body.fromNumber, body.toNumber) as unknown;
    
    if (!row) {
      return {
        hasValidPass: false
      };
    }
    
    // Parse and validate the row with Zod
    const pass = PassRowSchema.parse(row);
    
    // Increment usage count
    db.prepare(`
      UPDATE passes 
      SET used_count = used_count + 1 
      WHERE id = ?
    `).run(pass.id);
    
    // Log the call
    db.prepare(`
      INSERT INTO call_logs (id, from_number, to_number, pass_id, blocked)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      `cl_${Date.now()}`,
      body.fromNumber,
      body.toNumber,
      pass.id,
      0
    );
    
    return {
      hasValidPass: true,
      passId: pass.id,
      callerName: pass.granted_to_name,
      reason: pass.reason,
      expiresAt: pass.expires_at
    };
  });
  
  // List active passes for a phone number
  server.get('/list/:phoneNumber', async (request, reply: any) => {
    const { phoneNumber } = request.params as { phoneNumber: string };
    
    const db = getDb();
    const passes = db.prepare(`
      SELECT 
        id,
        number_e164,
        granted_to_name,
        reason,
        expires_at,
        created_at,
        used_count,
        max_uses
      FROM passes 
      WHERE granted_by = ?
      AND expires_at > unixepoch()
      ORDER BY created_at DESC
    `).all(phoneNumber);
    
    return {
      passes,
      count: passes.length
    };
  });
  
  // Revoke a pass
  server.delete('/:passId', async (request, reply: any) => {
    const { passId } = request.params as { passId: string };
    
    const db = getDb();
    const result = db.prepare(`
      UPDATE passes 
      SET expires_at = unixepoch() - 1
      WHERE id = ?
    `).run(passId);
    
    if (result.changes === 0) {
      return reply.status(404).send({ error: 'Pass not found' });
    }
    
    return { success: true, revoked: passId };
  });
  
  // Grant a pass directly (device-initiated)
  server.post('/grant', {
    preHandler: async (request, reply: any) => {
      // Require device authentication
      const { verifyDeviceAuth } = await import('../middleware/auth.js');
      await verifyDeviceAuth(request, reply);
    }
  }, async (request, reply: any) => {
    const GrantPassSchema = z.object({
      number_e164: z.string().regex(/^\+[1-9]\d{1,14}$/),
      scope: z.enum(['30m', '24h', '30d']).default('24h'),
      granted_to_name: z.string().min(1).max(100).optional(),
      reason: z.string().min(1).max(500).optional(),
      channel: z.enum(['device', 'sms', 'wa', 'voice']).default('device')
    });
    
    try {
      const body = GrantPassSchema.parse(request.body);
      const deviceId = (request as any).deviceId;
      
      // Calculate expiry based on scope
      const now = Math.floor(Date.now() / 1000);
      let expiresAt: number;
      switch (body.scope) {
        case '30m':
          expiresAt = now + (30 * 60);
          break;
        case '24h':
          expiresAt = now + (24 * 60 * 60);
          break;
        case '30d':
          expiresAt = now + (30 * 24 * 60 * 60);
          break;
        default:
          expiresAt = now + (24 * 60 * 60);
      }
      
      const passId = nanoid();
      const db = getDb();
      
      db.prepare(`
        INSERT INTO passes (
          id, number_e164, granted_to_name, reason, 
          expires_at, created_at, granted_by, channel
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        passId,
        body.number_e164,
        body.granted_to_name || 'Device User',
        body.reason || 'Granted via device',
        expiresAt,
        now,
        deviceId || 'device',
        body.channel
      );
      
      // Set security headers
      reply.header('Cache-Control', 'no-store');
      reply.header('Vary', 'Origin');
      
      return {
        success: true,
        pass_id: passId,
        expires_at: new Date(expiresAt * 1000).toISOString(),
        scope: body.scope
      };
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'validation_error',
          details: error.errors
        });
      }
      
      server.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'internal_error'
      });
    }
  });
  
  // Get passes since timestamp (for sync)
  server.get('/since', {
    preHandler: async (request, reply: any) => {
      // Require device authentication
      const { verifyDeviceAuth } = await import('../middleware/auth.js');
      await verifyDeviceAuth(request, reply);
    }
  }, async (request, reply: any) => {
    const query = request.query as { ts?: string };
    const timestamp = parseInt(query.ts || '0', 10);
    
    if (isNaN(timestamp)) {
      return reply.status(400).send({
        success: false,
        error: 'invalid_timestamp'
      });
    }
    
    const deviceId = (request as any).deviceId;
    const db = getDb();
    
    // Get passes created or modified since timestamp
    const passesRaw = db.prepare(`
      SELECT 
        id,
        number_e164,
        granted_to_name,
        expires_at,
        created_at,
        channel
      FROM passes
      WHERE created_at > ?
      AND expires_at > unixepoch()
      AND (granted_by = ? OR channel = 'device')
      ORDER BY created_at DESC
      LIMIT 100
    `).all(timestamp, deviceId) as unknown[];
    
    // Parse with Zod
    const passes = passesRaw.map(row => SyncPassRowSchema.parse(row));
    
    // Set security headers
    reply.header('Cache-Control', 'no-store');
    reply.header('Vary', 'Origin');
    
    return {
      success: true,
      passes: passes.map(p => ({
        id: p.id,
        number_e164: p.number_e164,
        name: p.granted_to_name,
        expires_at: new Date(p.expires_at * 1000).toISOString(),
        created_at: new Date(p.created_at * 1000).toISOString(),
        channel: p.channel
      })),
      count: passes.length,
      timestamp: Math.floor(Date.now() / 1000)
    };
  });
};