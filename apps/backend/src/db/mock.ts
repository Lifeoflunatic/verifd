// Temporary mock database for development while better-sqlite3 is broken
import { Database } from 'sqlite3';
import { promisify } from 'util';
import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

class MockDatabase {
  private db: Database;
  private runAsync: any;
  private getAsync: any;
  private allAsync: any;
  private pendingOps: Promise<any>[] = [];

  constructor(dbPath: string) {
    // Create parent directory if it doesn't exist
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    
    this.db = new Database(dbPath);
    this.runAsync = promisify(this.db.run.bind(this.db));
    this.getAsync = promisify(this.db.get.bind(this.db));
    this.allAsync = promisify(this.db.all.bind(this.db));
    
    // Initialize schema synchronously
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    this.exec(schema);
  }

  pragma(sql: string) {
    // Mock pragma - sqlite3 doesn't support WAL the same way
    return this;
  }

  exec(sql: string) {
    this.db.exec(sql);
    return this;
  }

  prepare(sql: string) {
    const self = this;
    return {
      get(...params: any[]) {
        // For testing, we need to ensure writes complete before reads
        // Wait for any pending write operations
        if (self.pendingOps.length > 0) {
          const start = Date.now();
          while (self.pendingOps.length > 0 && Date.now() - start < 100) {
            // Small busy wait to let pending ops complete
          }
        }
        
        let result: any = undefined;
        let error: any = undefined;
        let done = false;
        
        self.getAsync.call(self, sql, ...params)
          .then((r: any) => { result = r; done = true; })
          .catch((e: any) => { error = e; done = true; });
        
        // Busy wait for result
        const start = Date.now();
        while (!done && Date.now() - start < 1000) {
          // Wait up to 1 second
        }
        
        if (error) throw error;
        return result;
      },
      all(...params: any[]) {
        // Wait for pending writes
        if (self.pendingOps.length > 0) {
          const start = Date.now();
          while (self.pendingOps.length > 0 && Date.now() - start < 100) {
            // Small busy wait
          }
        }
        
        let result: any = undefined;
        let error: any = undefined;
        let done = false;
        
        self.allAsync.call(self, sql, ...params)
          .then((r: any) => { result = r || []; done = true; })
          .catch((e: any) => { error = e; done = true; });
        
        const start = Date.now();
        while (!done && Date.now() - start < 1000) {
          // Wait
        }
        
        if (error) throw error;
        return result || [];
      },
      run(...params: any[]) {
        let error: any = undefined;
        let done = false;
        let lastID: any = undefined;
        let changes = 0;
        
        // Track this operation as pending
        const op = self.runAsync.call(self, sql, ...params)
          .then(function(this: any) { 
            lastID = this?.lastID;
            changes = this?.changes || 0;
            done = true;
            // Remove from pending
            const idx = self.pendingOps.indexOf(op);
            if (idx >= 0) self.pendingOps.splice(idx, 1);
          })
          .catch((e: any) => { 
            error = e; 
            done = true;
            // Remove from pending
            const idx = self.pendingOps.indexOf(op);
            if (idx >= 0) self.pendingOps.splice(idx, 1);
          });
        
        self.pendingOps.push(op);
        
        const start = Date.now();
        while (!done && Date.now() - start < 1000) {
          // Wait
        }
        
        if (error) throw error;
        return { lastID, changes };
      }
    };
  }

  close() {
    this.db.close();
  }
}

export default MockDatabase as any;