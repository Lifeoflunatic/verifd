import { FastifyPluginAsync } from 'fastify';
import { getDb } from '../db/index.js';

const healthz: FastifyPluginAsync = async (fastify) => {
  // Simple health check - just returns 200 OK
  fastify.get('/', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  });

  // Detailed health check with dependency status
  fastify.get('/detailed', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            checks: {
              type: 'object',
              properties: {
                database: { type: 'boolean' },
                cors: { type: 'boolean' },
                storage: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const checks = {
      database: false,
      cors: false,
      storage: false
    };

    // Check database
    try {
      const db = getDb();
      db.prepare('SELECT 1').get();
      checks.database = true;
    } catch (error) {
      fastify.log.error({ error }, 'Database health check failed');
    }

    // Check CORS config
    checks.cors = !!process.env.CORS_ALLOWED_ORIGINS;

    // Check storage config
    checks.storage = !!(
      (process.env.S3_BUCKET_NAME || process.env.R2_BUCKET_NAME) &&
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    );

    const allHealthy = Object.values(checks).every(v => v === true);

    const statusCode = allHealthy ? 200 : 503;
    return reply.code(statusCode).send({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks
    });
  });
};

export default healthz;