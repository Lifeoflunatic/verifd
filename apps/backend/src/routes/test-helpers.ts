import { FastifyPluginAsync } from 'fastify';

// Test-only routes for E2E testing
// Only enabled when NODE_ENV=test or ENABLE_TEST_ROUTES=true

let sometimes429CallCount = 0;
const FAIL_FIRST_N = 3; // First 3 calls return 429

export const testHelperRoutes: FastifyPluginAsync = async (server) => {
  // Only register in test environments
  if (process.env.NODE_ENV !== 'test' && process.env.ENABLE_TEST_ROUTES !== 'true') {
    return;
  }

  // Reset endpoint for test isolation
  server.post('/__test__/reset', async (request, reply) => {
    sometimes429CallCount = 0;
    return { reset: true, message: 'Test state reset' };
  });

  // Simulates rate limiting with Retry-After header
  server.get('/__test__/sometimes429', async (request, reply) => {
    sometimes429CallCount++;
    
    if (sometimes429CallCount <= FAIL_FIRST_N) {
      // Return 429 with Retry-After header
      const retryAfterSeconds = Math.min(sometimes429CallCount * 2, 10); // 2, 4, 6 seconds
      
      reply
        .code(429)
        .header('Retry-After', retryAfterSeconds.toString())
        .header('X-RateLimit-Limit', '5')
        .header('X-RateLimit-Remaining', '0')
        .header('X-RateLimit-Reset', new Date(Date.now() + retryAfterSeconds * 1000).toISOString());
      
      return {
        error: 'rate_limited',
        message: `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
        retryAfter: retryAfterSeconds,
        attempt: sometimes429CallCount
      };
    }
    
    // After N failures, return success
    return {
      success: true,
      message: 'Request successful after retries',
      attemptCount: sometimes429CallCount,
      timestamp: new Date().toISOString()
    };
  });

  // Endpoint to check current state
  server.get('/__test__/status', async (request, reply) => {
    return {
      sometimes429CallCount,
      failFirstN: FAIL_FIRST_N,
      willSucceedNext: sometimes429CallCount >= FAIL_FIRST_N
    };
  });

  console.log('[verifd] Test helper routes registered at /__test__/*');
};