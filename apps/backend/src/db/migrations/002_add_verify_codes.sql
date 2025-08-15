-- Simple verify codes table for MVP flow
CREATE TABLE IF NOT EXISTS verify (
  code TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, verified, expired
  name TEXT,
  reason TEXT,
  voice_url TEXT,
  phone_number TEXT,
  verified_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_verify_expires_at ON verify(expires_at);
CREATE INDEX IF NOT EXISTS idx_verify_status ON verify(status);