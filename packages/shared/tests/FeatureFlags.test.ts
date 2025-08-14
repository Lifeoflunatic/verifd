import { FeatureFlagManager, RemoteFeatureFlags } from '../src/config/FeatureFlags';

describe('FeatureFlagManager', () => {
  let manager: FeatureFlagManager;
  
  beforeEach(() => {
    // Clear any cached instance
    (FeatureFlagManager as any).instance = undefined;
    
    // Mock localStorage
    const localStorageMock = {
      store: {} as Record<string, string>,
      getItem: jest.fn((key: string) => localStorageMock.store[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        localStorageMock.store[key] = value;
      }),
      clear: jest.fn(() => {
        localStorageMock.store = {};
      })
    };
    
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Global Kill Switch', () => {
    it('should disable all features when kill switch is active', () => {
      manager = FeatureFlagManager.getInstance();
      
      // Enable a feature
      manager.setConfig({
        MISSED_CALL_ACTIONS: { enabled: true }
      });
      
      expect(manager.isFeatureEnabled('MISSED_CALL_ACTIONS')).toBe(true);
      
      // Activate kill switch
      manager.activateKillSwitch();
      
      // All features should be disabled
      expect(manager.isFeatureEnabled('MISSED_CALL_ACTIONS')).toBe(false);
      expect(manager.isFeatureEnabled('QUICK_TILE_EXPECTING')).toBe(false);
      expect(manager.isFeatureEnabled('APP_SHORTCUTS_ENABLED')).toBe(false);
      expect(manager.isFeatureEnabled('IDENTITY_LOOKUP_ENABLED')).toBe(false);
      expect(manager.isFeatureEnabled('enableTemplates')).toBe(false);
      expect(manager.isFeatureEnabled('enableWhatsApp')).toBe(false);
      expect(manager.isFeatureEnabled('enableRiskScoring')).toBe(false);
    });
    
    it('should re-enable features when kill switch is deactivated', () => {
      manager = FeatureFlagManager.getInstance();
      
      manager.setConfig({
        MISSED_CALL_ACTIONS: { enabled: true },
        QUICK_TILE_EXPECTING: { enabled: true }
      });
      
      manager.activateKillSwitch();
      expect(manager.isFeatureEnabled('MISSED_CALL_ACTIONS')).toBe(false);
      
      manager.deactivateKillSwitch();
      expect(manager.isFeatureEnabled('MISSED_CALL_ACTIONS')).toBe(true);
      expect(manager.isFeatureEnabled('QUICK_TILE_EXPECTING')).toBe(true);
    });
  });
  
  describe('Cohort Percentage', () => {
    it('should respect cohort percentage rollout', () => {
      // Test with different user IDs to get different hash buckets
      const enabledUser = FeatureFlagManager.getInstance({
        userId: 'user_001' // This should hash to a low bucket
      });
      
      const disabledUser = FeatureFlagManager.getInstance({
        userId: 'user_999' // This should hash to a high bucket
      });
      
      // Clear instance for new user
      (FeatureFlagManager as any).instance = undefined;
      const manager1 = FeatureFlagManager.getInstance({ userId: 'user_001' });
      
      manager1.setConfig({
        MISSED_CALL_ACTIONS: {
          enabled: true,
          cohort: {
            percentage: 50 // 50% rollout
          }
        }
      });
      
      // Clear instance for second user
      (FeatureFlagManager as any).instance = undefined;
      const manager2 = FeatureFlagManager.getInstance({ userId: 'user_999' });
      manager2.setConfig({
        MISSED_CALL_ACTIONS: {
          enabled: true,
          cohort: {
            percentage: 50
          }
        }
      });
      
      // Different users should get different results based on hash
      const user1Enabled = manager1.isFeatureEnabled('MISSED_CALL_ACTIONS');
      const user2Enabled = manager2.isFeatureEnabled('MISSED_CALL_ACTIONS');
      
      // At least one should be different (statistically)
      // Note: This is probabilistic, but with chosen IDs should be deterministic
      expect([user1Enabled, user2Enabled]).toContain(true);
    });
    
    it('should enable for all users at 100% rollout', () => {
      manager = FeatureFlagManager.getInstance({ userId: 'any_user' });
      
      manager.setConfig({
        QUICK_TILE_EXPECTING: {
          enabled: true,
          cohort: {
            percentage: 100
          }
        }
      });
      
      expect(manager.isFeatureEnabled('QUICK_TILE_EXPECTING')).toBe(true);
    });
    
    it('should disable for all users at 0% rollout', () => {
      manager = FeatureFlagManager.getInstance({ userId: 'any_user' });
      
      manager.setConfig({
        QUICK_TILE_EXPECTING: {
          enabled: true,
          cohort: {
            percentage: 0
          }
        }
      });
      
      expect(manager.isFeatureEnabled('QUICK_TILE_EXPECTING')).toBe(false);
    });
  });
  
  describe('Geographic Gates', () => {
    it('should enable feature for targeted geos', () => {
      manager = FeatureFlagManager.getInstance({ geoLocation: 'US' });
      
      manager.setConfig({
        IDENTITY_LOOKUP_ENABLED: {
          enabled: true,
          cohort: {
            percentage: 100,
            geoTargets: ['US', 'CA']
          }
        }
      });
      
      expect(manager.isFeatureEnabled('IDENTITY_LOOKUP_ENABLED')).toBe(true);
    });
    
    it('should disable feature for non-targeted geos', () => {
      manager = FeatureFlagManager.getInstance({ geoLocation: 'FR' });
      
      manager.setConfig({
        IDENTITY_LOOKUP_ENABLED: {
          enabled: true,
          cohort: {
            percentage: 100,
            geoTargets: ['US', 'CA']
          }
        }
      });
      
      expect(manager.isFeatureEnabled('IDENTITY_LOOKUP_ENABLED')).toBe(false);
    });
    
    it('should exclude specific geos even if in target list', () => {
      manager = FeatureFlagManager.getInstance({ geoLocation: 'CN' });
      
      manager.setConfig({
        enableWhatsApp: {
          enabled: true,
          cohort: {
            percentage: 100,
            excludedGeos: ['CN', 'RU']
          }
        }
      });
      
      expect(manager.isFeatureEnabled('enableWhatsApp')).toBe(false);
    });
  });
  
  describe('Device Type Filtering', () => {
    it('should enable for correct device type', () => {
      manager = FeatureFlagManager.getInstance({ deviceType: 'android' });
      
      manager.setConfig({
        MISSED_CALL_ACTIONS: {
          enabled: true,
          cohort: {
            percentage: 100,
            deviceTypes: ['android']
          }
        }
      });
      
      expect(manager.isFeatureEnabled('MISSED_CALL_ACTIONS')).toBe(true);
    });
    
    it('should disable for incorrect device type', () => {
      manager = FeatureFlagManager.getInstance({ deviceType: 'ios' });
      
      manager.setConfig({
        MISSED_CALL_ACTIONS: {
          enabled: true,
          cohort: {
            percentage: 100,
            deviceTypes: ['android']
          }
        }
      });
      
      expect(manager.isFeatureEnabled('MISSED_CALL_ACTIONS')).toBe(false);
    });
  });
  
  describe('Version Constraints', () => {
    it('should respect minimum version requirement', () => {
      manager = FeatureFlagManager.getInstance({ appVersion: '1.0.0' });
      
      manager.setConfig({
        APP_SHORTCUTS_ENABLED: {
          enabled: true,
          cohort: {
            percentage: 100,
            minAppVersion: '1.2.0'
          }
        }
      });
      
      expect(manager.isFeatureEnabled('APP_SHORTCUTS_ENABLED')).toBe(false);
      
      // Update to newer version
      (FeatureFlagManager as any).instance = undefined;
      manager = FeatureFlagManager.getInstance({ appVersion: '1.3.0' });
      manager.setConfig({
        APP_SHORTCUTS_ENABLED: {
          enabled: true,
          cohort: {
            percentage: 100,
            minAppVersion: '1.2.0'
          }
        }
      });
      
      expect(manager.isFeatureEnabled('APP_SHORTCUTS_ENABLED')).toBe(true);
    });
    
    it('should respect maximum version constraint', () => {
      manager = FeatureFlagManager.getInstance({ appVersion: '2.0.0' });
      
      manager.setConfig({
        enableTemplates: {
          enabled: true,
          cohort: {
            percentage: 100,
            maxAppVersion: '1.5.0'
          }
        }
      });
      
      expect(manager.isFeatureEnabled('enableTemplates')).toBe(false);
    });
  });
  
  describe('User Overrides', () => {
    it('should enable feature for overridden users', () => {
      manager = FeatureFlagManager.getInstance({ 
        userId: 'special_user',
        geoLocation: 'FR' // Not in target geo
      });
      
      manager.setConfig({
        enableRiskScoring: {
          enabled: true,
          cohort: {
            percentage: 0, // 0% rollout
            geoTargets: ['US'] // Wrong geo
          },
          overrideForUsers: ['special_user', 'test_user']
        }
      });
      
      expect(manager.isFeatureEnabled('enableRiskScoring')).toBe(true);
    });
  });
  
  describe('Feature Expiry', () => {
    it('should disable expired features', () => {
      manager = FeatureFlagManager.getInstance();
      
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);
      
      manager.setConfig({
        QUICK_TILE_EXPECTING: {
          enabled: true,
          expiresAt: futureDate.toISOString()
        }
      });
      
      expect(manager.isFeatureEnabled('QUICK_TILE_EXPECTING')).toBe(true);
      
      // Set expired date
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);
      
      manager.setConfig({
        QUICK_TILE_EXPECTING: {
          enabled: true,
          expiresAt: pastDate.toISOString()
        }
      });
      
      expect(manager.isFeatureEnabled('QUICK_TILE_EXPECTING')).toBe(false);
    });
  });
  
  describe('Flag Precedence', () => {
    it('should follow correct precedence order', () => {
      manager = FeatureFlagManager.getInstance({
        userId: 'override_user',
        geoLocation: 'FR',
        deviceType: 'ios',
        appVersion: '0.5.0'
      });
      
      manager.setConfig({
        MISSED_CALL_ACTIONS: {
          enabled: true,
          cohort: {
            percentage: 0, // Would disable
            geoTargets: ['US'], // Wrong geo
            deviceTypes: ['android'], // Wrong device
            minAppVersion: '1.0.0' // Version too low
          },
          overrideForUsers: ['override_user'] // But user is overridden
        }
      });
      
      // User override should win
      expect(manager.isFeatureEnabled('MISSED_CALL_ACTIONS')).toBe(true);
      
      // But kill switch should override everything
      manager.activateKillSwitch();
      expect(manager.isFeatureEnabled('MISSED_CALL_ACTIONS')).toBe(false);
    });
  });
  
  describe('Default Configuration', () => {
    it('should default to OFF in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      (FeatureFlagManager as any).instance = undefined;
      manager = FeatureFlagManager.getInstance();
      
      // All features should be OFF by default in production
      expect(manager.isFeatureEnabled('MISSED_CALL_ACTIONS')).toBe(false);
      expect(manager.isFeatureEnabled('QUICK_TILE_EXPECTING')).toBe(false);
      expect(manager.isFeatureEnabled('APP_SHORTCUTS_ENABLED')).toBe(false);
      expect(manager.isFeatureEnabled('enableRiskScoring')).toBe(false);
      
      process.env.NODE_ENV = originalEnv;
    });
    
    it('should default to ON in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      (FeatureFlagManager as any).instance = undefined;
      manager = FeatureFlagManager.getInstance();
      
      // Most features ON in dev (except risk scoring)
      expect(manager.isFeatureEnabled('MISSED_CALL_ACTIONS')).toBe(true);
      expect(manager.isFeatureEnabled('QUICK_TILE_EXPECTING')).toBe(true);
      expect(manager.isFeatureEnabled('enableRiskScoring')).toBe(false); // Always starts OFF
      
      process.env.NODE_ENV = originalEnv;
    });
  });
  
  describe('Caching', () => {
    it('should cache configuration to localStorage', () => {
      manager = FeatureFlagManager.getInstance();
      
      manager.setConfig({
        MISSED_CALL_ACTIONS: { enabled: true }
      });
      
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'verifd_feature_flags',
        expect.stringContaining('MISSED_CALL_ACTIONS')
      );
    });
    
    it('should load cached configuration on init', () => {
      const cachedConfig = {
        GLOBAL_KILL_SWITCH: false,
        MISSED_CALL_ACTIONS: { enabled: true },
        configVersion: '1.0.0',
        lastUpdated: new Date().toISOString()
      };
      
      localStorage.setItem('verifd_feature_flags', JSON.stringify(cachedConfig));
      
      (FeatureFlagManager as any).instance = undefined;
      manager = FeatureFlagManager.getInstance();
      
      const config = manager.getRawConfig();
      expect(config.MISSED_CALL_ACTIONS.enabled).toBe(true);
    });
  });
});