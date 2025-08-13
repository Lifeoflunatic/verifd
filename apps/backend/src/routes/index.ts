import { FastifyInstance } from 'fastify';
import { verifyRoutes } from './verify.js';
import { passRoutes } from './pass.js';
import { healthRoutes } from './health.js';
import { voicePingRoutes } from './voice-ping.js';
import { deviceRoutes } from './device.js';
import { testHelperRoutes } from './test-helpers.js';
import configRoute from './config.js';
import telemetryRoute from './telemetry.js';
import canaryRoute from './canary.js';
import jwksRoute from './jwks.js';
import verifyLinkRoute from './verify-link.js';
import { getVanityToken, deleteVanityToken } from './verify.js';
import { config } from '../config.js';

export async function setupRoutes(server: FastifyInstance) {
  // Health check
  await server.register(healthRoutes, { prefix: '/health' });
  
  // Feature configuration
  await server.register(configRoute);
  
  // Telemetry collection
  await server.register(telemetryRoute);
  
  // Canary controller (staging/production)
  await server.register(canaryRoute, { prefix: '/canary' });
  
  // JWKS endpoint for key rotation
  await server.register(jwksRoute);
  
  // Device registration
  await server.register(deviceRoutes, { prefix: '/device' });
  
  // Verification endpoints
  await server.register(verifyRoutes, { prefix: '/verify' });
  
  // Verify link templates (for notification actions)
  await server.register(verifyLinkRoute);
  
  // Pass management (includes /grant and /since)
  await server.register(passRoutes, { prefix: '/pass' });
  
  // Direct pass granting (shortcut route)
  await server.register(passRoutes, { prefix: '/passes' });
  
  // Voice ping endpoints
  await server.register(voicePingRoutes, { prefix: '/voice-ping' });
  
  // Test helper routes (only in test mode)
  await server.register(testHelperRoutes);
  
  // Vanity URL redirect handler (must be before root route)
  server.get('/v/:vanityToken', async (request, reply: any) => {
    const { vanityToken } = request.params as { vanityToken: string };
    
    const mapping = getVanityToken(vanityToken);
    if (!mapping) {
      return reply.status(404).send({ error: 'Vanity link not found or expired' });
    }
    
    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    if (mapping.expiresAt < now) {
      deleteVanityToken(vanityToken);
      return reply.status(404).send({ error: 'Vanity link expired' });
    }
    
    // Redirect to web-verify with the token
    const webVerifyUrl = `${config.corsOrigin}?t=${mapping.token}`;
    return reply.redirect(302, webVerifyUrl);
  });

  // Root route
  server.get('/', async () => {
    return { 
      service: 'verifd',
      version: '0.1.1',
      status: 'operational'
    };
  });
}