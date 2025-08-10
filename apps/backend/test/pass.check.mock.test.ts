import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import type { PassCheckResponse } from '@verifd/shared';

// Mock database interface
interface MockDatabase {
  prepare: (sql: string) => {
    get: (phoneNumber: string, nowSec: number) => any;
  };
}

// Mock the database module
vi.mock('../src/db/index.js', () => ({
  getDb: (): MockDatabase => ({
    prepare: (sql: string) => ({
      get: (phoneNumber: string, nowSec: number) => mockDbGet(phoneNumber, nowSec)
    })
  })
}));

// Mock data store
let mockPasses: Array<{ id: string; expires_at: number; created_at: number; number_e164: string }> = [];

function mockDbGet(phoneNumber: string, nowSec: number) {
  return mockPasses
    .filter(pass => pass.number_e164 === phoneNumber && pass.expires_at > nowSec)
    .sort((a, b) => b.expires_at - a.expires_at)[0] || undefined;
}

describe('GET /pass/check - Integration Tests (Mocked)', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    // Import after mocking
    const { passRoutes } = await import('../src/routes/pass.js');
    
    app = Fastify({ logger: false });
    await app.register(passRoutes, { prefix: '/pass' });
    await app.listen({ port: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear mock data between tests
    mockPasses = [];
    
    // Clear rate limits between tests to avoid interference
    const { clearRateLimits } = await import('../src/routes/pass.js');
    clearRateLimits();
  });

  it('returns allowed=false for unknown number', async () => {
    mockPasses = []; // Clear mock data

    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551234567'
    });

    expect(response.statusCode).toBe(200);
    const body: PassCheckResponse = JSON.parse(response.body);
    expect(body).toEqual({ allowed: false });
  });

  it('returns allowed=true for active pass', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = nowSec + 3600; // 1 hour from now

    mockPasses = [{
      id: 'pass_123',
      number_e164: '+15551234567',
      expires_at: expiresAt,
      created_at: nowSec
    }];

    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551234567'
    });

    expect(response.statusCode).toBe(200);
    const body: PassCheckResponse = JSON.parse(response.body);
    expect(body.allowed).toBe(true);
    expect(body.scope).toBe('24h'); // 1 hour = 24h scope
    expect(body.expires_at).toBeDefined();
  });

  it('returns allowed=false for expired pass', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredAt = nowSec - 3600; // Expired 1 hour ago

    mockPasses = [{
      id: 'pass_expired',
      number_e164: '+15551234567',
      expires_at: expiredAt,
      created_at: expiredAt - 7200
    }];

    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551234567'
    });

    expect(response.statusCode).toBe(200);
    const body: PassCheckResponse = JSON.parse(response.body);
    expect(body).toEqual({ allowed: false });
  });

  it('returns 400 for invalid phone number', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=123'
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body).toEqual({ error: 'bad_number' });
  });

  it('includes Cache-Control header', async () => {
    mockPasses = [];

    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551234567'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('correctly identifies 30m scope', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    
    mockPasses = [{
      id: 'pass_30m',
      number_e164: '+15551111111',
      expires_at: nowSec + 1800, // 30 minutes
      created_at: nowSec
    }];

    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551111111'
    });

    expect(response.statusCode).toBe(200);
    const body: PassCheckResponse = JSON.parse(response.body);
    expect(body.allowed).toBe(true);
    expect(body.scope).toBe('30m');
  });

  it('correctly identifies 30d scope', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    
    mockPasses = [{
      id: 'pass_30d',
      number_e164: '+15553333333',
      expires_at: nowSec + 2592000, // 30 days
      created_at: nowSec
    }];

    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15553333333'
    });

    expect(response.statusCode).toBe(200);
    const body: PassCheckResponse = JSON.parse(response.body);
    expect(body.allowed).toBe(true);
    expect(body.scope).toBe('30d');
  });

  it('supports deprecated phoneNumber parameter', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    mockPasses = [{
      id: 'pass_legacy',
      number_e164: '+15551234567',
      expires_at: nowSec + 3600,
      created_at: nowSec
    }];

    // Test using deprecated phoneNumber parameter
    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?phoneNumber=%2B15551234567'
    });

    expect(response.statusCode).toBe(200);
    const body: PassCheckResponse = JSON.parse(response.body);
    expect(body.allowed).toBe(true);
    expect(body.scope).toBe('24h');
  });

  it('prioritizes number_e164 over phoneNumber when both provided', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    
    // Only create pass for the first number
    mockPasses = [{
      id: 'pass_priority',
      number_e164: '+15551111111',
      expires_at: nowSec + 3600,
      created_at: nowSec
    }];

    // Request with both parameters - number_e164 should take precedence
    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551111111&phoneNumber=%2B15552222222'
    });

    expect(response.statusCode).toBe(200);
    const body: PassCheckResponse = JSON.parse(response.body);
    expect(body.allowed).toBe(true); // Should find pass for +15551111111
  });
});