import { FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { getDb } from '../db/db-selector.js';
import { config } from '../config.js';

interface DeviceAuthHeaders {
  'x-device-id'?: string;
  'x-device-sign'?: string;
  'x-timestamp'?: string;
}

interface DeviceRecord {
  device_key: string;
  is_active: number;
  last_seen_at: number;
}

/**
 * Verify HMAC signature for device authentication
 * 
 * Expected headers:
 * - X-Device-ID: The device identifier
 * - X-Device-Sign: HMAC-SHA256(device_key, method:path:timestamp:body)
 * - X-Timestamp: Unix timestamp in seconds
 */
export async function verifyDeviceAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const headers = request.headers as DeviceAuthHeaders;
  const deviceId = headers['x-device-id'];
  const signature = headers['x-device-sign'];
  const timestamp = headers['x-timestamp'];
  
  // Check required headers
  if (!deviceId || !signature || !timestamp) {
    return reply.status(401).send({
      success: false,
      error: 'missing_auth_headers',
      message: 'Required headers: X-Device-ID, X-Device-Sign, X-Timestamp'
    });
  }
  
  // Check timestamp freshness (5 minute window)
  const now = Math.floor(Date.now() / 1000);
  const reqTimestamp = parseInt(timestamp, 10);
  if (isNaN(reqTimestamp) || Math.abs(now - reqTimestamp) > 300) {
    return reply.status(401).send({
      success: false,
      error: 'invalid_timestamp',
      message: 'Request timestamp is expired or invalid'
    });
  }
  
  try {
    // Get device key from database
    const db = await getDb();
    let deviceKey: string | null = null;
    
    if (config.dbDriver === 'mock') {
      // Mock mode: accept any device with mock key
      deviceKey = 'mock-device-key-for-testing';
    } else {
      const device = db.prepare(`
        SELECT device_key, is_active, last_seen_at
        FROM devices
        WHERE device_id = ?
      `).get(deviceId) as DeviceRecord | undefined;
      
      if (!device || !device.is_active) {
        return reply.status(401).send({
          success: false,
          error: 'invalid_device',
          message: 'Device not found or inactive'
        });
      }
      
      deviceKey = device.device_key;
      
      // Update last seen timestamp
      db.prepare(`
        UPDATE devices 
        SET last_seen_at = unixepoch()
        WHERE device_id = ?
      `).run(deviceId);
    }
    
    // Construct signature payload
    const method = request.method;
    const path = request.url.split('?')[0]; // Remove query params
    const body = request.body ? JSON.stringify(request.body) : '';
    const payload = `${method}:${path}:${timestamp}:${body}`;
    
    // Calculate expected signature
    const expectedSignature = createHmac('sha256', deviceKey)
      .update(payload)
      .digest('hex');
    
    // Timing-safe comparison
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      return reply.status(401).send({
        success: false,
        error: 'invalid_signature',
        message: 'Authentication failed'
      });
    }
    
    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return reply.status(401).send({
        success: false,
        error: 'invalid_signature',
        message: 'Authentication failed'
      });
    }
    
    // Authentication successful - attach device ID to request
    (request as any).deviceId = deviceId;
    
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      error: 'auth_error',
      message: 'Authentication processing failed'
    });
  }
}

/**
 * Optional auth middleware - allows both authenticated and unauthenticated requests
 * Sets request.deviceId if authentication succeeds, otherwise continues without auth
 */
export async function optionalDeviceAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const headers = request.headers as DeviceAuthHeaders;
  const deviceId = headers['x-device-id'];
  
  // If no device ID provided, continue without auth
  if (!deviceId) {
    return;
  }
  
  // Try to authenticate but don't fail the request
  try {
    await verifyDeviceAuth(request, reply);
  } catch (error) {
    // Log but continue
    request.log.warn('Optional auth failed, continuing without authentication');
  }
}