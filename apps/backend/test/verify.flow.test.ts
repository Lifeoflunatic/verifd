import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { passRoutes } from '../src/routes/pass.js';
import { verifyRoutes } from '../src/routes/verify.js';
import type { PassCheckResponse, VerifyStartResponse, VerifySubmitResponse } from '@verifd/shared';

describe('Verification Flow: /verify/start → /verify/submit → /pass/check', () => {
  let app: ReturnType<typeof Fastify>;
  let db: Database.Database;
  const testDbPath = ':memory:';

  beforeAll(async () => {
    // Initialize test database
    db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');
    
    // Create full schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS passes (
        id TEXT PRIMARY KEY,
        phone_number TEXT NOT NULL,
        granted_by TEXT NOT NULL,
        granted_to_name TEXT NOT NULL,
        reason TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        used_count INTEGER DEFAULT 0,
        max_uses INTEGER DEFAULT NULL,
        metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_passes_number_exp ON passes(phone_number, expires_at);
      
      CREATE TABLE IF NOT EXISTS verification_attempts (
        id TEXT PRIMARY KEY,
        phone_number TEXT NOT NULL,
        name TEXT NOT NULL,
        reason TEXT NOT NULL,
        voice_ping_url TEXT,
        verification_token TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        completed_at INTEGER,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_verification_attempts_token ON verification_attempts(verification_token);
    `);

    // Initialize Fastify with ephemeral port
    app = Fastify({ logger: false });
    
    // Mock getDb to return our test database
    const originalGetDb = await import('../src/db/index.js');
    (originalGetDb as any).getDb = () => db;
    
    // Register routes
    await app.register(verifyRoutes, { prefix: '/verify' });
    await app.register(passRoutes, { prefix: '/pass' });
    await app.listen({ port: 0 }); // Ephemeral port
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  beforeEach(() => {
    // Clear test data
    db.exec('DELETE FROM passes');
    db.exec('DELETE FROM verification_attempts');
  });

  it('completes full flow: start → submit → check returns allowed=true', async () => {
    // Step 1: Start verification
    const startResponse = await app.inject({
      method: 'POST',
      url: '/verify/start',
      payload: {
        phoneNumber: '+15551234567',
        name: 'John Doe',
        reason: 'Meeting at 3pm'
      }
    });

    expect(startResponse.statusCode).toBe(200);
    const startBody: VerifyStartResponse = JSON.parse(startResponse.body);
    expect(startBody.success).toBe(true);
    expect(startBody.token).toBeDefined();
    
    const verifyToken = startBody.token;

    // Step 2: Submit verification and grant pass
    const submitResponse = await app.inject({
      method: 'POST',
      url: '/verify/submit',
      payload: {
        token: verifyToken,
        recipientPhone: '+15559876543',
        grantPass: true
      }
    });

    expect(submitResponse.statusCode).toBe(200);
    const submitBody: VerifySubmitResponse = JSON.parse(submitResponse.body);
    expect(submitBody.success).toBe(true);
    expect(submitBody.passGranted).toBe(true);
    expect(submitBody.passId).toBeDefined();

    // Step 3: Check if pass is valid
    const checkResponse = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551234567'
    });

    expect(checkResponse.statusCode).toBe(200);
    const checkBody: PassCheckResponse = JSON.parse(checkResponse.body);
    expect(checkBody.allowed).toBe(true);
    expect(checkBody.scope).toBeDefined();
    expect(checkBody.expires_at).toBeDefined();
  });

  it('check returns allowed=false when pass not granted in submit', async () => {
    // Step 1: Start verification
    const startResponse = await app.inject({
      method: 'POST',
      url: '/verify/start',
      payload: {
        phoneNumber: '+15551234567',
        name: 'Jane Doe',
        reason: 'Delivery'
      }
    });

    const startBody: VerifyStartResponse = JSON.parse(startResponse.body);
    const verifyToken = startBody.token;

    // Step 2: Submit verification but DON'T grant pass
    const submitResponse = await app.inject({
      method: 'POST',
      url: '/verify/submit',
      payload: {
        token: verifyToken,
        recipientPhone: '+15559876543',
        grantPass: false
      }
    });

    expect(submitResponse.statusCode).toBe(200);
    const submitBody: VerifySubmitResponse = JSON.parse(submitResponse.body);
    expect(submitBody.passGranted).toBe(false);

    // Step 3: Check should return allowed=false
    const checkResponse = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551234567'
    });

    expect(checkResponse.statusCode).toBe(200);
    const checkBody: PassCheckResponse = JSON.parse(checkResponse.body);
    expect(checkBody.allowed).toBe(false);
  });
});