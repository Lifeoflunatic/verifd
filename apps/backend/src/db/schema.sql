-- vPasses table: Temporary verification passes
CREATE TABLE IF NOT EXISTS passes (
  id TEXT PRIMARY KEY,
  number_e164 TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_to_name TEXT NOT NULL,
  reason TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  used_count INTEGER DEFAULT 0,
  max_uses INTEGER DEFAULT NULL,
  metadata TEXT -- JSON field for additional data
);

-- Composite index for /pass/check endpoint (number + expiry)
CREATE INDEX IF NOT EXISTS idx_passes_number_exp ON passes(number_e164, expires_at);
-- Index for granted_by queries (list passes by phone number)
CREATE INDEX IF NOT EXISTS idx_passes_granted_by ON passes(granted_by);

-- Verification attempts table
CREATE TABLE IF NOT EXISTS verification_attempts (
  id TEXT PRIMARY KEY,
  number_e164 TEXT NOT NULL,
  name TEXT NOT NULL,
  reason TEXT NOT NULL,
  voice_ping_url TEXT,
  verification_token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, expired
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_attempts_token ON verification_attempts(verification_token);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_expires_at ON verification_attempts(expires_at);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_number_e164 ON verification_attempts(number_e164);

-- Call logs table (for analytics)
CREATE TABLE IF NOT EXISTS call_logs (
  id TEXT PRIMARY KEY,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  pass_id TEXT,
  blocked BOOLEAN DEFAULT FALSE,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (pass_id) REFERENCES passes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_call_logs_timestamp ON call_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_call_logs_from_number ON call_logs(from_number);

-- Devices table for mobile authentication
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  device_key TEXT NOT NULL,
  platform TEXT, -- 'ios' or 'android'
  model TEXT,
  app_version TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  is_active INTEGER DEFAULT 1,
  revoked_at INTEGER,
  metadata TEXT -- JSON field for additional data
);

CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_devices_active ON devices(is_active);

-- Add channel column to passes if not exists
-- This tracks how the pass was granted: 'sms', 'wa', 'voice', 'device'
ALTER TABLE passes ADD COLUMN channel TEXT DEFAULT 'sms';
CREATE INDEX IF NOT EXISTS idx_call_logs_to_number ON call_logs(to_number);