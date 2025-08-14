#!/usr/bin/env node

// Backend probe script to test all endpoints
import { spawn } from 'child_process';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

// ANSI colors
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    
    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.message
    };
  }
}

async function runProbe() {
  log('\n🚀 Starting verifd Backend Probe', 'blue');
  log(`   Testing endpoints on PORT ${PORT}\n`, 'blue');
  
  let exitCode = 0;
  
  // Test 1: Health check
  log('1. Testing GET /health', 'yellow');
  const health = await fetchJSON(`${BASE_URL}/health`);
  if (health.ok && health.data.ok === true && health.data.mode) {
    log(`   ✅ Health check passed (mode: ${health.data.mode})`, 'green');
  } else {
    log(`   ❌ Health check failed: ${JSON.stringify(health.data)}`, 'red');
    exitCode = 1;
  }
  
  // Test 2: Health metrics
  log('\n2. Testing GET /health/metrics', 'yellow');
  const metrics = await fetchJSON(`${BASE_URL}/health/metrics`);
  if (metrics.ok && metrics.data.metrics) {
    log(`   ✅ Metrics endpoint working: ${JSON.stringify(metrics.data.metrics)}`, 'green');
  } else {
    log(`   ❌ Metrics failed: ${JSON.stringify(metrics.data)}`, 'red');
    exitCode = 1;
  }
  
  // Test 3: Verify start
  log('\n3. Testing POST /verify/start', 'yellow');
  const verifyStart = await fetchJSON(`${BASE_URL}/verify/start`, {
    method: 'POST',
    body: JSON.stringify({
      phoneNumber: '+14155551234',
      name: 'Test User',
      reason: 'Testing probe',
      voicePing: null
    })
  });
  
  let token = null;
  let vanityUrl = null;
  
  if (verifyStart.ok && verifyStart.data.success) {
    token = verifyStart.data.token;
    vanityUrl = verifyStart.data.vanity_url;
    log(`   ✅ Verify start succeeded`, 'green');
    log(`      Token: ${token?.substring(0, 20)}...`, 'blue');
    log(`      Vanity URL: ${vanityUrl}`, 'blue');
  } else {
    log(`   ❌ Verify start failed: ${JSON.stringify(verifyStart.data)}`, 'red');
    exitCode = 1;
  }
  
  // Test 4: Verify submit (if we have a token)
  if (token) {
    log('\n4. Testing POST /verify/submit', 'yellow');
    const verifySubmit = await fetchJSON(`${BASE_URL}/verify/submit`, {
      method: 'POST',
      body: JSON.stringify({
        token: token,
        recipientPhone: '+14155559999',
        grantPass: true
      })
    });
    
    if (verifySubmit.ok && verifySubmit.data.success) {
      log(`   ✅ Verify submit succeeded`, 'green');
      log(`      Pass granted: ${verifySubmit.data.passGranted}`, 'blue');
      log(`      Pass ID: ${verifySubmit.data.passId}`, 'blue');
    } else {
      log(`   ❌ Verify submit failed: ${JSON.stringify(verifySubmit.data)}`, 'red');
      exitCode = 1;
    }
  }
  
  // Test 5: Pass check
  log('\n5. Testing GET /pass/check', 'yellow');
  const passCheck = await fetchJSON(`${BASE_URL}/pass/check?number_e164=%2B14155551234`);
  if (passCheck.ok) {
    log(`   ✅ Pass check endpoint working`, 'green');
    log(`      Response: ${JSON.stringify(passCheck.data)}`, 'blue');
  } else {
    log(`   ❌ Pass check failed: ${JSON.stringify(passCheck.data)}`, 'red');
    exitCode = 1;
  }
  
  // Test 6: POST pass check
  log('\n6. Testing POST /pass/check', 'yellow');
  const passCheckPost = await fetchJSON(`${BASE_URL}/pass/check`, {
    method: 'POST',
    body: JSON.stringify({
      fromNumber: '+14155551234',
      toNumber: '+14155559999'
    })
  });
  
  if (passCheckPost.ok) {
    log(`   ✅ POST pass check working`, 'green');
    log(`      Has valid pass: ${passCheckPost.data.hasValidPass}`, 'blue');
  } else {
    log(`   ❌ POST pass check failed: ${JSON.stringify(passCheckPost.data)}`, 'red');
    exitCode = 1;
  }
  
  // Summary
  log('\n' + '='.repeat(50), 'blue');
  if (exitCode === 0) {
    log('✅ All tests passed!', 'green');
  } else {
    log('❌ Some tests failed. Check output above.', 'red');
  }
  log('='.repeat(50) + '\n', 'blue');
  
  return exitCode;
}

// Check if server is running
async function checkServer() {
  const health = await fetchJSON(`${BASE_URL}/health`);
  return health.ok;
}

async function main() {
  // First check if server is already running
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    log('⚠️  Server not running. Please start it with: pnpm dev:mock', 'yellow');
    log('   Then run this probe again.', 'yellow');
    process.exit(1);
  }
  
  // Run the probe
  const exitCode = await runProbe();
  process.exit(exitCode);
}

main().catch(err => {
  log(`\n❌ Probe failed with error: ${err.message}`, 'red');
  process.exit(1);
});