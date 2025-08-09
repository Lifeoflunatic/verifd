import { FastifyPluginAsync } from 'fastify';
import { getDb } from '../db/index.js';

export const healthRoutes: FastifyPluginAsync = async (server) => {
  // Simple readiness check endpoint for Playwright and other tools
  server.get('/z', async () => {
    try {
      const db = getDb();
      // Quick DB check
      db.prepare('SELECT 1').get();
      
      return { status: 'ready' };
    } catch (error) {
      return { status: 'not_ready' };
    }
  });

  server.get('/', async () => {
    try {
      const db = getDb();
      // Quick DB check
      db.prepare('SELECT 1').get();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: 'Database connection failed',
        timestamp: new Date().toISOString()
      };
    }
  });
  
  server.get('/metrics', async () => {
    const db = getDb();
    
    const stats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM passes WHERE expires_at > unixepoch()) as active_passes,
        (SELECT COUNT(*) FROM verification_attempts WHERE status = 'pending' AND expires_at > unixepoch()) as pending_verifications,
        (SELECT COUNT(*) FROM call_logs WHERE timestamp > unixepoch() - 3600) as calls_last_hour
    `).get();
    
    return {
      metrics: stats,
      timestamp: new Date().toISOString()
    };
  });
};