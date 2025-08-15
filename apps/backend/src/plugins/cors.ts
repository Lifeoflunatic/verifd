import { FastifyPluginAsync } from 'fastify';

/**
 * CORS plugin for verifd backend
 * Allows origins from WEB_VERIFY_DEV_ORIGIN and production domain
 */
export const corsPlugin: FastifyPluginAsync = async (server) => {
  // Support both dev and production origins
  const allowedOrigins = [
    process.env.WEB_VERIFY_DEV_ORIGIN,
    'http://localhost:3000',
    'https://verify.getpryvacy.com',
    'https://web-verify.vercel.app'
  ].filter(Boolean);

  server.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    
    // Always add Vary: Origin header for CORS responses
    reply.header('Vary', 'Origin');

    // If origin matches our allowlist, add CORS headers
    if (origin && allowedOrigins.includes(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
    }
  });

  // Handle preflight OPTIONS requests
  server.options('*', async (request, reply) => {
    const origin = request.headers.origin;
    
    reply.header('Vary', 'Origin');

    if (origin && allowedOrigins.includes(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
      reply.header('Access-Control-Max-Age', '600');
    }

    return reply.code(204).send();
  });
};