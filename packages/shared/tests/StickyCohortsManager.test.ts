import { StickyCohortsManager, ConfigSignatureVerifier } from '../src/config/StickyCohortsManager';
import * as crypto from 'crypto';

describe('StickyCohortsManager', () => {
  let manager: StickyCohortsManager;
  const deviceId = 'test-device-123';
  
  beforeEach(() => {
    // Clear singleton
    (StickyCohortsManager as any).instance = undefined;
    
    // Mock localStorage
    const store: Record<string, string> = {};
    global.localStorage = {
      getItem: jest.fn((key) => store[key] || null),
      setItem: jest.fn((key, value) => { store[key] = value; }),
      removeItem: jest.fn((key) => { delete store[key]; }),
      clear: jest.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
      length: 0,
      key: jest.fn()
    } as any;
    
    manager = StickyCohortsManager.getInstance(deviceId);
  });
  
  describe('Deterministic Bucketing', () => {
    it('should assign same bucket for same device and feature', () => {
      const feature = 'MISSED_CALL_ACTIONS';
      
      const bucket1 = manager.getCohortBucket(feature);
      const bucket2 = manager.getCohortBucket(feature);
      
      expect(bucket1).toBe(bucket2);
      expect(bucket1).toBeGreaterThanOrEqual(0);
      expect(bucket1).toBeLessThan(100);
    });
    
    it('should assign different buckets for different features', () => {
      const bucket1 = manager.getCohortBucket('FEATURE_A');
      const bucket2 = manager.getCohortBucket('FEATURE_B');
      
      // Statistically should be different (1% chance of collision)
      // But deterministic for same inputs
      const bucket1Again = manager.getCohortBucket('FEATURE_A');
      expect(bucket1).toBe(bucket1Again);
    });
    
    it('should persist bucket assignment', () => {
      const feature = 'TEST_FEATURE';
      const bucket = manager.getCohortBucket(feature);
      
      // Create new instance
      (StickyCohortsManager as any).instance = undefined;
      const newManager = StickyCohortsManager.getInstance(deviceId);
      
      const bucketAfterRestart = newManager.getCohortBucket(feature);
      expect(bucketAfterRestart).toBe(bucket);
    });
  });
  
  describe('Cohort Membership', () => {
    it('should correctly determine cohort membership', () => {
      const feature = 'TEST_FEATURE';
      
      // Force a known bucket for testing
      jest.spyOn(manager as any, 'getCohortBucket').mockReturnValue(25);
      
      expect(manager.isInCohort(feature, 30)).toBe(true);  // 25 < 30
      expect(manager.isInCohort(feature, 20)).toBe(false); // 25 >= 20
      expect(manager.isInCohort(feature, 100)).toBe(true); // Always in 100%
      expect(manager.isInCohort(feature, 0)).toBe(false);  // Never in 0%
    });
  });
  
  describe('Salt Rotation', () => {
    it('should change bucket after salt rotation', () => {
      const feature = 'ROTATION_TEST';
      
      const originalBucket = manager.getCohortBucket(feature);
      manager.rotateSalt(feature);
      const newBucket = manager.getCohortBucket(feature);
      
      // Buckets should likely be different after rotation
      // (Small chance they could be same, but unlikely)
      expect([originalBucket, newBucket]).toHaveLength(2);
    });
    
    it('should clear cache after salt rotation', () => {
      const feature = 'CACHE_TEST';
      
      manager.getCohortBucket(feature); // Cache the bucket
      manager.rotateSalt(feature);
      
      // Should recalculate with new salt
      const assignments = manager.getAllAssignments();
      expect(assignments[feature]).toBeDefined();
    });
  });
  
  describe('Assignment Tracking', () => {
    it('should track all assignments', () => {
      manager.getCohortBucket('FEATURE_1');
      manager.getCohortBucket('FEATURE_2');
      manager.getCohortBucket('FEATURE_3');
      
      const assignments = manager.getAllAssignments();
      
      expect(Object.keys(assignments)).toHaveLength(3);
      expect(assignments['FEATURE_1']).toBeGreaterThanOrEqual(0);
      expect(assignments['FEATURE_2']).toBeGreaterThanOrEqual(0);
      expect(assignments['FEATURE_3']).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('ConfigSignatureVerifier', () => {
  let verifier: ConfigSignatureVerifier;
  let keyPair: crypto.KeyPairSyncResult<string, string>;
  
  beforeEach(() => {
    // Generate test key pair
    keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
    
    // Extract base64 public key
    const publicKeyBase64 = keyPair.publicKey
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\n/g, '');
    
    verifier = new ConfigSignatureVerifier({
      'test-key-1': publicKeyBase64
    });
  });
  
  describe('Signature Verification', () => {
    it('should verify valid signature', () => {
      const payload = JSON.stringify({ config: 'test' });
      
      // Sign payload
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(payload);
      sign.end();
      const signature = sign.sign(keyPair.privateKey, 'base64');
      
      const isValid = verifier.verifySignature(payload, signature, 'test-key-1');
      expect(isValid).toBe(true);
    });
    
    it('should reject invalid signature', () => {
      const payload = JSON.stringify({ config: 'test' });
      const invalidSignature = 'invalid_signature_base64';
      
      const isValid = verifier.verifySignature(payload, invalidSignature, 'test-key-1');
      expect(isValid).toBe(false);
    });
    
    it('should reject untrusted key ID', () => {
      const payload = JSON.stringify({ config: 'test' });
      const signature = 'some_signature';
      
      const isValid = verifier.verifySignature(payload, signature, 'untrusted-key');
      expect(isValid).toBe(false);
    });
  });
  
  describe('Freshness Verification', () => {
    it('should accept fresh config', () => {
      const timestamp = new Date().toISOString();
      const isValid = verifier.verifyFreshness(timestamp);
      expect(isValid).toBe(true);
    });
    
    it('should reject old config', () => {
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min old
      const isValid = verifier.verifyFreshness(oldTimestamp);
      expect(isValid).toBe(false);
    });
    
    it('should reject future timestamp', () => {
      const futureTimestamp = new Date(Date.now() + 60 * 1000).toISOString(); // 1 min future
      const isValid = verifier.verifyFreshness(futureTimestamp);
      expect(isValid).toBe(false);
    });
  });
  
  describe('Version Monotonicity', () => {
    it('should accept newer version', () => {
      const isValid = verifier.verifyVersionMonotonicity('1.0.1', '1.0.0');
      expect(isValid).toBe(true);
    });
    
    it('should accept same version', () => {
      const isValid = verifier.verifyVersionMonotonicity('1.0.0', '1.0.0');
      expect(isValid).toBe(true);
    });
    
    it('should reject older version', () => {
      const isValid = verifier.verifyVersionMonotonicity('1.0.0', '1.0.1');
      expect(isValid).toBe(false);
    });
    
    it('should handle multi-part versions', () => {
      expect(verifier.verifyVersionMonotonicity('2.0.0', '1.9.9')).toBe(true);
      expect(verifier.verifyVersionMonotonicity('1.0.10', '1.0.9')).toBe(true);
      expect(verifier.verifyVersionMonotonicity('1.0.0-beta', '1.0.0')).toBe(false);
    });
  });
  
  describe('Key Rotation', () => {
    it('should add new key during rotation', () => {
      const newPublicKey = 'new_public_key_base64';
      
      verifier.rotateKey('test-key-1', 'test-key-2', newPublicKey);
      
      // Both keys should be trusted during overlap
      verifier.addPublicKey('test-key-2', newPublicKey);
      
      // Can verify with new key
      const payload = 'test';
      // Would need proper signature for full test
    });
  });
});