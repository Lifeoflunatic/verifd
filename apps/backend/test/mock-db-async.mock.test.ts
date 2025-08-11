import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tick } from './helpers/async.js';

// Only run this test when USE_MOCK_DB is set
const shouldRun = process.env.USE_MOCK_DB === 'true';

describe.skipIf(!shouldRun)('Mock DB Async Behavior', () => {
  let db: any;

  beforeAll(async () => {
    // Import the mock DB selector
    const { initDatabase, getDb } = await import('../src/db/db-selector.js');
    await initDatabase();
    db = await getDb();
  });

  it('handles concurrent writes and reads correctly', async () => {
    const id1 = `test_${Date.now()}_1`;
    const id2 = `test_${Date.now()}_2`;
    const id3 = `test_${Date.now()}_3`;
    
    // Start multiple inserts concurrently
    const insert1 = db.prepare(`
      INSERT INTO passes (id, number_e164, granted_by, granted_to_name, reason, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id1, '+15551234567', '+15559999999', 'Test User 1', 'Test reason 1', 
           Math.floor(Date.now() / 1000) + 3600, Math.floor(Date.now() / 1000));
    
    const insert2 = db.prepare(`
      INSERT INTO passes (id, number_e164, granted_by, granted_to_name, reason, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id2, '+15551234568', '+15559999999', 'Test User 2', 'Test reason 2',
           Math.floor(Date.now() / 1000) + 3600, Math.floor(Date.now() / 1000));
    
    const insert3 = db.prepare(`
      INSERT INTO passes (id, number_e164, granted_by, granted_to_name, reason, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id3, '+15551234569', '+15559999999', 'Test User 3', 'Test reason 3',
           Math.floor(Date.now() / 1000) + 3600, Math.floor(Date.now() / 1000));
    
    // Wait a bit for operations to complete
    await tick(50);
    
    // Now try to read them back
    const result1 = db.prepare('SELECT * FROM passes WHERE id = ?').get(id1);
    const result2 = db.prepare('SELECT * FROM passes WHERE id = ?').get(id2);
    const result3 = db.prepare('SELECT * FROM passes WHERE id = ?').get(id3);
    
    // All should be found
    expect(result1).toBeDefined();
    expect(result1?.id).toBe(id1);
    expect(result1?.granted_to_name).toBe('Test User 1');
    
    expect(result2).toBeDefined();
    expect(result2?.id).toBe(id2);
    expect(result2?.granted_to_name).toBe('Test User 2');
    
    expect(result3).toBeDefined();
    expect(result3?.id).toBe(id3);
    expect(result3?.granted_to_name).toBe('Test User 3');
  });

  it('handles updates followed by immediate reads', async () => {
    const id = `test_update_${Date.now()}`;
    
    // Insert a pass
    db.prepare(`
      INSERT INTO passes (id, number_e164, granted_by, granted_to_name, reason, expires_at, created_at, used_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, '+15551234570', '+15559999999', 'Update Test User', 'Update test',
           Math.floor(Date.now() / 1000) + 3600, Math.floor(Date.now() / 1000), 0);
    
    // Small delay to ensure insert completes
    await tick(10);
    
    // Update the used_count
    db.prepare('UPDATE passes SET used_count = used_count + 1 WHERE id = ?').run(id);
    
    // Immediately read it back
    const result = db.prepare('SELECT * FROM passes WHERE id = ?').get(id);
    
    expect(result).toBeDefined();
    expect(result?.used_count).toBe(1);
  });

  afterAll(() => {
    // Clean up test data
    if (db) {
      db.prepare("DELETE FROM passes WHERE id LIKE 'test_%'").run();
    }
  });
});