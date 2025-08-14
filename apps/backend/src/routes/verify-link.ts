import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { parsePhoneNumber } from 'libphonenumber-js';
import { getDb } from '../db/db-selector.js';

// Template cache structure
interface TemplateCache {
  smsTemplate: string;
  whatsAppTemplate: string;
  locale: string;
  phoneNumber: string;
  cachedAt: number;
  signature: string;
}

// In-memory cache with 24-hour TTL
const templateCache = new Map<string, TemplateCache>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiting buckets
const deviceRateLimits = new Map<string, { count: number; resetAt: number }>();
const numberRateLimits = new Map<string, { count: number; resetAt: number }>();

// Configuration
const DEVICE_RATE_LIMIT = 60; // 60 actions per hour
const NUMBER_RATE_LIMIT = 3; // 3 actions per 5 minutes  
const DEVICE_WINDOW = 60 * 60 * 1000; // 1 hour
const NUMBER_WINDOW = 5 * 60 * 1000; // 5 minutes

// Template configurations by locale
const TEMPLATES = {
  'en-US': {
    sms: '{name} here. Verify: {link}',
    whatsApp: 'Hey—it\'s {name}. I screen unknown calls. Reply with Name + Reason or tap to verify: {link}'
  },
  'es-ES': {
    sms: 'Soy {name}. Verifica: {link}',
    whatsApp: 'Hola—soy {name}. Filtro llamadas desconocidas. Responde con Nombre + Razón o verifica: {link}'
  },
  'fr-FR': {
    sms: 'C\'est {name}. Vérifiez: {link}',
    whatsApp: 'Salut—c\'est {name}. Je filtre les appels inconnus. Répondez avec Nom + Raison ou vérifiez: {link}'
  }
};

// Request schema
const GetTemplateRequest = Type.Object({
  phone_number: Type.String({ 
    pattern: '^\\+[1-9]\\d{1,14}$',
  }),
  locale: Type.Optional(Type.String({ 
    pattern: '^[a-z]{2}-[A-Z]{2}$',
    default: 'en-US' 
  })),
  device_id: Type.String({
    minLength: 16,
    maxLength: 64,
  }),
  user_name: Type.Optional(Type.String({
    maxLength: 50,
  }))
});

// Response schema
const GetTemplateResponse = Type.Object({
  sms_template: Type.String({ maxLength: 160 }),
  whatsapp_template: Type.String({ maxLength: 1024 }),
  verify_link: Type.String({ format: 'uri' }),
  signature: Type.String({ description: 'JWT signature for integrity' }),
  cached: Type.Boolean(),
  ttl_seconds: Type.Number()
});

// Rate limit response
const RateLimitResponse = Type.Object({
  error: Type.Literal('rate_limited'),
  retry_after: Type.Number({ description: 'Seconds until next request allowed' })
});

// Hash phone number for cache key
function hashPhoneNumber(phoneNumber: string): string {
  return createHash('sha256')
    .update(phoneNumber + process.env.PHONE_SALT || 'default-salt')
    .digest('hex')
    .substring(0, 16);
}

// Check rate limits
function checkRateLimit(deviceId: string, phoneNumber: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  
  // Check device rate limit
  const deviceLimit = deviceRateLimits.get(deviceId);
  if (deviceLimit) {
    if (now < deviceLimit.resetAt) {
      if (deviceLimit.count >= DEVICE_RATE_LIMIT) {
        return { 
          allowed: false, 
          retryAfter: Math.ceil((deviceLimit.resetAt - now) / 1000)
        };
      }
      deviceLimit.count++;
    } else {
      deviceLimit.count = 1;
      deviceLimit.resetAt = now + DEVICE_WINDOW;
    }
  } else {
    deviceRateLimits.set(deviceId, {
      count: 1,
      resetAt: now + DEVICE_WINDOW
    });
  }
  
  // Check number rate limit
  const numberHash = hashPhoneNumber(phoneNumber);
  const numberLimit = numberRateLimits.get(numberHash);
  if (numberLimit) {
    if (now < numberLimit.resetAt) {
      if (numberLimit.count >= NUMBER_RATE_LIMIT) {
        return {
          allowed: false,
          retryAfter: Math.ceil((numberLimit.resetAt - now) / 1000)
        };
      }
      numberLimit.count++;
    } else {
      numberLimit.count = 1;
      numberLimit.resetAt = now + NUMBER_WINDOW;
    }
  } else {
    numberRateLimits.set(numberHash, {
      count: 1,
      resetAt: now + NUMBER_WINDOW
    });
  }
  
  return { allowed: true };
}

// Generate verification link
function generateVerifyLink(phoneNumber: string): string {
  const baseUrl = process.env.WEB_VERIFY_URL || 'https://vfd.link';
  const token = jwt.sign(
    { 
      p: phoneNumber,
      t: Date.now()
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '24h' }
  );
  
  // Use short URL format
  return `${baseUrl}/${token.substring(0, 12)}`;
}

// Generate template signature
function generateSignature(template: TemplateCache): string {
  return jwt.sign(
    {
      sms: template.smsTemplate,
      wa: template.whatsAppTemplate,
      phone: hashPhoneNumber(template.phoneNumber),
      locale: template.locale
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '24h' }
  );
}

export default async function (fastify: FastifyInstance) {
  // GET /v1/verify/link - Get templated messages with caching
  fastify.get<{
    Querystring: typeof GetTemplateRequest.static
  }>('/v1/verify/link', {
    schema: {
      querystring: GetTemplateRequest,
      response: {
        200: GetTemplateResponse,
        400: Type.Object({
          error: Type.String()
        }),
        429: RateLimitResponse
      }
    }
  }, async (request, reply: any) => {
    const { phone_number, locale = 'en-US', device_id, user_name = 'Someone' } = request.query as any;
    
    // Validate phone number
    try {
      const parsed = parsePhoneNumber(phone_number);
      if (!parsed || !parsed.isValid()) {
        return reply.code(400).send({ error: 'invalid_phone_number' });
      }
    } catch {
      return reply.code(400).send({ error: 'invalid_phone_number' });
    }
    
    // Check rate limits
    const rateCheck = checkRateLimit(device_id, phone_number);
    if (!rateCheck.allowed) {
      return reply.code(429).send({
        error: 'rate_limited' as const,
        retry_after: rateCheck.retryAfter!
      });
    }
    
    // Check cache
    const cacheKey = `${hashPhoneNumber(phone_number)}_${locale}`;
    const cached = templateCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.cachedAt) < CACHE_TTL) {
      // Return cached template
      const ttlSeconds = Math.floor((CACHE_TTL - (now - cached.cachedAt)) / 1000);
      
      return reply.send({
        sms_template: cached.smsTemplate,
        whatsapp_template: cached.whatsAppTemplate,
        verify_link: generateVerifyLink(phone_number),
        signature: cached.signature,
        cached: true,
        ttl_seconds: ttlSeconds
      });
    }
    
    // Generate fresh templates
    const templates = TEMPLATES[locale as keyof typeof TEMPLATES] || TEMPLATES['en-US'];
    const verifyLink = generateVerifyLink(phone_number);
    
    // Format templates with user name and link
    const smsTemplate = templates.sms
      .replace('{name}', user_name)
      .replace('{link}', verifyLink);
      
    const whatsAppTemplate = templates.whatsApp
      .replace('{name}', user_name)
      .replace('{link}', verifyLink);
    
    // Validate SMS length (160 chars max)
    if (smsTemplate.length > 160) {
      return reply.code(400).send({ error: 'sms_template_too_long' });
    }
    
    // Create cache entry
    const cacheEntry: TemplateCache = {
      smsTemplate,
      whatsAppTemplate,
      locale,
      phoneNumber: phone_number,
      cachedAt: now,
      signature: ''
    };
    
    // Generate signature
    cacheEntry.signature = generateSignature(cacheEntry);
    
    // Store in cache
    templateCache.set(cacheKey, cacheEntry);
    
    // Clean old cache entries periodically
    if (Math.random() < 0.01) { // 1% chance to clean
      const cutoff = now - CACHE_TTL;
      for (const [key, entry] of templateCache.entries()) {
        if (entry.cachedAt < cutoff) {
          templateCache.delete(key);
        }
      }
    }
    
    return reply.send({
      sms_template: smsTemplate,
      whatsapp_template: whatsAppTemplate,
      verify_link: verifyLink,
      signature: cacheEntry.signature,
      cached: false,
      ttl_seconds: Math.floor(CACHE_TTL / 1000)
    });
  });
  
  // POST /v1/verify/link/invalidate - Clear cache for a number
  fastify.post<{
    Body: { phone_number: string; device_id: string }
  }>('/v1/verify/link/invalidate', {
    schema: {
      body: Type.Object({
        phone_number: Type.String({ pattern: '^\\+[1-9]\\d{1,14}$' }),
        device_id: Type.String({ minLength: 16, maxLength: 64 })
      }),
      response: {
        200: Type.Object({ success: Type.Boolean() })
      }
    }
  }, async (request, reply: any) => {
    const { phone_number } = request.body;
    const phoneHash = hashPhoneNumber(phone_number);
    
    // Clear all locale variants for this number
    const locales = ['en-US', 'es-ES', 'fr-FR'];
    for (const locale of locales) {
      templateCache.delete(`${phoneHash}_${locale}`);
    }
    
    return reply.send({ success: true });
  });
}