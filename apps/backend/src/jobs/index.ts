import cron from 'node-cron';
import { cleanupExpiredPasses } from './cleanup.js';
import { config } from '../config.js';

export function startBackgroundJobs() {
  // Cleanup expired passes every hour
  const cleanupSchedule = `0 */${config.vpassCleanupIntervalMinutes} * * * *`;
  
  cron.schedule(cleanupSchedule, async () => {
    console.log('Running expired pass cleanup...');
    try {
      const deleted = await cleanupExpiredPasses();
      console.log(`Cleaned up ${deleted} expired passes`);
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  });
  
  console.log('Background jobs started');
  
  // Run cleanup immediately on startup
  cleanupExpiredPasses().catch(console.error);
}