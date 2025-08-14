import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { VerifyStartResponse } from '@verifd/shared';

// Mock database interface
interface MockDatabase {
  prepare: (sql: string) => {
    run: (...args: any[]) => { changes: number };
    get: (...args: any[]) => any;
  };
}

// Mock verification attempts store
let mockVerificationAttempts: Array<{
  id: string;
  number_e164: string;
  name: string;
  reason: string;
  verification_token: string;
  status: string;
  expires_at: number;
}> = [];

// Mock passes store
let mockPasses: Array<{
  id: string;
  number_e164: string;
  granted_by: string;
  granted_to_name: string;
  reason: string;
  expires_at: number;
}> = [];

// Mock the database module
vi.mock('../src/db/index.js', () => ({
  getDb: (): MockDatabase => ({
    prepare: (sql: string) => ({
      run: (...args: any[]) => {
        if (sql.includes('INSERT INTO verification_attempts')) {
          const [id, number_e164, name, reason, verification_token, expires_at] = args;
          mockVerificationAttempts.push({
            id, number_e164, name, reason, verification_token, expires_at,
            status: 'pending'
          });
        } else if (sql.includes('INSERT INTO passes')) {
          const [id, number_e164, granted_by, granted_to_name, reason, expires_at] = args;
          mockPasses.push({
            id, number_e164, granted_by, granted_to_name, reason, expires_at
          });
        } else if (sql.includes('UPDATE verification_attempts')) {
          const [id] = args;
          const attempt = mockVerificationAttempts.find(a => a.id === id);
          if (attempt) attempt.status = 'completed';
        }
        return { changes: 1 };
      },
      get: (...args: any[]) => {
        if (sql.includes('SELECT status, expires_at, completed_at, number_e164, name, id, reason')) {
          const [token] = args;
          const attempt = mockVerificationAttempts.find(a => 
            a.verification_token === token && 
            a.status === 'pending' && 
            a.expires_at > Math.floor(Date.now() / 1000)
          );
          if (attempt) {
            return {
              status: attempt.status,
              expires_at: attempt.expires_at,
              completed_at: null,
              number_e164: attempt.number_e164,
              name: attempt.name,
              id: attempt.id,
              reason: attempt.reason
            };
          }
        }
        return undefined;
      }
    })
  })
}));

describe('HMAC Token Security in /verify (Mocked)', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    // Import after mocking
    const { verifyRoutes } = await import('../src/routes/verify.js');
    
    app = Fastify({ logger: false });
    await app.register(verifyRoutes, { prefix: '/verify' });
    await app.listen({ port: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear mock data between tests
    mockVerificationAttempts = [];
    mockPasses = [];
    
    // Clear rate limits between tests to avoid interference
    const { clearRateLimits, clearUsedTokens } = await import('../src/routes/verify.js');
    clearRateLimits();
    clearUsedTokens();
  });

  it('returns HMAC-bound token in new response format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/verify/start',
      payload: {
        phoneNumber: '+15551234567',
        name: 'John Doe',
        reason: 'Test call'
      }
    });

    expect(response.statusCode).toBe(200);
    const body: VerifyStartResponse = JSON.parse(response.body);
    
    expect(body.success).toBe(true);
    expect(body.token).toContain(':'); // HMAC format token:hmac
    expect(body.vanity_url).toMatch(/^\/v\/[a-zA-Z0-9_-]{8}$/);
    expect(body.number_e164).toBe('+15551234567');
    expect(body.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    
    // Verify headers
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['vary']).toBe('Origin');
  });

  it('enforces per-number rate limiting (3/10min)', async () => {
    const payload = {
      phoneNumber: '+15551234567',
      name: 'John Doe',
      reason: 'Test call'
    };

    // First 3 requests should succeed
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/verify/start',
        payload
      });
      expect(response.statusCode).toBe(200);
    }

    // 4th request should be rate limited
    const response = await app.inject({
      method: 'POST',
      url: '/verify/start',
      payload
    });
    
    expect(response.statusCode).toBe(429);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Too many verification attempts');
    expect(body.error).toContain('10 minutes');
  });

  it('validates phone number format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/verify/start',
      payload: {
        phoneNumber: '123', // Invalid format
        name: 'John Doe',
        reason: 'Test call'
      }
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Invalid phone number format');
  });

  it('handles successful verification flow', async () => {
    // Start verification
    const startResponse = await app.inject({
      method: 'POST',
      url: '/verify/start',
      payload: {
        phoneNumber: '+15551234567',
        name: 'John Doe',
        reason: 'Test call'
      }
    });

    expect(startResponse.statusCode).toBe(200);
    const startBody: VerifyStartResponse = JSON.parse(startResponse.body);

    // Submit verification (should succeed first time)
    const submitResponse = await app.inject({
      method: 'POST',
      url: '/verify/submit',
      payload: {
        token: startBody.token,
        recipientPhone: '+15559876543',
        grantPass: true
      }
    });

    expect(submitResponse.statusCode).toBe(200);
    const submitBody = JSON.parse(submitResponse.body);
    expect(submitBody.success).toBe(true);
    expect(submitBody.passGranted).toBe(true);
    expect(submitBody.callerName).toBe('John Doe');
  });
});