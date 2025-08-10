import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database;

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