import fs from 'node:fs';
import path from 'node:path';
// Try to import better-sqlite3, will throw if not installed
let Database: any;
try {
  const module = await import('better-sqlite3');
  Database = module.default;
} catch (error) {
  console.error('[verifd] better-sqlite3 not available, use mock DB instead');
  throw new Error('better-sqlite3 not installed. Run with USE_MOCK_DB=true or install native dependencies.');
}
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: import('better-sqlite3').Database;

export async function initDatabase() {
  // Default to 'var/db/verifd.sqlite' relative to backend package root
  const raw = process.env.DB_PATH ?? 'var/db/verifd.sqlite';
  const dbPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  
  // Create parent directory if it doesn't exist
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  
  // Log the resolved DB path at startup
  console.log('[verifd] DB:', dbPath);
  
  db = new Database(dbPath);
  
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  
  // Run schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  
  console.log('Database initialized');
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
  }
}