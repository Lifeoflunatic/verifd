export interface CohortConfig {
  percentage: number; // 0-100
  geoTargets?: string[]; // ISO country codes, e.g., ['US', 'CA']
  excludedGeos?: string[]; // Countries to exclude
  deviceTypes?: ('ios' | 'android' | 'web')[];
  minAppVersion?: string; // e.g., '1.2.0'
  maxAppVersion?: string; // e.g., '1.5.0'
}

export interface FeatureFlagConfig {
  enabled: boolean;
  cohort?: CohortConfig;
  overrideForUsers?: string[]; // Specific user IDs or phone numbers
  expiresAt?: string; // ISO 8601 date for auto-disable
  metadata?: Record<string, any>; // Additional feature-specific config
}

export interface RemoteFeatureFlags {
  // Global kill switch - when true, ALL features are forced OFF
  GLOBAL_KILL_SWITCH: boolean;
  
  // Individual feature flags
  MISSED_CALL_ACTIONS: FeatureFlagConfig;
  QUICK_TILE_EXPECTING: FeatureFlagConfig;
  APP_SHORTCUTS_ENABLED: FeatureFlagConfig;
  IDENTITY_LOOKUP_ENABLED: FeatureFlagConfig;
  enableTemplates: FeatureFlagConfig;
  enableWhatsApp: FeatureFlagConfig;
  enableRiskScoring: FeatureFlagConfig;
  
  // Meta configuration
  configVersion: string;
  lastUpdated: string;
  updateIntervalMs: number; // How often to check for updates
  fallbackBehavior: 'default_off' | 'cached' | 'last_known';
}

export class FeatureFlagManager {
  private static instance: FeatureFlagManager;
  private config: RemoteFeatureFlags = this.getDefaultConfig();
  private lastFetch: number = 0;
  private readonly CACHE_KEY = 'verifd_feature_flags';
  private readonly DEFAULT_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
  
  private constructor(
    private readonly configEndpoint?: string,
    private readonly userId?: string,
    private readonly geoLocation?: string,
    private readonly deviceType?: 'ios' | 'android' | 'web',
    private readonly appVersion?: string
  ) {
    this.loadCachedConfig();
  }
  
  static getInstance(params?: {
    configEndpoint?: string;
    userId?: string;
    geoLocation?: string;
    deviceType?: 'ios' | 'android' | 'web';
    appVersion?: string;
  }): FeatureFlagManager {
    if (!FeatureFlagManager.instance) {
      FeatureFlagManager.instance = new FeatureFlagManager(
        params?.configEndpoint,
        params?.userId,
        params?.geoLocation,
        params?.deviceType,
        params?.appVersion
      );
    }
    return FeatureFlagManager.instance;
  }
  
  async fetchConfig(): Promise<RemoteFeatureFlags> {
    const now = Date.now();
    const updateInterval = this.config.updateIntervalMs || this.DEFAULT_UPDATE_INTERVAL;
    
    // Return cached config if still fresh
    if (now - this.lastFetch < updateInterval) {
      return this.config;
    }
    
    try {
      if (!this.configEndpoint) {
        // Use default/mock config in development
        return this.config;
      }
      
      const response = await fetch(this.configEndpoint, {
        method: 'GET',
        headers: {
          'X-User-Id': this.userId || 'anonymous',
          'X-Geo-Location': this.geoLocation || 'unknown',
          'X-Device-Type': this.deviceType || 'unknown',
          'X-App-Version': this.appVersion || '0.0.0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Config fetch failed: ${response.status}`);
      }
      
      const newConfig = await response.json();
      this.config = this.mergeWithDefaults(newConfig);
      this.lastFetch = now;
      this.saveToCache();
      
      return this.config;
    } catch (error) {
      console.error('[FeatureFlags] Failed to fetch config:', error);
      
      // Use fallback behavior
      switch (this.config.fallbackBehavior) {
        case 'cached':
          return this.loadCachedConfig() || this.getDefaultConfig();
        case 'last_known':
          return this.config;
        case 'default_off':
        default:
          return this.getDefaultConfig();
      }
    }
  }
  
  isFeatureEnabled(featureName: keyof Omit<RemoteFeatureFlags, 'GLOBAL_KILL_SWITCH' | 'configVersion' | 'lastUpdated' | 'updateIntervalMs' | 'fallbackBehavior'>): boolean {
    // Global kill switch overrides everything
    if (this.config.GLOBAL_KILL_SWITCH) {
      console.log(`[FeatureFlags] ${featureName} disabled by GLOBAL_KILL_SWITCH`);
      return false;
    }
    
    const flagConfig = this.config[featureName] as FeatureFlagConfig;
    
    if (!flagConfig || !flagConfig.enabled) {
      return false;
    }
    
    // Check expiry
    if (flagConfig.expiresAt) {
      const expiryDate = new Date(flagConfig.expiresAt);
      if (new Date() > expiryDate) {
        console.log(`[FeatureFlags] ${featureName} expired at ${flagConfig.expiresAt}`);
        return false;
      }
    }
    
    // Check user override
    if (flagConfig.overrideForUsers && this.userId) {
      if (flagConfig.overrideForUsers.includes(this.userId)) {
        console.log(`[FeatureFlags] ${featureName} enabled by user override`);
        return true;
      }
    }
    
    // Check cohort configuration
    if (flagConfig.cohort) {
      return this.isInCohort(flagConfig.cohort, featureName);
    }
    
    return true;
  }
  
  private isInCohort(cohort: CohortConfig, featureName: string): boolean {
    // Check geo targeting
    if (this.geoLocation) {
      if (cohort.excludedGeos?.includes(this.geoLocation)) {
        console.log(`[FeatureFlags] ${featureName} disabled for geo: ${this.geoLocation}`);
        return false;
      }
      
      if (cohort.geoTargets && !cohort.geoTargets.includes(this.geoLocation)) {
        console.log(`[FeatureFlags] ${featureName} not targeted for geo: ${this.geoLocation}`);
        return false;
      }
    }
    
    // Check device type
    if (this.deviceType && cohort.deviceTypes) {
      if (!cohort.deviceTypes.includes(this.deviceType)) {
        console.log(`[FeatureFlags] ${featureName} not enabled for device: ${this.deviceType}`);
        return false;
      }
    }
    
    // Check app version
    if (this.appVersion) {
      if (cohort.minAppVersion && this.compareVersions(this.appVersion, cohort.minAppVersion) < 0) {
        console.log(`[FeatureFlags] ${featureName} requires min version: ${cohort.minAppVersion}`);
        return false;
      }
      
      if (cohort.maxAppVersion && this.compareVersions(this.appVersion, cohort.maxAppVersion) > 0) {
        console.log(`[FeatureFlags] ${featureName} disabled for version > ${cohort.maxAppVersion}`);
        return false;
      }
    }
    
    // Check percentage rollout
    if (cohort.percentage < 100) {
      const hash = this.hashUserId(this.userId || 'anonymous');
      const bucket = hash % 100;
      if (bucket >= cohort.percentage) {
        console.log(`[FeatureFlags] ${featureName} disabled by cohort percentage (${cohort.percentage}%)`);
        return false;
      }
    }
    
    return true;
  }
  
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
  
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }
    
    return 0;
  }
  
  private loadCachedConfig(): RemoteFeatureFlags | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }
      
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        const config = JSON.parse(cached);
        console.log('[FeatureFlags] Loaded cached config');
        return config;
      }
    } catch (error) {
      console.error('[FeatureFlags] Failed to load cached config:', error);
    }
    
    return null;
  }
  
  private saveToCache(): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(this.config));
      console.log('[FeatureFlags] Saved config to cache');
    } catch (error) {
      console.error('[FeatureFlags] Failed to save config to cache:', error);
    }
  }
  
  private mergeWithDefaults(remoteConfig: Partial<RemoteFeatureFlags>): RemoteFeatureFlags {
    const defaultConfig = this.getDefaultConfig();
    return {
      ...defaultConfig,
      ...remoteConfig,
      // Ensure critical fields are never undefined
      GLOBAL_KILL_SWITCH: remoteConfig.GLOBAL_KILL_SWITCH ?? defaultConfig.GLOBAL_KILL_SWITCH,
      configVersion: remoteConfig.configVersion || defaultConfig.configVersion,
      lastUpdated: remoteConfig.lastUpdated || new Date().toISOString()
    };
  }
  
  private getDefaultConfig(): RemoteFeatureFlags {
    // Default-safe: ALL features OFF in production
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
      GLOBAL_KILL_SWITCH: false,
      
      MISSED_CALL_ACTIONS: {
        enabled: !isProduction, // OFF in production
        cohort: {
          percentage: 0, // Start with 0% rollout
          geoTargets: ['US', 'CA'],
          deviceTypes: ['android']
        }
      },
      
      QUICK_TILE_EXPECTING: {
        enabled: !isProduction,
        cohort: {
          percentage: 0,
          geoTargets: ['US', 'CA'],
          deviceTypes: ['android'],
          minAppVersion: '1.0.0'
        }
      },
      
      APP_SHORTCUTS_ENABLED: {
        enabled: !isProduction,
        cohort: {
          percentage: 0,
          geoTargets: ['US', 'CA'],
          deviceTypes: ['ios'],
          minAppVersion: '1.0.0'
        }
      },
      
      IDENTITY_LOOKUP_ENABLED: {
        enabled: !isProduction,
        cohort: {
          percentage: 0,
          geoTargets: ['US'],
          deviceTypes: ['ios'],
          minAppVersion: '1.0.0'
        }
      },
      
      enableTemplates: {
        enabled: !isProduction,
        cohort: {
          percentage: 0,
          deviceTypes: ['web']
        }
      },
      
      enableWhatsApp: {
        enabled: !isProduction,
        cohort: {
          percentage: 0,
          geoTargets: ['US', 'CA', 'GB', 'AU'],
          deviceTypes: ['web']
        }
      },
      
      enableRiskScoring: {
        enabled: false, // Always start OFF, even in dev
        cohort: {
          percentage: 0,
          geoTargets: ['US']
        },
        metadata: {
          shadowMode: true, // Start in shadow mode
          highRiskThreshold: 70,
          criticalRiskThreshold: 90
        }
      },
      
      configVersion: '1.0.0',
      lastUpdated: new Date().toISOString(),
      updateIntervalMs: 5 * 60 * 1000, // 5 minutes
      fallbackBehavior: 'default_off'
    };
  }
  
  // Force refresh the configuration
  async forceRefresh(): Promise<RemoteFeatureFlags> {
    this.lastFetch = 0;
    return this.fetchConfig();
  }
  
  // Get raw config for debugging
  getRawConfig(): RemoteFeatureFlags {
    return this.config;
  }
  
  // Manually set config (for testing)
  setConfig(config: Partial<RemoteFeatureFlags>): void {
    this.config = this.mergeWithDefaults(config);
    this.saveToCache();
  }
  
  // Trigger global kill switch
  activateKillSwitch(): void {
    this.config.GLOBAL_KILL_SWITCH = true;
    this.saveToCache();
    console.warn('[FeatureFlags] GLOBAL KILL SWITCH ACTIVATED - All features disabled');
  }
  
  // Deactivate global kill switch
  deactivateKillSwitch(): void {
    this.config.GLOBAL_KILL_SWITCH = false;
    this.saveToCache();
    console.log('[FeatureFlags] Global kill switch deactivated');
  }
}

// Export singleton instance for convenience
export const featureFlags = FeatureFlagManager.getInstance();