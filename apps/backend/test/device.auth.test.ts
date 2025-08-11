import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'crypto';

const BASE_URL = 'http://localhost:3000';

describe('Device Authentication', () => {
  let deviceId: string;
  let deviceKey: string;

  describe('POST /device/register', () => {
    it('should register a new device', async () => {
      const response = await fetch(`${BASE_URL}/device/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform: 'android',
          model: 'Test Device',
          app_version: '1.0.0'
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.device_id).toMatch(/^dev_/);
      expect(data.device_key).toBeDefined();
      expect(data.issued_at).toBeDefined();
      
      // Store for later tests
      deviceId = data.device_id;
      deviceKey = data.device_key;
    });
  });

  describe('HMAC Authentication', () => {
    it('should reject requests without auth headers', async () => {
      const response = await fetch(`${BASE_URL}/passes/grant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number_e164: '+14155551234',
          scope: '24h'
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('missing_auth_headers');
    });

    it('should reject requests with invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({
        number_e164: '+14155551234',
        scope: '24h'
      });
      
      const response = await fetch(`${BASE_URL}/passes/grant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': deviceId,
          'X-Device-Sign': 'invalid-signature',
          'X-Timestamp': timestamp
        },
        body,
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('invalid_signature');
    });

    it('should accept requests with valid HMAC signature', async () => {
      // Skip if no device registered
      if (!deviceId || !deviceKey) {
        console.log('Skipping - no device credentials');
        return;
      }

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({
        number_e164: '+14155551234',
        scope: '24h',
        granted_to_name: 'Test User',
        reason: 'Testing HMAC auth'
      });
      
      // Calculate HMAC signature
      const payload = `POST:/passes/grant:${timestamp}:${body}`;
      const signature = createHmac('sha256', deviceKey)
        .update(payload)
        .digest('hex');
      
      const response = await fetch(`${BASE_URL}/passes/grant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': deviceId,
          'X-Device-Sign': signature,
          'X-Timestamp': timestamp
        },
        body,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.pass_id).toBeDefined();
      expect(data.expires_at).toBeDefined();
      expect(data.scope).toBe('24h');
    });

    it('should reject expired timestamps', async () => {
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 6+ minutes old
      const body = JSON.stringify({
        number_e164: '+14155551234',
        scope: '24h'
      });
      
      const payload = `POST:/passes/grant:${oldTimestamp}:${body}`;
      const signature = createHmac('sha256', deviceKey)
        .update(payload)
        .digest('hex');
      
      const response = await fetch(`${BASE_URL}/passes/grant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': deviceId,
          'X-Device-Sign': signature,
          'X-Timestamp': oldTimestamp
        },
        body,
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('invalid_timestamp');
    });
  });

  describe('GET /passes/since', () => {
    it('should require authentication', async () => {
      const response = await fetch(`${BASE_URL}/passes/since?ts=0`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('missing_auth_headers');
    });

    it('should return passes with valid auth', async () => {
      // Skip if no device registered
      if (!deviceId || !deviceKey) {
        console.log('Skipping - no device credentials');
        return;
      }

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = `GET:/passes/since:${timestamp}:`;
      const signature = createHmac('sha256', deviceKey)
        .update(payload)
        .digest('hex');
      
      const response = await fetch(`${BASE_URL}/passes/since?ts=0`, {
        method: 'GET',
        headers: {
          'X-Device-ID': deviceId,
          'X-Device-Sign': signature,
          'X-Timestamp': timestamp
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.passes)).toBe(true);
      expect(data.count).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });
  });
});