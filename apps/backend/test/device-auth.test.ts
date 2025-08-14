import { test } from 'tap';
import Fastify from 'fastify';
import deviceAuthPlugin, { DeviceAuthClient } from '../src/middleware/device-auth';

test('Device Authentication', async (t) => {
  const fastify = Fastify();
  
  await fastify.register(deviceAuthPlugin, {
    secret: 'test-secret',
    maxAge: 5 * 60 * 1000,
    rateLimits: {
      perIp: { max: 10, window: 60000 },
      perDevice: { max: 5, window: 60000 }
    }
  });
  
  // Protected route
  fastify.get('/protected', {
    preHandler: fastify.authenticateDevice
  }, async () => {
    return { success: true };
  });
  
  await fastify.ready();
  
  t.test('should reject missing auth', async (t) => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/protected'
    });
    
    t.equal(response.statusCode, 401);
    t.match(response.json(), {
      error: 'Missing device authentication',
      code: 'MISSING_DEVICE_AUTH'
    });
  });
  
  t.test('should reject invalid HMAC format', async (t) => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        'x-device-id': 'test-device',
        'x-device-auth': 'invalid-format'
      }
    });
    
    t.equal(response.statusCode, 401);
    t.match(response.json(), {
      error: 'Invalid authentication format',
      code: 'INVALID_AUTH_FORMAT'
    });
  });
  
  t.test('should reject expired timestamp', async (t) => {
    const oldTimestamp = Date.now() - 10 * 60 * 1000; // 10 min old
    const nonce = 'testnonce';
    const signature = 'invalidsig';
    
    const response = await fastify.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        'x-device-id': 'test-device',
        'x-device-auth': `HMAC ${oldTimestamp}:${nonce}:${signature}`
      }
    });
    
    t.equal(response.statusCode, 401);
    t.match(response.json(), {
      error: 'Invalid device authentication',
      code: 'INVALID_DEVICE_AUTH'
    });
  });
  
  t.test('should accept valid auth', async (t) => {
    const client = new DeviceAuthClient('test-device', 'test-secret');
    const authHeader = client.generateAuthHeader();
    
    const response = await fastify.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        'x-device-id': 'test-device',
        'x-device-auth': authHeader
      }
    });
    
    t.equal(response.statusCode, 200);
    t.match(response.json(), { success: true });
  });
  
  t.test('should enforce IP rate limits', async (t) => {
    const client = new DeviceAuthClient('test-device', 'test-secret');
    
    // Make requests up to limit
    for (let i = 0; i < 10; i++) {
      const response = await fastify.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-device-id': `device-${i}`,
          'x-device-auth': client.generateAuthHeader()
        },
        remoteAddress: '127.0.0.1'
      });
      
      if (i < 10) {
        t.equal(response.statusCode, 200, `Request ${i + 1} should succeed`);
      }
    }
    
    // Next request should be rate limited
    const response = await fastify.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        'x-device-id': 'device-11',
        'x-device-auth': client.generateAuthHeader()
      },
      remoteAddress: '127.0.0.1'
    });
    
    t.equal(response.statusCode, 429);
    t.match(response.json(), {
      error: 'IP rate limit exceeded',
      code: 'IP_RATE_LIMIT'
    });
  });
  
  t.test('should enforce device rate limits', async (t) => {
    const deviceId = 'rate-limited-device';
    const client = new DeviceAuthClient(deviceId, 'test-secret');
    
    // Make requests up to limit
    for (let i = 0; i < 5; i++) {
      const response = await fastify.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          'x-device-id': deviceId,
          'x-device-auth': client.generateAuthHeader()
        },
        remoteAddress: `127.0.0.${i}` // Different IPs
      });
      
      t.equal(response.statusCode, 200, `Request ${i + 1} should succeed`);
    }
    
    // Next request should be rate limited
    const response = await fastify.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        'x-device-id': deviceId,
        'x-device-auth': client.generateAuthHeader()
      },
      remoteAddress: '127.0.0.99'
    });
    
    t.equal(response.statusCode, 429);
    t.match(response.json(), {
      error: 'Device rate limit exceeded',
      code: 'DEVICE_RATE_LIMIT'
    });
  });
  
  await fastify.close();
});

test('DeviceAuthClient', async (t) => {
  t.test('should generate valid auth header', async (t) => {
    const client = new DeviceAuthClient('test-device', 'test-secret');
    const authHeader = client.generateAuthHeader();
    
    t.match(authHeader, /^HMAC \d+:[a-f0-9]+:[a-f0-9]+$/);
    
    // Parse header
    const match = authHeader.match(/^HMAC (\d+):([a-f0-9]+):([a-f0-9]+)$/);
    t.ok(match, 'Header should match expected format');
    
    if (match) {
      const [, timestamp, nonce, signature] = match;
      
      // Timestamp should be recent
      const ts = parseInt(timestamp, 10);
      t.ok(Math.abs(Date.now() - ts) < 1000, 'Timestamp should be recent');
      
      // Nonce should be 32 hex chars (16 bytes)
      t.equal(nonce.length, 32, 'Nonce should be 16 bytes hex');
      
      // Signature should be 64 hex chars (32 bytes SHA256)
      t.equal(signature.length, 64, 'Signature should be SHA256 hex');
    }
  });
  
  t.test('should generate different nonces', async (t) => {
    const client = new DeviceAuthClient('test-device', 'test-secret');
    
    const header1 = client.generateAuthHeader();
    const header2 = client.generateAuthHeader();
    
    const nonce1 = header1.split(':')[1];
    const nonce2 = header2.split(':')[1];
    
    t.notEqual(nonce1, nonce2, 'Nonces should be different');
  });
});