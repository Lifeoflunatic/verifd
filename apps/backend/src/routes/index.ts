import { FastifyInstance } from 'fastify';
import { verifyRoutes } from './verify.js';
import { passRoutes } from './pass.js';
import { healthRoutes } from './health.js';
import { getVanityToken, deleteVanityToken } from './verify.js';
import { config } from '../config.js';

export async function setupRoutes(server: FastifyInstance) {
  // Health check
  await server.register(healthRoutes, { prefix: '/health' });
  
  // Verification endpoints
  await server.register(verifyRoutes, { prefix: '/verify' });
  
  // Pass management
  await server.register(passRoutes, { prefix: '/pass' });
  
  // Vanity URL redirect handler (must be before root route)
  server.get('/v/:vanityToken', async (request, reply) => {
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