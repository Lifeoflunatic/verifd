import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { config } from '../config.js';

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

export const verifyRoutes: FastifyPluginAsync = async (server) => {
  // Start verification process
  server.post('/start', async (request, reply) => {
    const body = VerifyStartSchema.parse(request.body);
    
    const db = getDb();
    const token = nanoid(32);
    const expiresAt = Math.floor(Date.now() / 1000) + (15 * 60); // 15 minutes
    
    // Store verification attempt
    const stmt = db.prepare(`
      INSERT INTO verification_attempts 
      (id, phone_number, name, reason, verification_token, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const attemptId = nanoid();
    stmt.run(
      attemptId,
      body.phoneNumber,
      body.name,
      body.reason,
      token,
      expiresAt
    );
    
    // TODO: Handle voice ping upload if provided
    
    return {
      success: true,
      token,
      verifyUrl: `${config.corsOrigin}/verify/${token}`,
      expiresIn: 900 // seconds
    };
  });
  
  // Submit verification and optionally grant pass
  server.post('/submit', async (request, reply) => {
    const body = VerifySubmitSchema.parse(request.body);
    
    const db = getDb();
    
    // Validate token
    const attempt = db.prepare(`
      SELECT * FROM verification_attempts 
      WHERE verification_token = ? 
      AND status = 'pending'
      AND expires_at > unixepoch()
    `).get(body.token);
    
    if (!attempt) {
      return reply.status(404).send({
        error: 'Invalid or expired verification token'
      });
    }
    
    // Mark as completed
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
        (id, phone_number, granted_by, granted_to_name, reason, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        passId,
        attempt.phone_number,
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
    const attempt = db.prepare(`
      SELECT status, expires_at, completed_at 
      FROM verification_attempts 
      WHERE verification_token = ?
    `).get(token);
    
    if (!attempt) {
      return reply.status(404).send({ error: 'Token not found' });
    }
    
    return {
      status: attempt.status,
      expired: attempt.expires_at < Math.floor(Date.now() / 1000),
      completedAt: attempt.completed_at
    };
  });
};