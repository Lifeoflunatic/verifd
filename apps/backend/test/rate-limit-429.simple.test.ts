import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';

describe('429 Rate Limiting with Retry-After', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Import server setup
    const { setupRoutes } = await import('../src/routes/index.js');
    const { initDatabase } = await import('../src/db/db-selector.js');
    const { default: corsPlugin } = await import('../src/plugins/cors.js');
    
    await initDatabase();
    
    app = Fastify({ logger: false });
    await app.register(corsPlugin);
    await setupRoutes(app);
    await app.listen({ port: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Reset test state
    await app.inject({
      method: 'POST',
      url: '/__test__/reset'
    });
  });

  it('should return 429 with Retry-After header for first N requests', async () => {
    const attempts = [];
    
    // First 3 attempts should fail with 429
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({
        method: 'GET',
        url: '/__test__/sometimes429'
      });
      
      attempts.push({
        status: response.statusCode,
        retryAfter: response.headers['retry-after'],
        body: JSON.parse(response.body)
      });
    }
    
    // Check all first 3 attempts returned 429
    expect(attempts[0].status).toBe(429);
    expect(attempts[1].status).toBe(429);
    expect(attempts[2].status).toBe(429);
    
    // Check Retry-After header increases
    expect(attempts[0].retryAfter).toBe('2');
    expect(attempts[1].retryAfter).toBe('4');
    expect(attempts[2].retryAfter).toBe('6');
    
    // Check error messages
    expect(attempts[0].body.error).toBe('rate_limited');
    expect(attempts[0].body.retryAfter).toBe(2);
    expect(attempts[1].body.retryAfter).toBe(4);
    expect(attempts[2].body.retryAfter).toBe(6);
  });

  it('should succeed after N failed attempts', async () => {
    // Make 3 failed attempts
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'GET',
        url: '/__test__/sometimes429'
      });
    }
    
    // 4th attempt should succeed
    const successResponse = await app.inject({
      method: 'GET',
      url: '/__test__/sometimes429'
    });
    
    expect(successResponse.statusCode).toBe(200);
    const body = JSON.parse(successResponse.body);
    expect(body.success).toBe(true);
    expect(body.attemptCount).toBe(4);
  });

  it('should include proper rate limit headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test__/sometimes429'
    });
    
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
    expect(response.headers['x-ratelimit-limit']).toBe('5');
    expect(response.headers['x-ratelimit-remaining']).toBe('0');
    expect(response.headers['x-ratelimit-reset']).toBeDefined();
    
    // Parse reset time
    const resetTime = new Date(response.headers['x-ratelimit-reset'] as string);
    const now = new Date();
    const diffSeconds = (resetTime.getTime() - now.getTime()) / 1000;
    
    // Should be approximately 2 seconds in the future
    expect(diffSeconds).toBeGreaterThan(1);
    expect(diffSeconds).toBeLessThan(3);
  });

  it('should simulate backoff behavior correctly', async () => {
    const startTime = Date.now();
    const attempts = [];
    let lastResponse: any = null;
    
    // Simulate client with exponential backoff
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await app.inject({
        method: 'GET',
        url: '/__test__/sometimes429'
      });
      
      lastResponse = response;
      const body = JSON.parse(response.body);
      
      attempts.push({
        attempt: attempt + 1,
        status: response.statusCode,
        timestamp: Date.now() - startTime,
        retryAfter: response.headers['retry-after']
      });
      
      // If we get 429, wait before retrying (simulated)
      if (response.statusCode === 429) {
        const retryAfter = parseInt(response.headers['retry-after'] as string, 10);
        // In real client, would wait: await new Promise(r => setTimeout(r, retryAfter * 1000));
        // For test, we just record it
      } else {
        // Success!
        break;
      }
    }
    
    // Should have succeeded on 4th attempt
    expect(attempts.length).toBe(4);
    expect(lastResponse?.statusCode).toBe(200);
    
    // First 3 should be 429s
    expect(attempts[0].status).toBe(429);
    expect(attempts[1].status).toBe(429);
    expect(attempts[2].status).toBe(429);
    expect(attempts[3].status).toBe(200);
  });

  it('should track state correctly via status endpoint', async () => {
    // Check initial state
    let statusResponse = await app.inject({
      method: 'GET',
      url: '/__test__/status'
    });
    let status = JSON.parse(statusResponse.body);
    expect(status.sometimes429CallCount).toBe(0);
    expect(status.willSucceedNext).toBe(false);
    
    // Make 2 requests
    await app.inject({ method: 'GET', url: '/__test__/sometimes429' });
    await app.inject({ method: 'GET', url: '/__test__/sometimes429' });
    
    // Check state
    statusResponse = await app.inject({
      method: 'GET',
      url: '/__test__/status'
    });
    status = JSON.parse(statusResponse.body);
    expect(status.sometimes429CallCount).toBe(2);
    expect(status.willSucceedNext).toBe(false);
    
    // Make one more (3rd request)
    await app.inject({ method: 'GET', url: '/__test__/sometimes429' });
    
    // Now should be ready to succeed
    statusResponse = await app.inject({
      method: 'GET',
      url: '/__test__/status'
    });
    status = JSON.parse(statusResponse.body);
    expect(status.sometimes429CallCount).toBe(3);
    expect(status.willSucceedNext).toBe(true);
  });
});