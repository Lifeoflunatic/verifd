import { FastifyInstance } from 'fastify';
import { verifyRoutes } from './verify.js';
import { passRoutes } from './pass.js';
import { healthRoutes } from './health.js';

export async function setupRoutes(server: FastifyInstance) {
  // Health check
  await server.register(healthRoutes, { prefix: '/health' });
  
  // Verification endpoints
  await server.register(verifyRoutes, { prefix: '/verify' });
  
  // Pass management
  await server.register(passRoutes, { prefix: '/pass' });
  
  // Root route
  server.get('/', async () => {
    return { 
      service: 'verifd',
      version: '0.1.0',
      status: 'operational'
    };
  });
}