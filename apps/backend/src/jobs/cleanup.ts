import { getDb } from '../db/index.js';

export async function cleanupExpiredPasses(): Promise<number> {
  const db = getDb();
  
  // Delete expired passes older than 30 days
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
  
  const result = db.prepare(`
    DELETE FROM passes 
    WHERE expires_at < ? 
    AND expires_at < unixepoch() - (30 * 24 * 60 * 60)
  `).run(thirtyDaysAgo);
  
  // Also cleanup old verification attempts
  db.prepare(`
    DELETE FROM verification_attempts 
    WHERE expires_at < unixepoch() - (24 * 60 * 60)
  `).run();
  
  return result.changes;
}