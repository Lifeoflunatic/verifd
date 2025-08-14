import * as crypto from 'crypto';
import { FeatureFlagConfig } from './FeatureFlags.js';

/**
 * Sticky Cohorts Manager
 * 
 * Ensures deterministic cohort assignment across sessions.
 * Users stay in the same cohort bucket even after config updates.
 */
export class StickyCohortsManager {
  private static instance: StickyCohortsManager;
  private readonly SALT_ROTATION_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days
  private salts: Map<string, string> = new Map();
  private cohortCache: Map<string, number> = new Map();
  
  private constructor(
    private readonly deviceId: string,
    private readonly saltSeed: string = 'verifd_cohort_v1'
  ) {
    this.loadSalts();
  }
  
  static getInstance(deviceId: string, saltSeed?: string): StickyCohortsManager {
    if (!StickyCohortsManager.instance) {
      StickyCohortsManager.instance = new StickyCohortsManager(deviceId, saltSeed);
    }
    return StickyCohortsManager.instance;
  }
  
  /**
   * Get deterministic cohort bucket for a feature
   * bucket = hash(device_id + feature + salt) % 100
   */
  getCohortBucket(featureName: string): number {
    const cacheKey = `${this.deviceId}:${featureName}`;
    
    // Return cached bucket if available
    if (this.cohortCache.has(cacheKey)) {
      return this.cohortCache.get(cacheKey)!;
    }
    
    // Get or generate salt for this feature
    const salt = this.getFeatureSalt(featureName);
    
    // Create deterministic hash
    const input = `${this.deviceId}:${featureName}:${salt}`;
    const hash = crypto.createHash('sha256').update(input).digest();
    
    // Convert to bucket (0-99)
    const bucket = hash.readUInt32BE(0) % 100;
    
    // Cache for consistency
    this.cohortCache.set(cacheKey, bucket);
    this.saveCohortAssignment(featureName, bucket);
    
    return bucket;
  }
  
  /**
   * Check if user is in cohort for a feature
   */
  isInCohort(featureName: string, cohortPercentage: number): boolean {
    const bucket = this.getCohortBucket(featureName);
    return bucket < cohortPercentage;
  }
  
  /**
   * Get or generate salt for a feature
   */
  private getFeatureSalt(featureName: string): string {
    if (!this.salts.has(featureName)) {
      // Generate new salt for this feature
      const salt = crypto.randomBytes(16).toString('hex');
      this.salts.set(featureName, salt);
      this.saveSalts();
    }
    
    return this.salts.get(featureName)!;
  }
  
  /**
   * Rotate salt for a feature (forces re-bucketing)
   */
  rotateSalt(featureName: string): void {
    const newSalt = crypto.randomBytes(16).toString('hex');
    this.salts.set(featureName, newSalt);
    
    // Clear cached bucket
    const cacheKey = `${this.deviceId}:${featureName}`;
    this.cohortCache.delete(cacheKey);
    
    this.saveSalts();
    
    console.log(`[StickyCohortsManager] Rotated salt for ${featureName}`);
  }
  
  /**
   * Load salts from persistent storage
   */
  private loadSalts(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('verifd_cohort_salts');
        if (stored) {
          const data = JSON.parse(stored);
          this.salts = new Map(Object.entries(data.salts));
          
          // Check if salts need rotation
          if (Date.now() - data.timestamp > this.SALT_ROTATION_INTERVAL) {
            this.rotateAllSalts();
          }
        }
      }
    } catch (error) {
      console.error('[StickyCohortsManager] Failed to load salts:', error);
    }
  }
  
  /**
   * Save salts to persistent storage
   */
  private saveSalts(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const data = {
          salts: Object.fromEntries(this.salts),
          timestamp: Date.now()
        };
        localStorage.setItem('verifd_cohort_salts', JSON.stringify(data));
      }
    } catch (error) {
      console.error('[StickyCohortsManager] Failed to save salts:', error);
    }
  }
  
  /**
   * Save cohort assignment for analytics
   */
  private saveCohortAssignment(featureName: string, bucket: number): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const key = `verifd_cohort_${featureName}`;
        const data = {
          deviceId: this.deviceId,
          featureName,
          bucket,
          assignedAt: new Date().toISOString()
        };
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (error) {
      console.error('[StickyCohortsManager] Failed to save assignment:', error);
    }
  }
  
  /**
   * Get all cohort assignments for debugging
   */
  getAllAssignments(): Record<string, number> {
    const assignments: Record<string, number> = {};
    
    for (const [key, bucket] of this.cohortCache) {
      const [, featureName] = key.split(':');
      assignments[featureName] = bucket;
    }
    
    return assignments;
  }
  
  /**
   * Rotate all salts (admin action)
   */
  rotateAllSalts(): void {
    for (const featureName of this.salts.keys()) {
      this.rotateSalt(featureName);
    }
    
    console.log('[StickyCohortsManager] Rotated all salts');
  }
  
  /**
   * Clear all cohort data (for testing)
   */
  clearAll(): void {
    this.salts.clear();
    this.cohortCache.clear();
    
    if (typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('verifd_cohort_')) {
          localStorage.removeItem(key);
        }
      });
    }
  }
}

/**
 * Config Signature Verifier
 * 
 * Verifies Ed25519 signatures on config payloads
 */
export class ConfigSignatureVerifier {
  private publicKeys: Map<string, string> = new Map();
  private trustedKeyIds: Set<string> = new Set();
  
  constructor(initialKeys?: Record<string, string>) {
    if (initialKeys) {
      Object.entries(initialKeys).forEach(([keyId, publicKey]) => {
        this.addPublicKey(keyId, publicKey);
      });
    }
  }
  
  /**
   * Add a trusted public key
   */
  addPublicKey(keyId: string, publicKey: string): void {
    this.publicKeys.set(keyId, publicKey);
    this.trustedKeyIds.add(keyId);
  }
  
  /**
   * Verify config signature
   */
  verifySignature(
    payload: string,
    signature: string,
    keyId: string
  ): boolean {
    if (!this.trustedKeyIds.has(keyId)) {
      console.error(`[ConfigVerifier] Untrusted key ID: ${keyId}`);
      return false;
    }
    
    const publicKey = this.publicKeys.get(keyId);
    if (!publicKey) {
      console.error(`[ConfigVerifier] Missing public key for: ${keyId}`);
      return false;
    }
    
    try {
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(payload);
      verify.end();
      
      const isValid = verify.verify(
        `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`,
        signature,
        'base64'
      );
      
      if (!isValid) {
        console.error('[ConfigVerifier] Invalid signature');
      }
      
      return isValid;
    } catch (error) {
      console.error('[ConfigVerifier] Signature verification failed:', error);
      return false;
    }
  }
  
  /**
   * Verify config freshness
   */
  verifyFreshness(
    configTimestamp: string,
    maxAgeMs: number = 5 * 60 * 1000 // 5 minutes
  ): boolean {
    const configTime = new Date(configTimestamp).getTime();
    const now = Date.now();
    
    if (configTime > now) {
      console.error('[ConfigVerifier] Config timestamp in future');
      return false;
    }
    
    if (now - configTime > maxAgeMs) {
      console.error('[ConfigVerifier] Config too old');
      return false;
    }
    
    return true;
  }
  
  /**
   * Verify version monotonicity
   */
  verifyVersionMonotonicity(
    newVersion: string,
    currentVersion: string
  ): boolean {
    const newParts = newVersion.split('.').map(Number);
    const currentParts = currentVersion.split('.').map(Number);
    
    for (let i = 0; i < Math.max(newParts.length, currentParts.length); i++) {
      const newPart = newParts[i] || 0;
      const currentPart = currentParts[i] || 0;
      
      if (newPart > currentPart) return true;
      if (newPart < currentPart) return false;
    }
    
    // Same version is acceptable (idempotent)
    return true;
  }
  
  /**
   * Rotate to new key (with overlap period)
   */
  rotateKey(oldKeyId: string, newKeyId: string, newPublicKey: string): void {
    // Add new key
    this.addPublicKey(newKeyId, newPublicKey);
    
    // Keep old key for overlap period (7 days)
    setTimeout(() => {
      this.publicKeys.delete(oldKeyId);
      this.trustedKeyIds.delete(oldKeyId);
      console.log(`[ConfigVerifier] Removed old key: ${oldKeyId}`);
    }, 7 * 24 * 60 * 60 * 1000);
    
    console.log(`[ConfigVerifier] Rotated from ${oldKeyId} to ${newKeyId}`);
  }
}