/**
 * Key Rotation Manager - Dual-key verification with KID headers and drift alerts
 */

import { generateKeyPairSync, createPublicKey, verify } from 'crypto';
import { z } from 'zod';

// Key metadata schema
const KeyMetadataSchema = z.object({
  kid: z.string(), // Key ID
  alg: z.literal('EdDSA'),
  use: z.literal('sig'),
  kty: z.literal('OKP'),
  crv: z.literal('Ed25519'),
  x: z.string(), // Base64url encoded public key
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  isPrimary: z.boolean(),
});

// JWKS response schema
const JWKSSchema = z.object({
  keys: z.array(KeyMetadataSchema),
});

type KeyMetadata = z.infer<typeof KeyMetadataSchema>;
type JWKS = z.infer<typeof JWKSSchema>;

export class KeyRotationManager {
  private primaryKey: KeyMetadata | null = null;
  private secondaryKey: KeyMetadata | null = null;
  private readonly ROTATION_OVERLAP_DAYS = 7; // Dual-key window
  private readonly KEY_LIFETIME_DAYS = 30;
  private driftAlerts: DriftAlert[] = [];
  
  constructor(
    private readonly alertCallback?: (alert: DriftAlert) => void
  ) {}

  /**
   * Initialize with current keys
   */
  async initialize(): Promise<void> {
    const keys = await this.loadKeys();
    
    // Identify primary and secondary keys
    const now = new Date();
    const validKeys = keys.filter(k => 
      new Date(k.validFrom) <= now && new Date(k.validUntil) >= now
    );
    
    this.primaryKey = validKeys.find(k => k.isPrimary) || null;
    this.secondaryKey = validKeys.find(k => !k.isPrimary) || null;
    
    // Check if rotation is needed
    if (this.primaryKey) {
      const daysUntilExpiry = this.getDaysUntilExpiry(this.primaryKey);
      if (daysUntilExpiry <= this.ROTATION_OVERLAP_DAYS && !this.secondaryKey) {
        await this.initiateRotation();
      }
    } else {
      // No primary key, generate initial keypair
      await this.generateInitialKeys();
    }
  }

  /**
   * Verify signature with KID header
   */
  verifySignature(
    payload: string,
    signature: string,
    kid: string
  ): { valid: boolean; alert?: DriftAlert } {
    // Check if KID matches known keys
    if (this.primaryKey?.kid === kid) {
      const valid = this.verifyWithKey(payload, signature, this.primaryKey);
      return { valid };
    }
    
    if (this.secondaryKey?.kid === kid) {
      const valid = this.verifyWithKey(payload, signature, this.secondaryKey);
      
      // Alert: Client using secondary key (might be behind)
      const alert: DriftAlert = {
        type: 'secondary_key_usage',
        kid,
        timestamp: new Date().toISOString(),
        message: 'Client using secondary key - may need to refresh',
      };
      this.emitAlert(alert);
      
      return { valid, alert };
    }
    
    // Unknown KID - potential drift or attack
    const alert: DriftAlert = {
      type: 'unknown_kid',
      kid,
      timestamp: new Date().toISOString(),
      message: `Unknown KID detected: ${kid}`,
      severity: 'high',
    };
    this.emitAlert(alert);
    
    // Try both keys as fallback
    if (this.primaryKey) {
      const valid = this.verifyWithKey(payload, signature, this.primaryKey);
      if (valid) {
        const driftAlert: DriftAlert = {
          type: 'kid_mismatch_primary',
          kid,
          expectedKid: this.primaryKey.kid,
          timestamp: new Date().toISOString(),
          message: 'Signature valid with primary key but KID mismatch',
          severity: 'medium',
        };
        this.emitAlert(driftAlert);
        return { valid: true, alert: driftAlert };
      }
    }
    
    if (this.secondaryKey) {
      const valid = this.verifyWithKey(payload, signature, this.secondaryKey);
      if (valid) {
        const driftAlert: DriftAlert = {
          type: 'kid_mismatch_secondary',
          kid,
          expectedKid: this.secondaryKey.kid,
          timestamp: new Date().toISOString(),
          message: 'Signature valid with secondary key but KID mismatch',
          severity: 'medium',
        };
        this.emitAlert(driftAlert);
        return { valid: true, alert: driftAlert };
      }
    }
    
    // Signature invalid with all keys
    const invalidAlert: DriftAlert = {
      type: 'signature_verification_failed',
      kid,
      timestamp: new Date().toISOString(),
      message: 'Signature verification failed with all available keys',
      severity: 'critical',
    };
    this.emitAlert(invalidAlert);
    
    return { valid: false, alert: invalidAlert };
  }

  /**
   * Sign payload with current primary key
   */
  signPayload(payload: string): { signature: string; kid: string } {
    if (!this.primaryKey) {
      throw new Error('No primary key available for signing');
    }
    
    // In production, use private key from secure storage
    const signature = this.createSignature(payload, this.primaryKey);
    
    return {
      signature,
      kid: this.primaryKey.kid,
    };
  }

  /**
   * Get JWKS for public endpoint
   */
  getJWKS(): JWKS {
    const keys: KeyMetadata[] = [];
    
    if (this.primaryKey) {
      keys.push(this.primaryKey);
    }
    
    if (this.secondaryKey) {
      keys.push(this.secondaryKey);
    }
    
    return { keys };
  }

  /**
   * Initiate key rotation
   */
  async initiateRotation(): Promise<void> {
    console.log('[KeyRotation] Initiating key rotation');
    
    // Generate new keypair
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    
    const newKey: KeyMetadata = {
      kid: this.generateKID(),
      alg: 'EdDSA',
      use: 'sig',
      kty: 'OKP',
      crv: 'Ed25519',
      x: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'),
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + this.KEY_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      isPrimary: false, // Start as secondary
    };
    
    // Current primary becomes secondary
    if (this.primaryKey) {
      this.secondaryKey = { ...this.primaryKey, isPrimary: false };
    }
    
    // Save new key configuration
    await this.saveKeys([this.secondaryKey!, newKey]);
    
    // Schedule promotion to primary
    this.schedulePromotion(newKey);
    
    // Send rotation notification
    const alert: DriftAlert = {
      type: 'key_rotation_initiated',
      kid: newKey.kid,
      timestamp: new Date().toISOString(),
      message: `Key rotation initiated. New key ${newKey.kid} will become primary in ${this.ROTATION_OVERLAP_DAYS} days`,
      severity: 'info',
    };
    this.emitAlert(alert);
  }

  /**
   * Promote secondary key to primary
   */
  async promoteKey(): Promise<void> {
    if (!this.secondaryKey) {
      console.warn('[KeyRotation] No secondary key to promote');
      return;
    }
    
    console.log(`[KeyRotation] Promoting key ${this.secondaryKey.kid} to primary`);
    
    // Secondary becomes primary
    this.primaryKey = { ...this.secondaryKey, isPrimary: true };
    this.secondaryKey = null;
    
    // Save updated configuration
    await this.saveKeys([this.primaryKey]);
    
    // Alert about promotion
    const alert: DriftAlert = {
      type: 'key_promoted',
      kid: this.primaryKey.kid,
      timestamp: new Date().toISOString(),
      message: `Key ${this.primaryKey.kid} promoted to primary`,
      severity: 'info',
    };
    this.emitAlert(alert);
  }

  /**
   * Check for stale clients
   */
  async checkClientDrift(): Promise<void> {
    const recentAlerts = this.driftAlerts.filter(a => {
      const alertTime = new Date(a.timestamp);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return alertTime > hourAgo;
    });
    
    // Count drift types
    const unknownKidCount = recentAlerts.filter(a => a.type === 'unknown_kid').length;
    const secondaryUsageCount = recentAlerts.filter(a => a.type === 'secondary_key_usage').length;
    
    if (unknownKidCount > 10) {
      const alert: DriftAlert = {
        type: 'high_unknown_kid_rate',
        timestamp: new Date().toISOString(),
        message: `High rate of unknown KID errors: ${unknownKidCount} in last hour`,
        severity: 'critical',
        metadata: {
          count: unknownKidCount,
          threshold: 10,
        },
      };
      this.emitAlert(alert);
    }
    
    if (secondaryUsageCount > 50) {
      const alert: DriftAlert = {
        type: 'high_secondary_usage',
        timestamp: new Date().toISOString(),
        message: `Many clients still using secondary key: ${secondaryUsageCount} in last hour`,
        severity: 'warning',
        metadata: {
          count: secondaryUsageCount,
          threshold: 50,
        },
      };
      this.emitAlert(alert);
    }
  }

  /**
   * Get rotation schedule
   */
  getRotationSchedule(): RotationSchedule {
    const schedule: RotationSchedule = {
      currentPrimary: this.primaryKey ? {
        kid: this.primaryKey.kid,
        validUntil: this.primaryKey.validUntil,
        daysRemaining: this.getDaysUntilExpiry(this.primaryKey),
      } : null,
      currentSecondary: this.secondaryKey ? {
        kid: this.secondaryKey.kid,
        validFrom: this.secondaryKey.validFrom,
        promotionDate: new Date(
          new Date(this.secondaryKey.validFrom).getTime() + 
          this.ROTATION_OVERLAP_DAYS * 24 * 60 * 60 * 1000
        ).toISOString(),
      } : null,
      nextRotation: this.calculateNextRotation(),
    };
    
    return schedule;
  }

  // Private helper methods

  private verifyWithKey(payload: string, signature: string, key: KeyMetadata): boolean {
    try {
      const publicKey = createPublicKey({
        key: Buffer.from(key.x, 'base64url'),
        format: 'der',
        type: 'spki',
      });
      
      return verify(
        'sha256',
        Buffer.from(payload),
        publicKey,
        Buffer.from(signature, 'base64')
      );
    } catch (error) {
      console.error(`[KeyRotation] Verification error with key ${key.kid}:`, error);
      return false;
    }
  }

  private createSignature(payload: string, key: KeyMetadata): string {
    // In production, retrieve private key from secure storage
    // This is a placeholder
    return Buffer.from(`signature_${payload}_${key.kid}`).toString('base64');
  }

  private generateKID(): string {
    return `verifd_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private getDaysUntilExpiry(key: KeyMetadata): number {
    const expiry = new Date(key.validUntil);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private calculateNextRotation(): string {
    if (!this.primaryKey) {
      return new Date().toISOString();
    }
    
    const expiryDate = new Date(this.primaryKey.validUntil);
    const rotationDate = new Date(
      expiryDate.getTime() - this.ROTATION_OVERLAP_DAYS * 24 * 60 * 60 * 1000
    );
    
    return rotationDate.toISOString();
  }

  private schedulePromotion(key: KeyMetadata): void {
    const promotionDelay = this.ROTATION_OVERLAP_DAYS * 24 * 60 * 60 * 1000;
    
    setTimeout(() => {
      this.promoteKey();
    }, promotionDelay);
  }

  private emitAlert(alert: DriftAlert): void {
    this.driftAlerts.push(alert);
    
    // Keep only last 1000 alerts
    if (this.driftAlerts.length > 1000) {
      this.driftAlerts = this.driftAlerts.slice(-1000);
    }
    
    // Call alert callback if provided
    if (this.alertCallback) {
      this.alertCallback(alert);
    }
    
    // Log based on severity
    const logLevel = alert.severity === 'critical' ? 'error' :
                    alert.severity === 'high' ? 'warn' :
                    'info';
    
    console[logLevel](`[KeyRotation] ${alert.type}: ${alert.message}`);
  }

  private async loadKeys(): Promise<KeyMetadata[]> {
    // In production, load from secure storage
    // Placeholder implementation
    return [];
  }

  private async saveKeys(keys: KeyMetadata[]): Promise<void> {
    // In production, save to secure storage
    // Placeholder implementation
    console.log('[KeyRotation] Saving keys:', keys.map(k => k.kid));
  }

  private async generateInitialKeys(): Promise<void> {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    
    this.primaryKey = {
      kid: this.generateKID(),
      alg: 'EdDSA',
      use: 'sig',
      kty: 'OKP',
      crv: 'Ed25519',
      x: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'),
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + this.KEY_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      isPrimary: true,
    };
    
    await this.saveKeys([this.primaryKey]);
  }
}

// Type definitions

export interface DriftAlert {
  type: 
    | 'unknown_kid'
    | 'secondary_key_usage'
    | 'kid_mismatch_primary'
    | 'kid_mismatch_secondary'
    | 'signature_verification_failed'
    | 'key_rotation_initiated'
    | 'key_promoted'
    | 'high_unknown_kid_rate'
    | 'high_secondary_usage';
  kid?: string;
  expectedKid?: string;
  timestamp: string;
  message: string;
  severity?: 'info' | 'warning' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any>;
}

export interface RotationSchedule {
  currentPrimary: {
    kid: string;
    validUntil: string;
    daysRemaining: number;
  } | null;
  currentSecondary: {
    kid: string;
    validFrom: string;
    promotionDate: string;
  } | null;
  nextRotation: string;
}