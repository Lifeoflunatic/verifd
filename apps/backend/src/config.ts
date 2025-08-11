// Centralized configuration for the backend
import { config as loadEnv } from 'dotenv';

// Load environment variables
loadEnv();

export const config = {
  // Server
  isDev: process.env.NODE_ENV !== 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  timezone: process.env.TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone,
  
  // Database
  dbDriver: process.env.USE_MOCK_DB === 'true' ? 'mock' : (process.env.DB_DRIVER || 'sqlite'), // 'sqlite' | 'mock'
  dbPath: process.env.DB_PATH || 'var/db/verifd.sqlite',
  databaseUrl: process.env.DATABASE_URL || './data/verifd.db',
  
  // Security
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  hmacSecret: process.env.HMAC_SECRET || 'dev-hmac-secret-change-in-production',
  
  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  webVerifyDevOrigin: process.env.WEB_VERIFY_DEV_ORIGIN || 'http://localhost:3001',
  
  // Voice Ping
  maxVoicePingSizeBytes: 500_000, // ~500KB for 3 seconds of audio
  voicePing: {
    maxPerDay: parseInt(process.env.VOICE_PING_MAX_PER_DAY || '3', 10),
    businessHoursOnly: process.env.VOICE_PING_BUSINESS_HOURS_ONLY === 'true',
    businessStart: process.env.VOICE_PING_BUSINESS_START || '09:00',
    businessEnd: process.env.VOICE_PING_BUSINESS_END || '17:00',
  },
  
  // vPass settings
  vpassExpiryHours: 24,
  vpassCleanupIntervalMinutes: 60,
  vpass: {
    defaultScope: process.env.VPASS_DEFAULT_SCOPE || '24h',
    scopes: (process.env.VPASS_SCOPES || '30m,24h,30d').split(','),
  },
  
  // Rate limiting
  maxVerifyAttemptsPerHour: 10,
  rateLimits: {
    perIp: {
      max: parseInt(process.env.RATE_LIMIT_PER_IP_MAX || '5', 10),
      windowMs: parseInt(process.env.RATE_LIMIT_PER_IP_WINDOW || '60000', 10), // 1 minute
    },
    perPhone: {
      max: parseInt(process.env.RATE_LIMIT_PER_PHONE_MAX || '10', 10),
      windowMs: parseInt(process.env.RATE_LIMIT_PER_PHONE_WINDOW || '60000', 10), // 1 minute
    },
  },
  
  // Channels
  channels: {
    available: (process.env.CHANNELS || 'sms,wa,voice').split(','),
    default: process.env.DEFAULT_CHANNEL || 'sms',
  },
} as const;

// Helper to get vPass duration in seconds
export function getVPassDurationSeconds(scope: string): number {
  switch (scope) {
    case '30m': return 30 * 60;
    case '24h': return 24 * 60 * 60;
    case '30d': return 30 * 24 * 60 * 60;
    default: return 24 * 60 * 60; // Default to 24h
  }
}

// Validate if a scope is allowed
export function isValidScope(scope: string): boolean {
  const allowedScopes = new Set(config.vpass.scopes);
  return allowedScopes.has(scope);
}

// Get validated scope or default
export function getValidatedScope(requestedScope?: string): string {
  if (requestedScope && isValidScope(requestedScope)) {
    return requestedScope;
  }
  return config.vpass.defaultScope;
}