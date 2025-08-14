import { RiskAssessment, CallMetrics } from '../src/risk/RiskAssessment';

describe('RiskAssessment', () => {
  let riskAssessment: RiskAssessment;
  
  beforeEach(() => {
    riskAssessment = new RiskAssessment({ enableRiskScoring: true });
  });
  
  afterEach(() => {
    riskAssessment.clearHistory();
  });
  
  describe('Burst Detection', () => {
    it('should detect burst calling pattern', () => {
      const phoneNumber = '+15551234567';
      const baseTime = Date.now();
      
      // Simulate 4 calls in rapid succession
      for (let i = 0; i < 4; i++) {
        const metrics: CallMetrics = {
          phoneNumber,
          timestamp: baseTime + (i * 10000), // 10 seconds apart
          stirShaken: null
        };
        
        const score = riskAssessment.assessCall(metrics);
        
        if (i >= 2) { // After 3rd call
          expect(score.factors.burst).toBeGreaterThan(0);
          expect(score.overall).toBeGreaterThan(30);
        }
      }
    });
    
    it('should not flag normal calling pattern', () => {
      const phoneNumber = '+15551234567';
      const baseTime = Date.now();
      
      // Simulate 2 calls 5 minutes apart
      const metrics1: CallMetrics = {
        phoneNumber,
        timestamp: baseTime,
        stirShaken: 'A'
      };
      
      const metrics2: CallMetrics = {
        phoneNumber,
        timestamp: baseTime + (5 * 60 * 1000), // 5 minutes later
        stirShaken: 'A'
      };
      
      riskAssessment.assessCall(metrics1);
      const score = riskAssessment.assessCall(metrics2);
      
      expect(score.factors.burst).toBe(0);
      expect(score.recommendation).toBe('allow');
    });
  });
  
  describe('ASN Scoring', () => {
    it('should flag risky ASNs', () => {
      const metrics: CallMetrics = {
        phoneNumber: '+15551234567',
        timestamp: Date.now(),
        asn: 'AS13335', // Known risky ASN
        stirShaken: null
      };
      
      const score = riskAssessment.assessCall(metrics);
      
      expect(score.factors.asn).toBe(80);
      expect(score.overall).toBeGreaterThan(30);
    });
    
    it('should trust carrier ASNs', () => {
      const metrics: CallMetrics = {
        phoneNumber: '+15551234567',
        timestamp: Date.now(),
        asn: 'AS7018', // AT&T
        stirShaken: 'A'
      };
      
      const score = riskAssessment.assessCall(metrics);
      
      expect(score.factors.asn).toBe(20);
      expect(score.recommendation).toBe('allow');
    });
  });
  
  describe('Pacing Analysis', () => {
    it('should detect robotic pacing', () => {
      const phoneNumber = '+15551234567';
      const baseTime = Date.now();
      
      // Simulate exact 30-second intervals (robotic)
      for (let i = 0; i < 5; i++) {
        const metrics: CallMetrics = {
          phoneNumber,
          timestamp: baseTime + (i * 30000), // Exactly 30 seconds
          stirShaken: null
        };
        
        const score = riskAssessment.assessCall(metrics);
        
        if (i >= 2) { // After enough samples
          expect(score.factors.pacing).toBeGreaterThan(50);
        }
      }
    });
    
    it('should allow human-like pacing', () => {
      const phoneNumber = '+15551234567';
      const baseTime = Date.now();
      
      // Simulate irregular intervals (human-like)
      const intervals = [0, 45000, 92000, 156000, 234000]; // Varied intervals
      
      intervals.forEach((interval, i) => {
        const metrics: CallMetrics = {
          phoneNumber,
          timestamp: baseTime + interval,
          stirShaken: 'A'
        };
        
        const score = riskAssessment.assessCall(metrics);
        
        if (i >= 2) {
          expect(score.factors.pacing).toBeLessThan(50);
        }
      });
    });
  });
  
  describe('STIR/SHAKEN Attestation', () => {
    it('should trust full attestation', () => {
      const metrics: CallMetrics = {
        phoneNumber: '+15551234567',
        timestamp: Date.now(),
        stirShaken: 'A'
      };
      
      const score = riskAssessment.assessCall(metrics);
      
      expect(score.factors.attestation).toBe(10);
    });
    
    it('should flag missing attestation', () => {
      const metrics: CallMetrics = {
        phoneNumber: '+15551234567',
        timestamp: Date.now(),
        stirShaken: null
      };
      
      const score = riskAssessment.assessCall(metrics);
      
      expect(score.factors.attestation).toBe(70);
    });
  });
  
  describe('Shadow Mode', () => {
    it('should not skip notifications in shadow mode', () => {
      riskAssessment.setShadowMode(true);
      
      // Create high-risk call
      const phoneNumber = '+15551234567';
      const baseTime = Date.now();
      
      // Burst pattern with risky ASN
      for (let i = 0; i < 5; i++) {
        const metrics: CallMetrics = {
          phoneNumber,
          timestamp: baseTime + (i * 1000), // 1 second apart
          asn: 'AS13335',
          stirShaken: null
        };
        
        const score = riskAssessment.assessCall(metrics);
        
        // Even with high risk score, should not skip in shadow mode
        expect(score.skipCallLog).toBe(false);
        expect(score.skipNotification).toBe(false);
      }
    });
    
    it('should skip notifications when not in shadow mode', () => {
      riskAssessment.setShadowMode(false);
      
      // Create high-risk call pattern
      const phoneNumber = '+15551234567';
      const baseTime = Date.now();
      
      for (let i = 0; i < 5; i++) {
        const metrics: CallMetrics = {
          phoneNumber,
          timestamp: baseTime + (i * 1000),
          asn: 'AS13335',
          stirShaken: null
        };
        
        const score = riskAssessment.assessCall(metrics);
        
        if (i >= 3) {
          expect(score.overall).toBeGreaterThan(70);
          // Should recommend skipping when score is high enough
          if (score.overall > 80) {
            expect(score.skipCallLog).toBe(true);
          }
          if (score.overall > 90) {
            expect(score.skipNotification).toBe(true);
          }
        }
      }
    });
  });
  
  describe('Feature Flag', () => {
    it('should return default score when disabled', () => {
      const disabledAssessment = new RiskAssessment({ enableRiskScoring: false });
      
      const metrics: CallMetrics = {
        phoneNumber: '+15551234567',
        timestamp: Date.now(),
        asn: 'AS13335', // Risky ASN
        stirShaken: null
      };
      
      const score = disabledAssessment.assessCall(metrics);
      
      expect(score.overall).toBe(0);
      expect(score.recommendation).toBe('allow');
      expect(score.skipCallLog).toBe(false);
      expect(score.skipNotification).toBe(false);
    });
  });
});