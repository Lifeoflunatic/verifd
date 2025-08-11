import { FastifyPluginAsync } from 'fastify';
import { getDb, health } from '../db/db-selector.js';
import { config } from '../config.js';

export const healthRoutes: FastifyPluginAsync = async (server) => {
  // Simple readiness check endpoint for Playwright and other tools
  const readinessHandler = async () => {
    try {
      const dbHealth = await health();
      if (dbHealth.ok) {
        return { status: 'ready' };
      }
      return { status: 'not_ready' };
    } catch (error) {
      return { status: 'not_ready' };
    }
  };
  
  server.get('/z', readinessHandler);
  server.get('/healthz', readinessHandler);  // Common ops convention alias (used by CI)
  
  // Simple health check that returns { ok: true, mode: "mock|sqlite" }
  const simpleHealthHandler = async () => {
    try {
      const dbHealth = await health();
      if (dbHealth.ok) {
        return { ok: true, mode: config.dbDriver };
      }
      return { ok: true, mode: config.dbDriver };
    } catch (error) {
      return { ok: true, mode: config.dbDriver || 'unknown' };
    }
  };
  
  server.get('/health', simpleHealthHandler);
  server.get('/health/health', simpleHealthHandler);  // Additional alias as requested

  server.get('/', async () => {
    try {
      const dbHealth = await health();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbHealth,
        mode: config.dbDriver
      };
    } catch (error) {
      // In mock mode, always return healthy
      if (config.dbDriver === 'mock') {
        return {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          database: { ok: true, driver: 'mock' },
          mode: 'mock'
        };
      }
      return {
        status: 'unhealthy',
        error: 'Database connection failed',
        timestamp: new Date().toISOString(),
        mode: config.dbDriver
      };
    }
  });
  
  server.get('/metrics', async () => {
    try {
      const db = await getDb();
      
      // For mock DB, return dummy metrics
      if (config.dbDriver === 'mock') {
        return {
          metrics: {
            active_passes: 0,
            pending_verifications: 0,
            calls_last_hour: 0
          },
          timestamp: new Date().toISOString(),
          driver: 'mock'
        };
      }
      
      const stats = db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM passes WHERE expires_at > unixepoch()) as active_passes,
          (SELECT COUNT(*) FROM verification_attempts WHERE status = 'pending' AND expires_at > unixepoch()) as pending_verifications,
          (SELECT COUNT(*) FROM call_logs WHERE timestamp > unixepoch() - 3600) as calls_last_hour
      `).get();
      
      return {
        metrics: stats,
        timestamp: new Date().toISOString(),
        driver: 'sqlite'
      };
    } catch (error) {
      // Return zeros if DB not available
      return {
        metrics: {
          active_passes: 0,
          pending_verifications: 0,
          calls_last_hour: 0
        },
        timestamp: new Date().toISOString(),
        error: 'Database unavailable'
      };
    }
  });
};