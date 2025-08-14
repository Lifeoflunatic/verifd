import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// In-memory mock database for development when better-sqlite3 won't build
// Import the pure JavaScript mock (no native dependencies)
import PureMockDatabase from './pure-mock.js';

let db: any;

export async function initDatabase() {
  const raw = process.env.DB_PATH ?? 'var/db/verifd.sqlite';
  const dbPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  console.log('[verifd] DB:', dbPath);
  
  db = new PureMockDatabase(dbPath);
  db.pragma('journal_mode = WAL');
  
  console.log('Database initialized (MOCK MODE)');
}

export function getDb() {
  if (!db) {
    // Auto-initialize for mock mode
    console.log('[verifd] Auto-initializing mock DB');
    db = new PureMockDatabase('var/db/verifd.sqlite');
  }
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
  }
}