// Central database export that switches between real and mock based on environment
let dbModule: any;

if (process.env.USE_MOCK_DB === 'true') {
  dbModule = await import('./index-mock.js');
} else {
  try {
    dbModule = await import('./index.js');
  } catch (e) {
    console.warn('[verifd] Failed to load better-sqlite3, falling back to mock DB');
    dbModule = await import('./index-mock.js');
  }
}

export const initDatabase = dbModule.initDatabase;
export const getDb = dbModule.getDb;
export const closeDatabase = dbModule.closeDatabase;