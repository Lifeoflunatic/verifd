// Pure JavaScript mock database (no native dependencies)
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface MockRow {
  [key: string]: any;
}

class PureMockDatabase {
  private tables: Map<string, MockRow[]> = new Map();
  
  constructor(dbPath: string) {
    console.log('[verifd] Pure Mock DB initialized (in-memory):', dbPath);
    
    // Initialize tables
    this.tables.set('passes', []);
    this.tables.set('verification_attempts', []);
    this.tables.set('call_logs', []);
    this.tables.set('devices', []);
    this.tables.set('voice_ping_requests', []);
    
    // Load schema to understand structure
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    // We don't actually execute it, just use it for reference
  }

  pragma(sql: string) {
    // Mock pragma - no-op
    return this;
  }

  exec(sql: string) {
    // Mock exec - no-op for schema
    return this;
  }

  prepare(sql: string) {
    const self = this;
    
    return {
      get(...params: any[]) {
        // Parse the SQL to determine what to do
        if (sql.includes('SELECT') && sql.includes('FROM passes')) {
          const passes = self.tables.get('passes') || [];
          
          // Handle WHERE clauses
          if (sql.includes('WHERE id = ?')) {
            return passes.find(p => p.id === params[0]);
          } else if (sql.includes('WHERE number_e164 = ?')) {
            const results = passes.filter(p => {
              if (p.number_e164 !== params[0]) return false;
              
              // Check expiry if specified
              if (sql.includes('expires_at >')) {
                const expiryParam = params[1] || Math.floor(Date.now() / 1000);
                if (p.expires_at <= expiryParam) return false;
              }
              
              return true;
            });
            
            // Return first match, sorted by expires_at DESC if specified
            if (sql.includes('ORDER BY expires_at DESC')) {
              results.sort((a, b) => b.expires_at - a.expires_at);
            }
            
            return results[0];
          }
        } else if (sql.includes('SELECT') && sql.includes('FROM verification_attempts')) {
          const attempts = self.tables.get('verification_attempts') || [];
          
          if (sql.includes('WHERE verification_token = ?')) {
            return attempts.find(a => {
              if (a.verification_token !== params[0]) return false;
              
              // Check status and expiry if specified
              if (sql.includes("status = 'pending'") && a.status !== 'pending') return false;
              if (sql.includes('expires_at > unixepoch()') && a.expires_at <= Math.floor(Date.now() / 1000)) return false;
              
              return true;
            });
          }
        } else if (sql.includes('SELECT') && sql.includes('FROM devices')) {
          const devices = self.tables.get('devices') || [];
          
          if (sql.includes('WHERE device_id = ?')) {
            return devices.find(d => d.device_id === params[0]);
          }
        }
        
        return undefined;
      },
      
      all(...params: any[]) {
        if (sql.includes('SELECT') && sql.includes('FROM passes')) {
          const passes = self.tables.get('passes') || [];
          
          // Handle WHERE clauses for sync endpoint
          if (sql.includes('WHERE created_at > ?')) {
            return passes.filter(p => {
              if (p.created_at <= params[0]) return false;
              if (sql.includes('expires_at > unixepoch()') && p.expires_at <= Math.floor(Date.now() / 1000)) return false;
              
              // Check granted_by or channel
              if (sql.includes('granted_by = ? OR channel')) {
                const grantedBy = params[1];
                if (p.granted_by !== grantedBy && p.channel !== 'device') return false;
              }
              
              return true;
            }).sort((a, b) => b.created_at - a.created_at).slice(0, 100);
          }
          
          return passes;
        }
        
        return [];
      },
      
      run(...params: any[]) {
        // Handle INSERTs
        if (sql.includes('INSERT INTO passes')) {
          const passes = self.tables.get('passes') || [];
          
          // Parse column names and values
          const newPass: MockRow = {
            id: params[0],
            number_e164: params[1],
            granted_by: params[2],
            granted_to_name: params[3],
            reason: params[4],
            expires_at: params[5],
            created_at: params[6] || Math.floor(Date.now() / 1000),
            used_count: params[7] || 0,
            max_uses: params[8] || null,
            channel: params[9] || null
          };
          
          passes.push(newPass);
          self.tables.set('passes', passes);
          
          return { changes: 1, lastID: newPass.id };
        } else if (sql.includes('INSERT INTO verification_attempts')) {
          const attempts = self.tables.get('verification_attempts') || [];
          
          const newAttempt: MockRow = {
            id: params[0],
            number_e164: params[1],
            name: params[2],
            reason: params[3],
            verification_token: params[4],
            expires_at: params[5],
            status: 'pending',
            completed_at: null
          };
          
          attempts.push(newAttempt);
          self.tables.set('verification_attempts', attempts);
          
          return { changes: 1, lastID: newAttempt.id };
        } else if (sql.includes('INSERT INTO call_logs')) {
          const logs = self.tables.get('call_logs') || [];
          
          const newLog: MockRow = {
            id: params[0],
            from_number: params[1],
            to_number: params[2],
            pass_id: params[3],
            blocked: params[4],
            timestamp: Math.floor(Date.now() / 1000)
          };
          
          logs.push(newLog);
          self.tables.set('call_logs', logs);
          
          return { changes: 1, lastID: newLog.id };
        } else if (sql.includes('INSERT INTO devices')) {
          const devices = self.tables.get('devices') || [];
          
          const newDevice: MockRow = {
            device_id: params[0],
            device_key: params[1],
            platform: params[2],
            model: params[3],
            app_version: params[4],
            created_at: params[5],
            last_seen_at: params[6],
            is_active: params[7] || 1
          };
          
          devices.push(newDevice);
          self.tables.set('devices', devices);
          
          return { changes: 1, lastID: newDevice.device_id };
        }
        
        // Handle UPDATEs
        if (sql.includes('UPDATE passes')) {
          const passes = self.tables.get('passes') || [];
          
          if (sql.includes('SET used_count = used_count + 1')) {
            const pass = passes.find(p => p.id === params[0]);
            if (pass) {
              pass.used_count = (pass.used_count || 0) + 1;
              return { changes: 1 };
            }
          } else if (sql.includes('SET expires_at = unixepoch() - 1')) {
            const pass = passes.find(p => p.id === params[0]);
            if (pass) {
              pass.expires_at = Math.floor(Date.now() / 1000) - 1;
              return { changes: 1 };
            }
          }
        } else if (sql.includes('UPDATE verification_attempts')) {
          const attempts = self.tables.get('verification_attempts') || [];
          
          if (sql.includes("SET status = 'completed'")) {
            const attempt = attempts.find(a => a.id === params[0]);
            if (attempt) {
              attempt.status = 'completed';
              attempt.completed_at = Math.floor(Date.now() / 1000);
              return { changes: 1 };
            }
          }
        } else if (sql.includes('UPDATE devices')) {
          const devices = self.tables.get('devices') || [];
          
          if (sql.includes('SET is_active = 0')) {
            const device = devices.find(d => d.device_id === params[0]);
            if (device) {
              device.is_active = 0;
              device.revoked_at = Math.floor(Date.now() / 1000);
              return { changes: 1 };
            }
          }
        }
        
        // Handle DELETEs
        if (sql.includes('DELETE FROM passes')) {
          const passes = self.tables.get('passes') || [];
          
          if (sql.includes("WHERE id LIKE 'test_%'")) {
            const filtered = passes.filter(p => !p.id.startsWith('test_'));
            self.tables.set('passes', filtered);
            return { changes: passes.length - filtered.length };
          }
        }
        
        return { changes: 0 };
      }
    };
  }

  close() {
    console.log('[verifd] Pure Mock DB closed');
  }
}

export default PureMockDatabase;