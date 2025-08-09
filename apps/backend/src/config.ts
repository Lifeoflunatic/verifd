export const config = {
  isDev: process.env.NODE_ENV !== 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || './data/verifd.db',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // vPass settings
  vpassExpiryHours: 24,
  vpassCleanupIntervalMinutes: 60,
  
  // Rate limiting
  maxVerifyAttemptsPerHour: 10,
  
  // Security
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  
  // Voice ping
  maxVoicePingSizeBytes: 500_000, // ~500KB for 3 seconds of audio
} as const;