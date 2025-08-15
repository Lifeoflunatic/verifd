// Core vPass types
export interface VPass {
  id: string;
  phoneNumber: string;
  grantedBy: string;
  grantedToName: string;
  reason?: string;
  expiresAt: number;
  createdAt: number;
  usedCount: number;
  maxUses?: number;
  metadata?: Record<string, unknown>;
}

export enum VPassStatus {
  Active = 'active',
  Expired = 'expired',
  Revoked = 'revoked',
  Exhausted = 'exhausted'
}

// Verification types
export interface VerificationAttempt {
  id: string;
  phoneNumber: string;
  name: string;
  reason: string;
  voicePingUrl?: string;
  verificationToken: string;
  status: VerificationStatus;
  createdAt: number;
  completedAt?: number;
  expiresAt: number;
}

export enum VerificationStatus {
  Pending = 'pending',
  Completed = 'completed',
  Expired = 'expired'
}

// API Request/Response types
export interface VerifyStartRequest {
  phoneNumber: string;
  name: string;
  reason: string;
  voicePing?: string; // Base64 encoded
}

export interface VerifyStartResponse {
  success: boolean;
  token: string;
  vanity_url: string;
  number_e164: string;
  expires_at: string; // ISO8601 format
}

export interface VerifySubmitRequest {
  token: string;
  recipientPhone: string;
  grantPass: boolean;
}

export interface VerifySubmitResponse {
  success: boolean;
  passGranted: boolean;
  passId?: string;
  callerName: string;
}

export interface CheckPassRequest {
  fromNumber: string;
  toNumber: string;
}

export interface CheckPassResponse {
  hasValidPass: boolean;
  passId?: string;
  callerName?: string;
  reason?: string;
  expiresAt?: number;
}

// New response type for GET /pass/check endpoint
export interface PassCheckResponse {
  allowed: boolean;
  scope?: '30m' | '24h' | '30d';
  expires_at?: string; // ISO8601 format
}

// New verify flow types for MVP
export interface VerifyCodeStartRequest {
  phoneNumber?: string; // Optional for MVP
}

export interface VerifyCodeStartResponse {
  code: string;
  verifyUrl: string;
  expiresIn: number; // seconds
}

export interface VerifyCodeStatusResponse {
  status: 'pending' | 'verified' | 'expired';
  name?: string;
  reason?: string;
}

export interface VerifyCodeSubmitRequest {
  code: string;
  name: string;
  reason: string;
  voiceUrl?: string;
}

export interface VerifyCodeSubmitResponse {
  ok: boolean;
}

export interface PassCheckQueryResponse {
  pass: '30m' | '24h' | '30d' | null;
}

export interface VoiceUploadResponse {
  voiceUrl: string;
}

// SMS Templates
export interface IdentityPingTemplate {
  name: string;
  reason: string;
  verifyUrl: string;
  expiryMinutes: number;
}

// Call handling
export interface CallScreeningResult {
  action: CallAction;
  label?: string;
  message?: string;
}

export enum CallAction {
  Allow = 'allow',
  Block = 'block',
  Screen = 'screen',
  SendToVoicemail = 'voicemail'
}