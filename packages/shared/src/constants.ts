// Time constants
export const VPASS_EXPIRY_HOURS = 24;
export const VERIFICATION_EXPIRY_MINUTES = 15;
export const VOICE_PING_MAX_SECONDS = 3;
export const VOICE_PING_MAX_SIZE_BYTES = 500_000; // ~500KB

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