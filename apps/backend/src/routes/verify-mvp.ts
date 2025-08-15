import { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';
import type {
  VerifyCodeStartRequest,
  VerifyCodeStartResponse,
  VerifyCodeStatusResponse,
  VerifyCodeSubmitRequest,
  VerifyCodeSubmitResponse,
  PassCheckQueryResponse,
} from '@verifd/shared';
import { getDb } from '../db/index.js';

const verifyMvp: FastifyPluginAsync = async (fastify) => {
  // POST /verify/start - Start a new verification
  fastify.post<{ Body: VerifyCodeStartRequest }>('/start', {
    schema: {
      body: {
        type: 'object',
        properties: {
          phoneNumber: { type: 'string', nullable: true }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            verifyUrl: { type: 'string' },
            expiresIn: { type: 'number' }
          },
          required: ['code', 'verifyUrl', 'expiresIn']
        }
      }
    }
  }, async (request, reply) => {
    const code = nanoid(8); // 8-char code for URL
    const expiresAt = Math.floor(Date.now() / 1000) + 900; // 15 minutes
    const expiresIn = 900; // 15 minutes in seconds

    const db = getDb();
    
    // Store in database
    db.prepare(
      `INSERT INTO verify (code, created_at, expires_at, status, phone_number)
       VALUES (?, ?, ?, 'pending', ?)`
    ).run(code, Math.floor(Date.now() / 1000), expiresAt, request.body.phoneNumber || null);

    const baseUrl = process.env.VERIFY_BASE_URL || 'https://verify.getpryvacy.com';
    const response: VerifyCodeStartResponse = {
      code,
      verifyUrl: `${baseUrl}/v/${code}`,
      expiresIn
    };

    reply.header('Cache-Control', 'no-store');
    reply.header('Vary', 'Origin');
    
    return response;
  });

  // GET /verify/:code - Check status of verification
  fastify.get<{ Params: { code: string } }>('/:code', {
    schema: {
      params: {
        type: 'object',
        properties: {
          code: { type: 'string' }
        },
        required: ['code']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['pending', 'verified', 'expired'] },
            name: { type: 'string', nullable: true },
            reason: { type: 'string', nullable: true }
          },
          required: ['status']
        }
      }
    }
  }, async (request, reply) => {
    const { code } = request.params;
    const db = getDb();

    const row = db.prepare(
      `SELECT status, name, reason, expires_at FROM verify WHERE code = ?`
    ).get(code) as any;

    if (!row) {
      return reply.code(404).send({ error: 'not_found' });
    }

    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    const status = row.expires_at < now ? 'expired' : row.status;

    const response: VerifyCodeStatusResponse = {
      status,
      name: row.name || undefined,
      reason: row.reason || undefined
    };

    reply.header('Cache-Control', 'no-store');
    
    return response;
  });

  // POST /verify/submit - Submit verification details
  fastify.post<{ Body: VerifyCodeSubmitRequest }>('/submit', {
    schema: {
      body: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          reason: { type: 'string' },
          voiceUrl: { type: 'string', nullable: true }
        },
        required: ['code', 'name', 'reason']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' }
          },
          required: ['ok']
        }
      }
    }
  }, async (request, reply) => {
    const { code, name, reason, voiceUrl } = request.body;
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    // Check if code exists and is pending
    const existing = db.prepare(
      `SELECT status, expires_at FROM verify WHERE code = ?`
    ).get(code) as any;

    if (!existing) {
      return reply.code(404).send({ error: 'not_found' });
    }

    if (existing.expires_at < now) {
      return reply.code(400).send({ error: 'expired' });
    }

    if (existing.status !== 'pending') {
      return reply.code(400).send({ error: 'already_verified' });
    }

    // Update verification
    db.prepare(
      `UPDATE verify 
       SET status = 'verified', name = ?, reason = ?, voice_url = ?, verified_at = ?
       WHERE code = ?`
    ).run(name, reason, voiceUrl || null, now, code);

    const response: VerifyCodeSubmitResponse = {
      ok: true
    };

    // Set cache control headers
    reply.header('Cache-Control', 'no-store');
    
    return response;
  });

  // GET /pass/check - Check if a pass exists for a code
  fastify.get<{ Querystring: { code: string } }>('/pass/check', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          code: { type: 'string' }
        },
        required: ['code']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            pass: { 
              type: ['string', 'null'],
              enum: ['30m', '24h', '30d', null]
            }
          },
          required: ['pass']
        }
      }
    }
  }, async (request, reply) => {
    const { code } = request.query;
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    // Check if code is verified
    const verify = db.prepare(
      `SELECT status, verified_at FROM verify WHERE code = ? AND status = 'verified'`
    ).get(code) as any;

    if (!verify) {
      const response: PassCheckQueryResponse = { pass: null };
      reply.header('Cache-Control', 'no-store');
      return response;
    }

    // Calculate pass duration based on time since verification
    const timeSinceVerified = now - verify.verified_at;
    
    let pass: '30m' | '24h' | '30d' | null = null;
    
    if (timeSinceVerified < 1800) { // Less than 30 minutes
      pass = '30m';
    } else if (timeSinceVerified < 86400) { // Less than 24 hours
      pass = '24h';
    } else if (timeSinceVerified < 2592000) { // Less than 30 days
      pass = '30d';
    }

    const response: PassCheckQueryResponse = { pass };
    reply.header('Cache-Control', 'no-store');
    
    return response;
  });

  // Note: Cleanup is now handled by the /sweeper/clean endpoint
  // which should be called by a cron job or external scheduler
};

export default verifyMvp;