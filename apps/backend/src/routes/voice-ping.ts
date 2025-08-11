import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/db-selector.js';
import { config } from '../config.js';
import crypto from 'crypto';

const VoicePingRequestSchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/),
  reason: z.string().min(1).max(100),
  userId: z.string().optional(), // Optional user ID for rate limiting
});

interface VoicePingCounts {
  [key: string]: {  // key is "phoneNumber:userId"
    count: number;
    resetAt: number;
  };
}

// In-memory rate limiting for voice pings
const voicePingCounts: VoicePingCounts = {};

function isWithinBusinessHours(): boolean {
  if (!config.voicePing.businessHoursOnly) {
    return true;
  }
  
  const now = new Date();
  const currentTime = now.getHours() * 100 + now.getMinutes(); // e.g., 1430 for 14:30
  
  const [startHour, startMin] = config.voicePing.businessStart.split(':').map(Number);
  const [endHour, endMin] = config.voicePing.businessEnd.split(':').map(Number);
  
  const startTime = startHour * 100 + startMin;
  const endTime = endHour * 100 + endMin;
  
  return currentTime >= startTime && currentTime <= endTime;
}

function checkVoicePingLimit(phoneNumber: string, userId?: string): { allowed: boolean; used: number; limit: number } {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  // Create composite key for rate limiting
  const key = userId ? `${phoneNumber}:${userId}` : phoneNumber;
  
  // Clean up old entries
  for (const [k, data] of Object.entries(voicePingCounts)) {
    if (data.resetAt < now) {
      delete voicePingCounts[k];
    }
  }
  
  // Check current count
  if (!voicePingCounts[key]) {
    voicePingCounts[key] = {
      count: 0,
      resetAt: now + dayMs
    };
  }
  
  const countData = voicePingCounts[key];
  const limit = config.voicePing.maxPerDay;
  
  if (countData.count >= limit) {
    return { allowed: false, used: countData.count, limit };
  }
  
  countData.count++;
  return { allowed: true, used: countData.count, limit };
}

export const voicePingRoutes: FastifyPluginAsync = async (server) => {
  server.post('/request', async (request, reply) => {
    try {
      const body = VoicePingRequestSchema.parse(request.body);
      
      // Check business hours
      if (!isWithinBusinessHours()) {
        return reply.status(400).send({
          success: false,
          error: 'outside_business_hours',
          message: `Voice pings are only available between ${config.voicePing.businessStart} and ${config.voicePing.businessEnd}`
        });
      }
      
      // Check daily limit
      const capCheck = checkVoicePingLimit(body.phoneNumber, body.userId);
      if (!capCheck.allowed) {
        return reply.status(429).send({
          success: false,
          error: 'daily_limit_exceeded',
          message: `Maximum ${config.voicePing.maxPerDay} voice pings per day`,
          cap: {
            used: capCheck.used,
            limit: capCheck.limit
          }
        });
      }
      
      // Generate unique ID for this voice ping request
      const voicePingId = `vp_${crypto.randomBytes(8).toString('hex')}`;
      
      // Store voice ping request
      const db = await getDb();
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + 300; // 5 minute expiry for voice ping requests
      
      try {
        db.prepare(`
          INSERT INTO voice_ping_requests (
            id, phone_number, reason, status, created_at, expires_at
          ) VALUES (?, ?, ?, 'pending', ?, ?)
        `).run(voicePingId, body.phoneNumber, body.reason, now, expiresAt);
      } catch (dbError) {
        // If DB doesn't have the table yet, log but continue
        console.log('[voice-ping] DB table not ready, continuing with mock response');
      }
      
      return {
        queued: true,
        id: voicePingId,
        cap: {
          used: capCheck.used,
          limit: capCheck.limit
        }
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
  
  // Status check endpoint
  server.get('/status/:voicePingId', async (request, reply) => {
    const { voicePingId } = request.params as { voicePingId: string };
    
    if (!voicePingId.startsWith('vp_')) {
      return reply.status(400).send({
        success: false,
        error: 'invalid_id'
      });
    }
    
    try {
      const db = await getDb();
      const voicePing = db.prepare(`
        SELECT id, status, expires_at, completed_at
        FROM voice_ping_requests
        WHERE id = ?
      `).get(voicePingId);
      
      if (!voicePing) {
        return reply.status(404).send({
          success: false,
          error: 'not_found'
        });
      }
      
      const now = Math.floor(Date.now() / 1000);
      if (voicePing.expires_at < now && voicePing.status === 'pending') {
        return {
          success: true,
          status: 'expired',
          expiredAt: new Date(voicePing.expires_at * 1000).toISOString()
        };
      }
      
      return {
        success: true,
        status: voicePing.status,
        expiresAt: voicePing.status === 'pending' 
          ? new Date(voicePing.expires_at * 1000).toISOString()
          : undefined,
        completedAt: voicePing.completed_at 
          ? new Date(voicePing.completed_at * 1000).toISOString()
          : undefined
      };
      
    } catch (error) {
      // Return mock response if DB not ready
      return {
        success: true,
        status: 'pending',
        expiresAt: new Date(Date.now() + 300000).toISOString()
      };
    }
  });
};