/**
 * Staging Override System - Test users with forced feature flags
 */

export interface OverrideConfig {
  phoneNumbers: string[];
  flags: {
    MISSED_CALL_ACTIONS: number;
    enableTemplates: boolean;
    enableRiskScoring: 'off' | 'shadow' | 'enforce';
  };
  bypassGeo: boolean;
}

// Staging test users - always get full features
export const STAGING_OVERRIDES: OverrideConfig = {
  phoneNumbers: [
    '+919233600392',  // Tester 1
    '+917575854485',  // Tester 2
  ],
  flags: {
    MISSED_CALL_ACTIONS: 100,  // Always enabled
    enableTemplates: true,
    enableRiskScoring: 'shadow',
  },
  bypassGeo: true,  // Bypass GEO restrictions
};

// Default GEO gate for staging
export const STAGING_GEO_GATE = 'IN';  // India only by default

/**
 * Check if a phone number has override privileges
 */
export function hasOverride(phoneNumber: string): boolean {
  return STAGING_OVERRIDES.phoneNumbers.includes(phoneNumber);
}

/**
 * Get feature flags for a user
 */
export function getUserFeatureFlags(
  phoneNumber: string,
  defaultFlags: any,
  userGeo?: string
): any {
  // Check for override
  if (hasOverride(phoneNumber)) {
    console.log(`[Override] User ${phoneNumber.slice(-4)} gets full features`);
    return {
      ...defaultFlags,
      ...STAGING_OVERRIDES.flags,
      geo: 'OVERRIDE',
      overrideActive: true,
    };
  }

  // Apply GEO gate for non-override users
  if (userGeo && userGeo !== STAGING_GEO_GATE) {
    console.log(`[GeoGate] User in ${userGeo}, blocking features (staging allows ${STAGING_GEO_GATE} only)`);
    return {
      ...defaultFlags,
      MISSED_CALL_ACTIONS: 0,
      enableTemplates: false,
      enableRiskScoring: 'off',
      geo: userGeo,
      geoBlocked: true,
    };
  }

  // Default staging flags for IN users
  return {
    ...defaultFlags,
    geo: userGeo || 'unknown',
  };
}

/**
 * Get cohort assignment for a user
 */
export function getUserCohort(phoneNumber: string, seed: string): string {
  if (hasOverride(phoneNumber)) {
    return 'override_100';
  }

  // Standard cohort calculation
  const crypto = require('crypto');
  const hash = crypto
    .createHash('sha256')
    .update(`${phoneNumber}:${seed}`)
    .digest('hex');
  
  const bucket = parseInt(hash.slice(0, 8), 16) % 100;
  
  if (bucket < 5) return 'canary_5';
  if (bucket < 20) return 'canary_20';
  if (bucket < 50) return 'ga_50';
  return 'control';
}

/**
 * Audit log entry for override usage
 */
export function logOverrideUsage(phoneNumber: string, action: string): void {
  const entry = {
    timestamp: new Date().toISOString(),
    action: 'override_used',
    phoneNumber: phoneNumber.slice(-4),  // Last 4 digits only
    overrideAction: action,
    flags: STAGING_OVERRIDES.flags,
  };
  
  console.log('[OverrideAudit]', JSON.stringify(entry));
}

/**
 * Get list of staging override phone numbers
 */
export function getStagingOverrideNumbers(): string[] {
  return STAGING_OVERRIDES.phoneNumbers;
}
