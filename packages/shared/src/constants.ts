// Time constants
export const VPASS_EXPIRY_HOURS = 24;
export const VERIFICATION_EXPIRY_MINUTES = 15;
export const VOICE_PING_MAX_SECONDS = 3;
export const VOICE_PING_MAX_SIZE_BYTES = 500_000; // ~500KB

// vPass scope durations (in seconds)
export const VPASS_SCOPES = {
  '30m': 30 * 60,
  '24h': 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
} as const;

// Policy constants
export const POLICY = {
  voicePing: {
    maxPerDay: 3,
    businessHoursOnly: true,
    businessStart: '09:00',
    businessEnd: '17:00',
  },
  rateLimits: {
    perIp: { max: 5, windowMs: 60000 }, // 5 per minute
    perPhone: { max: 10, windowMs: 60000 }, // 10 per minute
  },
  channels: ['sms', 'wa', 'voice'] as const,
  defaultChannel: 'sms' as const,
  defaultScope: '24h' as const,
} as const;

// SMS Template
export const IDENTITY_PING_TEMPLATE = `Hi {{recipientName}}, this is {{senderName}}. I'm trying to reach you about: {{reason}}. 

Verify my identity (expires in {{expiryMinutes}} min):
{{verifyUrl}}

Reply STOP to opt out.`;

// Rate limits
export const MAX_VERIFY_ATTEMPTS_PER_HOUR = 10;
export const MAX_PASSES_PER_RECIPIENT = 100;

// UI Messages
export const UI_MESSAGES = {
  PASS_GRANTED: 'vPass granted for 24 hours',
  PASS_EXPIRED: 'This vPass has expired',
  VERIFICATION_EXPIRED: 'This verification link has expired',
  VERIFICATION_COMPLETE: 'Identity verified successfully',
  UNKNOWN_CALLER_LABEL: 'Unknown (verifd pending)',
  VERIFIED_CALLER_PREFIX: '✓ verifd:',
} as const;

// Platform-specific constants
export const ANDROID_MIN_SDK = 26; // Android 8.0
export const IOS_MIN_VERSION = '15.0';

// API Endpoints (relative)
export const API_ENDPOINTS = {
  VERIFY_START: '/verify/start',
  VERIFY_SUBMIT: '/verify/submit',
  VERIFY_STATUS: '/verify/status',
  PASS_CHECK: '/pass/check',
  PASS_LIST: '/pass/list',
  PASS_REVOKE: '/pass',
  HEALTH: '/health',
  METRICS: '/health/metrics',
} as const;