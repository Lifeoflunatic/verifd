import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { setupRoutes } from './routes/index.js';
import { initDatabase } from './db/index.js';
import { startBackgroundJobs } from './jobs/index.js';
import { config } from './config.js';
import { corsPlugin } from './plugins/cors.js';

const server = Fastify({
  logger: {
    level: config.logLevel,
    transport: config.isDev ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    } : undefined
  }
});

async function start() {
  try {
    // Security plugins
    await server.register(helmet);
    await server.register(corsPlugin);

    // Rate limiting
    await server.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute'
    });

    // Initialize database
    await initDatabase();

    // Setup routes
    await setupRoutes(server);

    // Start background jobs
    startBackgroundJobs();

    // Start server
    await server.listen({
      port: config.port,
      host: '0.0.0.0'
    });

    console.log(`Server running at http://localhost:${config.port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();