import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { passRoutes } from '../src/routes/pass.js';
import type { PassCheckResponse } from '@verifd/shared';

describe('GET /pass/check', () => {
  let app: ReturnType<typeof Fastify>;
  let db: Database.Database;
  const testDbPath = ':memory:';

  beforeAll(async () => {
    // Initialize test database
    db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');
    
    // Create schema
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
    `);

    // Initialize Fastify with ephemeral port
    app = Fastify({ logger: false });
    
    // Mock getDb to return our test database
    const originalGetDb = await import('../src/db/index.js');
    (originalGetDb as any).getDb = () => db;
    
    // Register routes
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
  });

  it('returns allowed=false for unknown number', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551234567'
    });

    expect(response.statusCode).toBe(200);
    const body: PassCheckResponse = JSON.parse(response.body);
    expect(body).toEqual({ allowed: false });
  });

  it('returns allowed=true with scope and expires_at for active pass', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = nowSec + 3600; // 1 hour from now
    
    // Insert test pass
    db.prepare(`
      INSERT INTO passes (id, phone_number, granted_by, granted_to_name, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('pass_123', '+15551234567', '+15559876543', 'John Doe', expiresAt, nowSec);

    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551234567'
    });

    expect(response.statusCode).toBe(200);
    const body: PassCheckResponse = JSON.parse(response.body);
    expect(body.allowed).toBe(true);
    expect(body.scope).toBe('24h'); // 1 hour = 24h scope
    expect(body.expires_at).toBeDefined();
    expect(new Date(body.expires_at!).toISOString()).toBe(new Date(expiresAt * 1000).toISOString());
  });

  it('returns allowed=false when only expired passes exist', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredAt = nowSec - 3600; // Expired 1 hour ago
    
    // Insert expired pass
    db.prepare(`
      INSERT INTO passes (id, phone_number, granted_by, granted_to_name, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('pass_expired', '+15551234567', '+15559876543', 'Jane Doe', expiredAt, expiredAt - 7200);

    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551234567'
    });

    expect(response.statusCode).toBe(200);
    const body: PassCheckResponse = JSON.parse(response.body);
    expect(body).toEqual({ allowed: false });
  });

  it('returns 400 for invalid phone number format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=123'
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body).toEqual({ error: 'bad_number' });
  });

  it('handles boundary case at expiry time', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    
    // Insert pass that expires exactly now
    db.prepare(`
      INSERT INTO passes (id, phone_number, granted_by, granted_to_name, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('pass_boundary', '+15551234567', '+15559876543', 'Test User', nowSec, nowSec - 1800);

    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551234567'
    });

    expect(response.statusCode).toBe(200);
    const body: PassCheckResponse = JSON.parse(response.body);
    // Should be expired since expires_at <= now
    expect(body).toEqual({ allowed: false });
  });

  it('returns latest pass when multiple active passes exist', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expires1 = nowSec + 1800; // 30 min
    const expires2 = nowSec + 86400; // 24 hours (latest)
    
    // Insert multiple passes
    db.prepare(`
      INSERT INTO passes (id, phone_number, granted_by, granted_to_name, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('pass_1', '+15551234567', '+15559876543', 'User 1', expires1, nowSec);
    
    db.prepare(`
      INSERT INTO passes (id, phone_number, granted_by, granted_to_name, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('pass_2', '+15551234567', '+15559876543', 'User 2', expires2, nowSec);

    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551234567'
    });

    expect(response.statusCode).toBe(200);
    const body: PassCheckResponse = JSON.parse(response.body);
    expect(body.allowed).toBe(true);
    expect(body.scope).toBe('24h');
    // Should return the latest expiry
    expect(new Date(body.expires_at!).getTime()).toBe(expires2 * 1000);
  });

  it('includes Cache-Control: no-store header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551234567'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('correctly identifies scope based on duration', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    
    // Test 30m scope
    db.prepare(`
      INSERT INTO passes (id, phone_number, granted_by, granted_to_name, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('pass_30m', '+15551111111', '+15559876543', 'User', nowSec + 1800, nowSec);

    let response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15551111111'
    });
    let body: PassCheckResponse = JSON.parse(response.body);
    expect(body.scope).toBe('30m');

    // Test 24h scope
    db.exec('DELETE FROM passes');
    db.prepare(`
      INSERT INTO passes (id, phone_number, granted_by, granted_to_name, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('pass_24h', '+15552222222', '+15559876543', 'User', nowSec + 86400, nowSec);

    response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15552222222'
    });
    body = JSON.parse(response.body);
    expect(body.scope).toBe('24h');

    // Test 30d scope
    db.exec('DELETE FROM passes');
    db.prepare(`
      INSERT INTO passes (id, phone_number, granted_by, granted_to_name, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('pass_30d', '+15553333333', '+15559876543', 'User', nowSec + 2592000, nowSec);

    response = await app.inject({
      method: 'GET',
      url: '/pass/check?number_e164=%2B15553333333'
    });
    body = JSON.parse(response.body);
    expect(body.scope).toBe('30d');
  });
});