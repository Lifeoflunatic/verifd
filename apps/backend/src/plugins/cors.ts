import { FastifyPluginAsync } from 'fastify';

/**
 * CORS plugin for verifd backend
 * Only allows origins from WEB_VERIFY_DEV_ORIGIN environment variable
 */
export const corsPlugin: FastifyPluginAsync = async (server) => {
  const webVerifyOrigin = process.env.WEB_VERIFY_DEV_ORIGIN;

  server.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    
    // Always add Vary: Origin header for CORS responses
    reply.header('Vary', 'Origin');

    // If origin matches our allowlist, add CORS headers
    if (webVerifyOrigin && origin === webVerifyOrigin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
    }
  });

  // Handle preflight OPTIONS requests
  server.options('*', async (request, reply) => {
    const origin = request.headers.origin;
    
    reply.header('Vary', 'Origin');

    if (webVerifyOrigin && origin === webVerifyOrigin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
      reply.header('Access-Control-Max-Age', '600');
    }

    return reply.code(204).send();
  });
};

export default corsPlugin;