import { FastifyPluginAsync } from 'fastify';
import { getDb } from '../db/index.js';

const sweeper: FastifyPluginAsync = async (fastify) => {
  // POST /sweeper/clean - Secure endpoint for cleaning expired records
  fastify.post('/clean', {
    schema: {
      headers: {
        type: 'object',
        properties: {
          'x-sweeper-secret': { type: 'string' }
        },
        required: ['x-sweeper-secret']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            deleted: {
              type: 'object',
              properties: {
                verifications: { type: 'number' },
                passes: { type: 'number' },
                total: { type: 'number' }
              },
              required: ['verifications', 'passes', 'total']
            },
            timestamp: { type: 'string' }
          },
          required: ['deleted', 'timestamp']
        }
      }
    },
    preHandler: async (request, reply) => {
      // Check sweeper secret
      const secret = request.headers['x-sweeper-secret'];
      const expectedSecret = process.env.SWEEPER_SECRET;
      
      if (!expectedSecret) {
        fastify.log.error('SWEEPER_SECRET not configured');
        return reply.code(503).send({ error: 'sweeper_not_configured' });
      }
      
      if (secret !== expectedSecret) {
        fastify.log.warn('Invalid sweeper secret attempt');
        return reply.code(401).send({ error: 'unauthorized' });
      }
    }
  }, async (request, reply) => {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    
    try {
      // Start transaction for atomic cleanup
      db.prepare('BEGIN').run();
      
      // Clean expired pending verifications
      const verifyResult = db.prepare(
        `DELETE FROM verify 
         WHERE expires_at < ? AND status = 'pending'`
      ).run(now);
      
      // Clean expired passes (30 days after verification)
      const passResult = db.prepare(
        `DELETE FROM verify 
         WHERE status = 'verified' 
         AND verified_at < ? - 2592000`  // 30 days = 2592000 seconds
      ).run(now);
      
      // Clean orphaned voice files from local storage if configured
      if (process.env.NODE_ENV !== 'production') {
        // In dev, we could clean local voice files
        // But in production, S3/R2 lifecycle policies should handle this
        fastify.log.info('Local voice file cleanup not implemented for dev');
      }
      
      db.prepare('COMMIT').run();
      
      const deleted = {
        verifications: verifyResult.changes,
        passes: passResult.changes,
        total: verifyResult.changes + passResult.changes
      };
      
      fastify.log.info({ deleted }, 'Sweeper cleanup completed');
      
      return {
        deleted,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      db.prepare('ROLLBACK').run();
      fastify.log.error({ error }, 'Sweeper cleanup failed');
      reply.code(500);
      return { error: 'cleanup_failed' };
    }
  });
  
  // GET /sweeper/status - Check sweeper configuration status
  fastify.get('/status', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            configured: { type: 'boolean' },
            lastRun: { type: ['string', 'null'] },
            pendingCount: { type: 'number' },
            expiredCount: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    
    try {
      // Count pending verifications
      const pendingResult = db.prepare(
        `SELECT COUNT(*) as count FROM verify WHERE status = 'pending'`
      ).get() as any;
      
      // Count expired records
      const expiredResult = db.prepare(
        `SELECT COUNT(*) as count FROM verify 
         WHERE (expires_at < ? AND status = 'pending')
         OR (status = 'verified' AND verified_at < ? - 2592000)`
      ).get(now, now) as any;
      
      return {
        configured: !!process.env.SWEEPER_SECRET,
        lastRun: null, // Could track this in DB if needed
        pendingCount: pendingResult.count,
        expiredCount: expiredResult.count
      };
    } catch (error) {
      fastify.log.error({ error }, 'Failed to get sweeper status');
      reply.code(500);
      return { error: 'status_check_failed' };
    }
  });
};

export default sweeper;