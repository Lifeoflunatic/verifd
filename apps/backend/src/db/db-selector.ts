// Database selector that switches between real and mock based on environment
import { config } from '../config.js';

interface Database {
  initDatabase(): Promise<void>;
  getDb(): any;
  closeDatabase(): void;
  health(): { ok: boolean; driver: string };
}

let dbModule: Database | null = null;

async function loadDbModule(): Promise<Database> {
  if (dbModule) return dbModule;
  
  const driver = config.dbDriver;
  console.log(`[verifd] Loading DB driver: ${driver}`);
  
  if (driver === 'mock') {
    const mockModule = await import('./index-mock.js');
    dbModule = {
      ...mockModule,
      health: () => ({ ok: true, driver: 'mock' })
    };
  } else {
    try {
      const sqliteModule = await import('./index.js');
      dbModule = {
        ...sqliteModule,
        health: () => ({ ok: true, driver: 'sqlite' })
      };
    } catch (e) {
      console.warn('[verifd] Failed to load better-sqlite3, falling back to mock DB:', e);
      const mockModule = await import('./index-mock.js');
      dbModule = {
        ...mockModule,
        health: () => ({ ok: true, driver: 'mock (fallback)' })
      };
    }
  }
  
  return dbModule;
}

export async function initDatabase() {
  const module = await loadDbModule();
  return module.initDatabase();
}

export async function getDb() {
  const module = await loadDbModule();
  return module.getDb();
}

export async function closeDatabase() {
  const module = await loadDbModule();
  return module.closeDatabase();
}

export async function health() {
  const module = await loadDbModule();
  return module.health();
}