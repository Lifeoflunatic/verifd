#!/usr/bin/env node

/**
 * Manual test script for /pass/check endpoint
 * This bypasses the database issue and tests the endpoint logic directly
 */

import Fastify from 'fastify';
import { passRoutes } from './src/routes/pass.js';

// Mock database that returns controlled test data
const mockDb = {
  testPasses: new Map(),
  
  prepare(sql) {
    return {
      get: (phoneNumber, nowSec) => {
        const passes = Array.from(this.testPasses.values())
          .filter(pass => pass.phone_number === phoneNumber && pass.expires_at > nowSec)
          .sort((a, b) => b.expires_at - a.expires_at);
        return passes[0] || undefined;
      }
    };
  }
};

// Mock the database module
const originalGetDb = await import('./src/db/index.js');
originalGetDb.getDb = () => mockDb;

// Start test server
const app = Fastify({ logger: { level: 'error' } });
await app.register(passRoutes, { prefix: '/pass' });

const address = await app.listen({ port: 0, host: '127.0.0.1' });
const port = app.server.address().port;

console.log(`Test server running on http://127.0.0.1:${port}`);

// Test cases
async function runTests() {
  const baseUrl = `http://127.0.0.1:${port}`;
  
  console.log('\n=== Testing /pass/check endpoint ===\n');

  // Test 1: Unknown number
  console.log('1. Testing unknown number (should return allowed=false):');
  try {
    const response = await fetch(`${baseUrl}/pass/check?number_e164=%2B15551234567`);
    const body = await response.text();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${body}`);
    console.log(`   Cache-Control: ${response.headers.get('cache-control')}`);
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }

  // Test 2: Invalid number
  console.log('\n2. Testing invalid number (should return 400):');
  try {
    const response = await fetch(`${baseUrl}/pass/check?number_e164=123`);
    const body = await response.text();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${body}`);
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }

  // Test 3: Active pass
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = nowSec + 3600; // 1 hour from now
  
  mockDb.testPasses.set('pass_123', {
    id: 'pass_123',
    phone_number: '+15551234567',
    expires_at: expiresAt,
    created_at: nowSec
  });

  console.log('\n3. Testing active pass (should return allowed=true with 24h scope):');
  try {
    const response = await fetch(`${baseUrl}/pass/check?number_e164=%2B15551234567`);
    const body = await response.text();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${body}`);
    
    const data = JSON.parse(body);
    if (data.allowed && data.scope === '24h' && data.expires_at) {
      console.log('   ✅ Correct response structure and values');
    } else {
      console.log('   ❌ Unexpected response structure or values');
    }
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }

  // Test 4: 30m scope pass
  const expires30m = nowSec + 1800; // 30 minutes
  mockDb.testPasses.set('pass_30m', {
    id: 'pass_30m',
    phone_number: '+15552222222',
    expires_at: expires30m,
    created_at: nowSec
  });

  console.log('\n4. Testing 30m scope pass:');
  try {
    const response = await fetch(`${baseUrl}/pass/check?number_e164=%2B15552222222`);
    const body = await response.text();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${body}`);
    
    const data = JSON.parse(body);
    if (data.scope === '30m') {
      console.log('   ✅ Correct 30m scope');
    } else {
      console.log('   ❌ Expected 30m scope, got:', data.scope);
    }
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }

  // Test 5: 30d scope pass
  const expires30d = nowSec + 2592000; // 30 days
  mockDb.testPasses.set('pass_30d', {
    id: 'pass_30d',
    phone_number: '+15553333333',
    expires_at: expires30d,
    created_at: nowSec
  });

  console.log('\n5. Testing 30d scope pass:');
  try {
    const response = await fetch(`${baseUrl}/pass/check?number_e164=%2B15553333333`);
    const body = await response.text();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${body}`);
    
    const data = JSON.parse(body);
    if (data.scope === '30d') {
      console.log('   ✅ Correct 30d scope');
    } else {
      console.log('   ❌ Expected 30d scope, got:', data.scope);
    }
  } catch (err) {
    console.log(`   Error: ${err.message}`);
  }

  console.log('\n=== Curl Examples ===');
  console.log(`curl "${baseUrl}/pass/check?number_e164=%2B15551234567"`);
  console.log(`curl "${baseUrl}/pass/check?number_e164=123"`);
  console.log('\n=== Test Complete ===');

  await app.close();
  process.exit(0);
}

// Run tests
runTests().catch(console.error);