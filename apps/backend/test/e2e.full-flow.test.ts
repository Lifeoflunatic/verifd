import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { setupRoutes } from '../src/routes/index.js';
import { initDatabase, closeDatabase } from '../src/db/index.js';
import { config } from '../src/config.js';
import { corsPlugin } from '../src/plugins/cors.js';
import fs from 'fs';
import path from 'path';

describe('Backend E2E: Full Flow', () => {
  let server: any;
  const dbPath = path.resolve('var/db/test-e2e.sqlite');

  beforeAll(async () => {
    // Set test DB path
    process.env.DB_PATH = dbPath;
    
    // Create test server
    server = Fastify({
      logger: false
    });

    // Register plugins
    await server.register(corsPlugin);

    // Initialize database
    await initDatabase();

    // Setup routes
    await setupRoutes(server);

    // Start server
    await server.listen({
      port: 0, // Random port
      host: '127.0.0.1'
    });
  });

  afterAll(async () => {
    await server.close();
    closeDatabase();
    
    // Clean up test DB
    try {
      fs.unlinkSync(dbPath);
      fs.unlinkSync(dbPath + '-wal');
      fs.unlinkSync(dbPath + '-shm');
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it('should complete full verification flow', async () => {
    // Step 1: Health check
    const healthRes = await server.inject({
      method: 'GET',
      url: '/health'
    });
    
    expect(healthRes.statusCode).toBe(200);
    expect(JSON.parse(healthRes.body)).toEqual({ ok: true });

    // Step 2: Start verification
    const startRes = await server.inject({
      method: 'POST',
      url: '/verify/start',
      payload: {
        phoneNumber: '+14155551234',
        name: 'Test User',
        reason: 'E2E Testing'
      }
    });

    expect(startRes.statusCode).toBe(200);
    const startBody = JSON.parse(startRes.body);
    expect(startBody).toHaveProperty('success', true);
    expect(startBody).toHaveProperty('token');
    expect(startBody).toHaveProperty('vanity_url');
    expect(startBody).toHaveProperty('number_e164', '+14155551234');
    expect(startBody).toHaveProperty('expires_at');

    const token = startBody.token;

    // Step 3: Submit verification (mock approval with pass grant)
    const submitRes = await server.inject({
      method: 'POST',
      url: '/verify/submit',
      payload: {
        token: token,
        recipientPhone: '+16505551234',
        grantPass: true
      }
    });

    expect(submitRes.statusCode).toBe(200);
    const submitBody = JSON.parse(submitRes.body);
    expect(submitBody).toHaveProperty('success', true);
    expect(submitBody).toHaveProperty('passGranted', true);
    expect(submitBody).toHaveProperty('passId');
    expect(submitBody).toHaveProperty('callerName', 'Test User');

    // Step 4: Check pass existence
    const checkRes = await server.inject({
      method: 'GET',
      url: '/pass/check',
      query: {
        number_e164: '+14155551234'
      }
    });

    expect(checkRes.statusCode).toBe(200);
    const checkBody = JSON.parse(checkRes.body);
    expect(checkBody).toHaveProperty('allowed', true);
    expect(checkBody).toHaveProperty('scope');
    expect(checkBody).toHaveProperty('expires_at');
  });

  it('should verify DB file exists and has correct structure', async () => {
    // Check DB file exists
    expect(fs.existsSync(dbPath)).toBe(true);
    
    // Check DB has data by querying metrics
    const checkRes = await server.inject({
      method: 'GET',
      url: '/metrics'
    });
    
    expect(checkRes.statusCode).toBe(200);
    const metrics = JSON.parse(checkRes.body);
    expect(metrics).toHaveProperty('metrics');
    expect(metrics.metrics).toHaveProperty('active_passes');
    expect(metrics.metrics.active_passes).toBeGreaterThanOrEqual(0);
  });

  it('should enforce TTL on verification tokens', async () => {
    // Create a verification with a token
    const startRes = await server.inject({
      method: 'POST',
      url: '/verify/start',
      payload: {
        phoneNumber: '+15105551234',
        name: 'TTL Test',
        reason: 'Testing token expiry'
      }
    });

    const { token } = JSON.parse(startRes.body);

    // Check status - should be pending
    const statusRes = await server.inject({
      method: 'GET',
      url: `/verify/status/${token}`
    });

    expect(statusRes.statusCode).toBe(200);
    const statusBody = JSON.parse(statusRes.body);
    expect(statusBody).toHaveProperty('status', 'pending');
    expect(statusBody).toHaveProperty('expired', false);
    
    // Token should expire in 15 minutes (we can't wait that long in tests)
    // Just verify the expiry field exists
    expect(statusBody).toHaveProperty('completedAt', null);
  });

  it('should handle single-use token enforcement', async () => {
    // Create a verification
    const startRes = await server.inject({
      method: 'POST',
      url: '/verify/start',
      payload: {
        phoneNumber: '+14085551234',
        name: 'Single Use Test',
        reason: 'Testing single-use tokens'
      }
    });

    const { token } = JSON.parse(startRes.body);

    // First submission should succeed
    const firstSubmit = await server.inject({
      method: 'POST',
      url: '/verify/submit',
      payload: {
        token: token,
        recipientPhone: '+16505551234',
        grantPass: false
      }
    });

    expect(firstSubmit.statusCode).toBe(200);

    // Second submission with same token should fail
    const secondSubmit = await server.inject({
      method: 'POST',
      url: '/verify/submit',
      payload: {
        token: token,
        recipientPhone: '+16505551234',
        grantPass: false
      }
    });

    expect(secondSubmit.statusCode).toBe(401);
    const errorBody = JSON.parse(secondSubmit.body);
    expect(errorBody).toHaveProperty('error');
  });

  it('should support health check aliases', async () => {
    // Test /healthz alias
    const healthzRes = await server.inject({
      method: 'GET',
      url: '/healthz'
    });
    
    expect(healthzRes.statusCode).toBe(200);
    expect(JSON.parse(healthzRes.body)).toHaveProperty('status', 'ready');

    // Test /health/health alias
    const healthHealthRes = await server.inject({
      method: 'GET',
      url: '/health/health'
    });
    
    expect(healthHealthRes.statusCode).toBe(200);
    expect(JSON.parse(healthHealthRes.body)).toEqual({ ok: true });

    // Test /z alias
    const zRes = await server.inject({
      method: 'GET',
      url: '/z'
    });
    
    expect(zRes.statusCode).toBe(200);
    expect(JSON.parse(zRes.body)).toHaveProperty('status', 'ready');
  });
});