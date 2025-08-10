import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { createHmac, timingSafeEqual } from 'crypto';
import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { normalizePhoneNumber, isValidPhoneNumber } from '@verifd/shared';

// Rate limiting store for /verify/start (per-number)
const startRateLimits = new Map<string, { count: number; resetAt: number }>();

// Vanity token mapping (vanityToken -> fullToken)
const vanityTokenMap = new Map<string, { token: string; expiresAt: number }>();

// Used token tracking for single-use enforcement
const usedTokens = new Set<string>();

// Export function to get vanity token mapping
export function getVanityToken(vanityToken: string): { token: string; expiresAt: number } | undefined {
  return vanityTokenMap.get(vanityToken);
}

// Export function to delete expired vanity token
export function deleteVanityToken(vanityToken: string): void {
  vanityTokenMap.delete(vanityToken);
}

function checkStartRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = startRateLimits.get(key);
  
  if (!entry || entry.resetAt < now) {
    startRateLimits.set(key, { count: 1, resetAt: now + 600000 }); // Reset after 10 minutes
    return true;
  }
  
  if (entry.count >= 3) { // 3 attempts per 10 minutes per number
    return false;
  }
  
  entry.count++;
  return true;
}

// Generate HMAC-bound token
function generateSecureToken(payload: string, expiresAt: number): string {
  const token = nanoid(32);
  const hmacData = `${token}:${payload}:${expiresAt}`;
  const hmac = createHmac('sha256', config.hmacSecret).update(hmacData).digest('hex');
  return `${token}:${hmac}`;
}

// Verify HMAC-bound token
function verifySecureToken(secureToken: string, payload: string, expiresAt: number): boolean {
  if (usedTokens.has(secureToken)) {
    return false; // Token already used
  }
  
  const [token, hmac] = secureToken.split(':');
  if (!token || !hmac) return false;
  
  const expectedHmacData = `${token}:${payload}:${expiresAt}`;
  const expectedHmac = createHmac('sha256', config.hmacSecret).update(expectedHmacData).digest('hex');
  
  // Timing-safe comparison
  return hmac.length === expectedHmac.length && timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac));
}

// Mark token as used
function markTokenUsed(secureToken: string): void {
  usedTokens.add(secureToken);
}

// Export for testing
export function clearRateLimits(): void {
  startRateLimits.clear();
}

export function clearUsedTokens(): void {
  usedTokens.clear();
}

// Clean up expired vanity tokens and used tokens periodically
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  
  // Clean up expired vanity tokens
  for (const [vanityToken, data] of vanityTokenMap.entries()) {
    if (data.expiresAt < now) {
      vanityTokenMap.delete(vanityToken);
    }
  }
  
  // Clean up old used tokens (keep for 24 hours to prevent replay)
  const cutoff = now - 86400; // 24 hours ago
  const tokensToRemove = Array.from(usedTokens).filter(token => {
    // Extract creation time from nanoid if possible, otherwise keep all tokens
    // For simplicity, clear all after 24 hours
    return false; // Keep all for now, in production we'd need timestamp tracking
  });
  tokensToRemove.forEach(token => usedTokens.delete(token));
}, 5 * 60 * 1000); // Clean up every 5 minutes

const VerifyStartSchema = z.object({
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  name: z.string().min(1).max(100),
  reason: z.string().min(1).max(500),
  voicePing: z.string().optional() // Base64 encoded audio
});

const VerifySubmitSchema = z.object({
  token: z.string(),
  recipientPhone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  grantPass: z.boolean().default(false)
});

type VerifyStartBody = z.infer<typeof VerifyStartSchema>;
type VerifySubmitBody = z.infer<typeof VerifySubmitSchema>;

// Database result schemas with Zod
const VerificationAttemptRowSchema = z.object({
  status: z.string(),
  expires_at: z.number(),                 // epoch seconds
  completed_at: z.number().nullable(),    // null or epoch seconds
  number_e164: z.string().optional(),     // needed for HMAC verification in submit
  name: z.string().optional(),            // needed for response in submit
  id: z.string().optional(),              // needed for update queries
  reason: z.string().optional(),          // needed for pass creation
});

type VerificationAttemptRow = z.infer<typeof VerificationAttemptRowSchema>;

// Schema for status endpoint result


export const verifyRoutes: FastifyPluginAsync = async (server) => {
  // Start verification process
  server.post<{
    Body: VerifyStartBody;
  }>('/start', async (request, reply) => {
    const body = VerifyStartSchema.parse(request.body);
    
    // Normalize and validate phone number
    if (!isValidPhoneNumber(body.phoneNumber)) {
      return reply.status(400).send({
        error: 'Invalid phone number format'
      });
    }
    const normalizedNumber = normalizePhoneNumber(body.phoneNumber);
    
    // Rate limiting by normalized phone number
    if (!checkStartRateLimit(normalizedNumber)) {
      return reply.status(429).send({
        error: 'Too many verification attempts from this number. Please try again in 10 minutes.'
      });
    }
    
    // Set security headers
    reply.header('Cache-Control', 'no-store');
    reply.header('Vary', 'Origin');
    
    const db = getDb();
    const expiresAt = Math.floor(Date.now() / 1000) + (15 * 60); // 15 minutes
    const secureToken = generateSecureToken(normalizedNumber, expiresAt);
    const vanityToken = nanoid(8); // Shorter token for vanity URL
    
    // Store verification attempt
    const stmt = db.prepare(`
      INSERT INTO verification_attempts 
      (id, number_e164, name, reason, verification_token, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const attemptId = nanoid();
    stmt.run(
      attemptId,
      normalizedNumber,
      body.name,
      body.reason,
      secureToken,
      expiresAt
    );
    
    // Store vanity token mapping
    vanityTokenMap.set(vanityToken, {
      token: secureToken,
      expiresAt: expiresAt
    });
    
    // TODO: Handle voice ping upload if provided
    
    return {
      success: true,
      token: secureToken,
      vanity_url: `/v/${vanityToken}`,
      number_e164: normalizedNumber,
      expires_at: new Date(expiresAt * 1000).toISOString()
    };
  });
  
  // Submit verification and optionally grant pass
  server.post<{
    Body: VerifySubmitBody;
  }>('/submit', async (request, reply) => {
    const body = VerifySubmitSchema.parse(request.body);
    
    const db = getDb();
    
    // Validate token
    const row = db.prepare(`
      SELECT status, expires_at, completed_at, number_e164, name, id, reason
      FROM verification_attempts
      WHERE verification_token = ?
      AND status = 'pending'
      AND expires_at > unixepoch()
    `).get(body.token) as unknown;
    
    if (!row) {
      return reply.status(404).send({
        error: 'Invalid or expired verification token'
      });
    }
    
    // Parse and validate the row with Zod
    const attempt = VerificationAttemptRowSchema.parse(row);
    
    // Verify HMAC signature and check if token is single-use
    if (!verifySecureToken(body.token, attempt.number_e164!, attempt.expires_at)) {
      return reply.status(401).send({
        error: 'Invalid token signature or token already used'
      });
    }
    
    // Mark token as used
    markTokenUsed(body.token);
    
    // Mark attempt as completed
    db.prepare(`
      UPDATE verification_attempts 
      SET status = 'completed', completed_at = unixepoch()
      WHERE id = ?
    `).run(attempt.id);
    
    let passId = null;
    
    // Grant pass if requested
    if (body.grantPass) {
      passId = nanoid();
      const expiresAt = Math.floor(Date.now() / 1000) + (config.vpassExpiryHours * 3600);
      
      db.prepare(`
        INSERT INTO passes 
        (id, number_e164, granted_by, granted_to_name, reason, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        passId,
        attempt.number_e164,
        body.recipientPhone,
        attempt.name,
        attempt.reason,
        expiresAt
      );
    }
    
    return {
      success: true,
      passGranted: body.grantPass,
      passId,
      callerName: attempt.name
    };
  });
  
  // Check verification status
  server.get('/status/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    
    const db = getDb();
    const row = db.prepare(`
      SELECT status, expires_at, completed_at 
      FROM verification_attempts 
      WHERE verification_token = ?
    `).get(token) as unknown;
    
    if (!row) {
      return reply.status(404).send({ error: 'Token not found' });
    }
    
    // Parse and validate the row with Zod
    const attempt = VerificationAttemptRowSchema.parse(row);
    
    return {
      status: attempt.status,
      expired: attempt.expires_at < Math.floor(Date.now() / 1000),
      completedAt: attempt.completed_at
    };
  });

};