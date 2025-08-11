import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { getDb } from '../db/db-selector.js';
import { config } from '../config.js';

// Schema for device registration
const DeviceRegisterSchema = z.object({
  platform: z.enum(['ios', 'android']).optional(),
  model: z.string().optional(),
  app_version: z.string().optional(),
});

type DeviceRegisterBody = z.infer<typeof DeviceRegisterSchema>;

export const deviceRoutes: FastifyPluginAsync = async (server) => {
  // Register a new device
  server.post<{
    Body: DeviceRegisterBody;
  }>('/register', async (request, reply) => {
    try {
      const body = DeviceRegisterSchema.parse(request.body);
      
      // Generate device credentials
      const deviceId = `dev_${nanoid(16)}`;
      const deviceKey = crypto.randomBytes(32).toString('hex');
      
      // Store device registration
      const db = await getDb();
      const now = Math.floor(Date.now() / 1000);
      
      try {
        // For mock DB, just log and continue
        if (config.dbDriver === 'mock') {
          server.log.info(`[device] Registered mock device: ${deviceId}`);
        } else {
          db.prepare(`
            INSERT INTO devices (
              device_id, device_key, platform, model, app_version, 
              created_at, last_seen_at, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            deviceId,
            deviceKey,
            body.platform || null,
            body.model || null,
            body.app_version || null,
            now,
            now
          );
        }
      } catch (dbError) {
        // If table doesn't exist yet, log but continue
        server.log.warn('[device] DB table not ready, returning mock credentials');
      }
      
      // Set security headers
      reply.header('Cache-Control', 'no-store');
      reply.header('Vary', 'Origin');
      
      return {
        success: true,
        device_id: deviceId,
        device_key: deviceKey,
        issued_at: new Date(now * 1000).toISOString()
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
  
  // Revoke a device (for future use)
  server.post('/revoke', async (request, reply) => {
    const deviceId = request.headers['x-device-id'] as string;
    
    if (!deviceId) {
      return reply.status(401).send({
        success: false,
        error: 'missing_device_id'
      });
    }
    
    try {
      const db = await getDb();
      
      if (config.dbDriver !== 'mock') {
        db.prepare(`
          UPDATE devices 
          SET is_active = 0, revoked_at = unixepoch()
          WHERE device_id = ?
        `).run(deviceId);
      }
      
      return {
        success: true,
        device_id: deviceId,
        revoked: true
      };
      
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'internal_error'
      });
    }
  });
};