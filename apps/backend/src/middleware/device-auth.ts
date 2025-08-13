import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';

interface DeviceAuthConfig {
  secret: string;
  maxAge: number; // Max age of HMAC in ms
  rateLimits: {
    perIp: {
      max: number;
      window: number; // ms
    };
    perDevice: {
      max: number;
      window: number; // ms
    };
  };
}

interface AuthenticatedRequest extends FastifyRequest {
  deviceId?: string;
  deviceAuth?: {
    verified: boolean;
    timestamp: number;
  };
}

// Rate limit storage (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Device Authentication Plugin
 * 
 * Enforces HMAC device auth on protected endpoints
 * with per-IP and per-device rate limiting
 */
const deviceAuthPlugin: FastifyPluginAsync<Partial<DeviceAuthConfig>> = async (
  fastify,
  options
) => {
  const config: DeviceAuthConfig = {
    secret: options.secret || process.env.DEVICE_AUTH_SECRET || 'dev-secret',
    maxAge: options.maxAge || 5 * 60 * 1000, // 5 minutes
    rateLimits: options.rateLimits || {
      perIp: {
        max: 100,
        window: 60 * 1000 // 1 minute
      },
      perDevice: {
        max: 50,
        window: 60 * 1000 // 1 minute
      }
    }
  };
  
  /**
   * Generate HMAC for device authentication
   */
  function generateDeviceHMAC(
    deviceId: string,
    timestamp: number,
    nonce: string
  ): string {
    const payload = `${deviceId}:${timestamp}:${nonce}`;
    return crypto
      .createHmac('sha256', config.secret)
      .update(payload)
      .digest('hex');
  }
  
  /**
   * Verify device HMAC
   */
  function verifyDeviceHMAC(
    deviceId: string,
    timestamp: number,
    nonce: string,
    providedHmac: string
  ): boolean {
    // Check timestamp freshness
    const now = Date.now();
    if (Math.abs(now - timestamp) > config.maxAge) {
      return false;
    }
    
    // Verify HMAC
    const expectedHmac = generateDeviceHMAC(deviceId, timestamp, nonce);
    return crypto.timingSafeEqual(
      Buffer.from(providedHmac),
      Buffer.from(expectedHmac)
    );
  }
  
  /**
   * Check rate limits
   */
  function checkRateLimit(
    key: string,
    limit: number,
    window: number
  ): boolean {
    const now = Date.now();
    const entry = rateLimitStore.get(key);
    
    if (!entry || entry.resetAt < now) {
      // New window
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + window
      });
      return true;
    }
    
    if (entry.count >= limit) {
      return false;
    }
    
    entry.count++;
    return true;
  }
  
  /**
   * Device authentication middleware
   */
  async function authenticateDevice(
    request: AuthenticatedRequest,
    reply: FastifyReply
  ): Promise<void> {
    const authHeader = request.headers['x-device-auth'];
    const deviceId = request.headers['x-device-id'] as string;
    
    if (!authHeader || !deviceId) {
      return reply.code(401).send({
        error: 'Missing device authentication',
        code: 'MISSING_DEVICE_AUTH'
      });
    }
    
    // Parse auth header: HMAC timestamp:nonce:signature
    const authString = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const match = authString.match(/^HMAC (\d+):([a-f0-9]+):([a-f0-9]+)$/);
    if (!match) {
      return reply.code(401).send({
        error: 'Invalid authentication format',
        code: 'INVALID_AUTH_FORMAT'
      });
    }
    
    const [, timestampStr, nonce, hmac] = match;
    const timestamp = parseInt(timestampStr, 10);
    
    // Verify HMAC
    if (!verifyDeviceHMAC(deviceId, timestamp, nonce, hmac)) {
      fastify.log.warn({
        deviceId,
        ip: request.ip
      }, 'Invalid device HMAC');
      
      return reply.code(401).send({
        error: 'Invalid device authentication',
        code: 'INVALID_DEVICE_AUTH'
      });
    }
    
    // Check per-IP rate limit
    const ipKey = `ip:${request.ip}`;
    if (!checkRateLimit(ipKey, config.rateLimits.perIp.max, config.rateLimits.perIp.window)) {
      return reply.code(429).send({
        error: 'IP rate limit exceeded',
        code: 'IP_RATE_LIMIT',
        retryAfter: Math.ceil(config.rateLimits.perIp.window / 1000)
      });
    }
    
    // Check per-device rate limit
    const deviceKey = `device:${deviceId}`;
    if (!checkRateLimit(deviceKey, config.rateLimits.perDevice.max, config.rateLimits.perDevice.window)) {
      return reply.code(429).send({
        error: 'Device rate limit exceeded',
        code: 'DEVICE_RATE_LIMIT',
        retryAfter: Math.ceil(config.rateLimits.perDevice.window / 1000)
      });
    }
    
    // Attach device info to request
    request.deviceId = deviceId;
    request.deviceAuth = {
      verified: true,
      timestamp
    };
  }
  
  // Register as decorator
  fastify.decorate('authenticateDevice', authenticateDevice);
  
  // Clean up old rate limit entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 1000); // Every minute
};

/**
 * Apply device auth to specific routes
 */
export async function applyDeviceAuth(
  fastify: any,
  routes: string[]
): Promise<void> {
  fastify.addHook('preHandler', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    // Check if route requires auth
    const requiresAuth = routes.some(route => 
      request.url.startsWith(route)
    );
    
    if (requiresAuth) {
      await fastify.authenticateDevice(request, reply);
    }
  });
}

/**
 * Generate client credentials for SDK
 */
export function generateClientCredentials(deviceId: string): {
  deviceId: string;
  secret: string;
  expiresAt: string;
} {
  const secret = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  return {
    deviceId,
    secret,
    expiresAt: expiresAt.toISOString()
  };
}

/**
 * Client-side HMAC generator (for SDK)
 */
export class DeviceAuthClient {
  constructor(
    private readonly deviceId: string,
    private readonly secret: string
  ) {}
  
  generateAuthHeader(): string {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const hmac = this.generateHMAC(timestamp, nonce);
    
    return `HMAC ${timestamp}:${nonce}:${hmac}`;
  }
  
  private generateHMAC(timestamp: number, nonce: string): string {
    const payload = `${this.deviceId}:${timestamp}:${nonce}`;
    return crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');
  }
}

export default deviceAuthPlugin;