import { PrivacyTelemetry, AggregatedMetrics } from '../src/telemetry/PrivacyTelemetry';

describe('PrivacyTelemetry', () => {
  let telemetry: PrivacyTelemetry;
  
  beforeEach(() => {
    // Clear singleton instance
    (PrivacyTelemetry as any).instance = undefined;
    
    // Mock localStorage
    const localStorageMock = {
      store: {} as Record<string, string>,
      getItem: jest.fn((key: string) => localStorageMock.store[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        localStorageMock.store[key] = value;
      })
    };
    
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
    
    // Mock fetch
    global.fetch = jest.fn();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
    if (telemetry) {
      telemetry.stop();
    }
  });
  
  describe('Privacy Protection', () => {
    it('should not collect telemetry when disabled', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: false });
      
      const consoleSpy = jest.spyOn(console, 'log');
      
      telemetry.recordCounter('test.metric', 1);
      telemetry.recordCounter('test.metric', 2);
      
      expect(consoleSpy).not.toHaveBeenCalled();
    });
    
    it('should sanitize metric names to remove PII', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      // Record with potential PII
      telemetry.recordCounter('user.15551234567.action', 1);
      telemetry.recordCounter('session.a1b2c3d4e5f6g7h8.event', 1);
      
      // Metrics should be sanitized
      const counters = (telemetry as any).counters;
      const keys = Array.from(counters.keys());
      
      expect(keys[0]).toBe('user.XXXX.action');
      expect(keys[1]).toBe('session.HASH.event');
    });
    
    it('should generalize country to region', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      telemetry.recordCounter('test.metric', 1, { country: 'US' });
      telemetry.recordCounter('test.metric', 1, { country: 'FR' });
      telemetry.recordCounter('test.metric', 1, { country: 'CN' });
      
      const counters = (telemetry as any).counters.get('test.metric');
      
      expect(counters[0].metadata.country).toBe('NA'); // US -> North America
      expect(counters[1].metadata.country).toBe('EU'); // FR -> Europe
      expect(counters[2].metadata.country).toBe('AS'); // CN -> Asia
    });
    
    it('should clamp values to reasonable range', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      telemetry.recordCounter('test.metric', -10);
      telemetry.recordCounter('test.metric', 1000);
      
      const counters = (telemetry as any).counters.get('test.metric');
      
      expect(counters[0].value).toBe(0); // Clamped to 0
      expect(counters[1].value).toBe(100); // Clamped to 100
    });
  });
  
  describe('Differential Privacy', () => {
    it('should add Laplace noise to aggregated metrics', async () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      // Record exact values
      for (let i = 0; i < 10; i++) {
        telemetry.recordCounter('test.metric', 5);
      }
      
      // Aggregate with privacy
      const aggregateMethod = (telemetry as any).aggregateWithPrivacy.bind(telemetry);
      const counters = (telemetry as any).counters.get('test.metric');
      const aggregated = aggregateMethod(counters);
      
      // Values should be noised
      expect(aggregated.count).not.toBe(10); // Exact count unlikely with noise
      expect(aggregated.sum).not.toBe(50); // Exact sum unlikely with noise
      expect(aggregated.noise).toBeGreaterThan(0); // Noise should be tracked
    });
    
    it('should respect privacy budget', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      const initialBudget = telemetry.getPrivacyBudget();
      expect(initialBudget).toBe(1.0);
      
      // Use privacy budget
      const addNoiseMethod = (telemetry as any).addLaplaceNoise.bind(telemetry);
      for (let i = 0; i < 10; i++) {
        addNoiseMethod(10);
      }
      
      const remainingBudget = telemetry.getPrivacyBudget();
      expect(remainingBudget).toBeLessThan(initialBudget);
      expect(remainingBudget).toBeGreaterThan(0);
    });
    
    it('should increase noise when privacy budget exhausted', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      // Exhaust privacy budget
      (telemetry as any).privacyBudget = 0;
      
      const addNoiseMethod = (telemetry as any).addLaplaceNoise.bind(telemetry);
      
      // Collect multiple noised values
      const noisedValues = [];
      for (let i = 0; i < 10; i++) {
        noisedValues.push(addNoiseMethod(10));
      }
      
      // Calculate variance (should be high with exhausted budget)
      const mean = noisedValues.reduce((a, b) => a + b, 0) / noisedValues.length;
      const variance = noisedValues.reduce((sum, val) => {
        return sum + Math.pow(val - mean, 2);
      }, 0) / noisedValues.length;
      
      expect(variance).toBeGreaterThan(10); // High variance expected
    });
  });
  
  describe('Batching and Flushing', () => {
    it('should batch counters before sending', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      // Record below batch size
      for (let i = 0; i < 50; i++) {
        telemetry.recordCounter('test.metric', 1);
      }
      
      const counters = (telemetry as any).counters.get('test.metric');
      expect(counters.length).toBe(50); // Still in queue
    });
    
    it('should auto-flush when batch size reached', async () => {
      telemetry = PrivacyTelemetry.getInstance({ 
        enableTelemetry: true,
        telemetryEndpoint: 'https://api.verifd.com/telemetry'
      });
      
      const fetchMock = global.fetch as jest.Mock;
      fetchMock.mockResolvedValue({ ok: true });
      
      // Record exactly batch size (100)
      for (let i = 0; i < 100; i++) {
        telemetry.recordCounter('test.metric', 1);
      }
      
      // Wait for async flush
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.verifd.com/telemetry',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });
    
    it('should prevent unbounded queue growth', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      // Record more than max queue size
      for (let i = 0; i < 1100; i++) {
        telemetry.recordCounter('test.metric', i);
      }
      
      const counters = (telemetry as any).counters.get('test.metric');
      expect(counters.length).toBeLessThanOrEqual(1000); // Max queue size
    });
  });
  
  describe('Common Events', () => {
    it('should track feature usage events', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      telemetry.recordCounter(PrivacyTelemetry.Events.FEATURE_ENABLED, 1, {
        feature: 'MISSED_CALL_ACTIONS'
      });
      
      telemetry.recordCounter(PrivacyTelemetry.Events.FEATURE_USED, 1, {
        feature: 'QUICK_TILE_EXPECTING',
        action: 'activate'
      });
      
      telemetry.recordCounter(PrivacyTelemetry.Events.FEATURE_ERROR, 1, {
        feature: 'APP_SHORTCUTS_ENABLED',
        result: 'failure'
      });
      
      const enabledCounters = (telemetry as any).counters.get('feature.enabled');
      const usedCounters = (telemetry as any).counters.get('feature.used');
      const errorCounters = (telemetry as any).counters.get('feature.error');
      
      expect(enabledCounters).toHaveLength(1);
      expect(usedCounters).toHaveLength(1);
      expect(errorCounters).toHaveLength(1);
      
      expect(enabledCounters[0].metadata.feature).toBe('MISSED_CALL_ACTIONS');
      expect(usedCounters[0].metadata.feature).toBe('QUICK_TILE_EXPECTING');
      expect(errorCounters[0].metadata.result).toBe('failure');
    });
    
    it('should track vPass events', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      telemetry.recordCounter(PrivacyTelemetry.Events.VPASS_GRANTED, 1, {
        action: 'approve_30m'
      });
      
      telemetry.recordCounter(PrivacyTelemetry.Events.VPASS_CHECKED, 1, {
        result: 'success'
      });
      
      telemetry.recordCounter(PrivacyTelemetry.Events.VPASS_EXPIRED, 1);
      
      expect((telemetry as any).counters.has('vpass.granted')).toBe(true);
      expect((telemetry as any).counters.has('vpass.checked')).toBe(true);
      expect((telemetry as any).counters.has('vpass.expired')).toBe(true);
    });
    
    it('should track performance metrics', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      // Track API latency
      telemetry.recordCounter(PrivacyTelemetry.Events.API_LATENCY, 150, {
        action: 'pass_check'
      });
      
      // Track cache performance
      telemetry.recordCounter(PrivacyTelemetry.Events.CACHE_HIT, 1);
      telemetry.recordCounter(PrivacyTelemetry.Events.CACHE_MISS, 1);
      
      const latencyCounters = (telemetry as any).counters.get('api.latency');
      expect(latencyCounters[0].value).toBe(100); // Clamped to max 100
    });
  });
  
  describe('Privacy Budget Reset', () => {
    it('should reset privacy budget daily', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      // Set last reset to yesterday
      const yesterday = Date.now() - (25 * 60 * 60 * 1000);
      localStorage.setItem('telemetry_last_reset', yesterday.toString());
      
      // Use some budget
      (telemetry as any).privacyBudget = 0.5;
      
      // Check if should reset
      const shouldReset = (telemetry as any).shouldResetPrivacyBudget();
      expect(shouldReset).toBe(true);
      
      // Trigger flush which resets budget
      (telemetry as any).flush();
      
      // Budget should be reset
      expect(telemetry.getPrivacyBudget()).toBe(1.0);
    });
    
    it('should not reset privacy budget within same day', () => {
      telemetry = PrivacyTelemetry.getInstance({ enableTelemetry: true });
      
      // Set last reset to 1 hour ago
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      localStorage.setItem('telemetry_last_reset', oneHourAgo.toString());
      
      const shouldReset = (telemetry as any).shouldResetPrivacyBudget();
      expect(shouldReset).toBe(false);
    });
  });
});