export interface RiskThresholds {
  burstCallsPerMinute: number;
  burstWindowMs: number;
  pacingVarianceThreshold: number;
  highRiskScore: number;
  criticalRiskScore: number;
  shadowModeEnabled: boolean;
}

export interface RemoteConfigData {
  risk: {
    enabled: boolean;
    thresholds: RiskThresholds;
    riskyAsns: string[];
    trustedAsns: string[];
  };
  features: {
    enableRiskScoring: boolean;
    enableBurstDetection: boolean;
    enableASNFiltering: boolean;
    enablePacingAnalysis: boolean;
    enableShadowMode: boolean;
  };
}

export class RemoteConfig {
  private static instance: RemoteConfig;
  private config: RemoteConfigData = this.getDefaultConfig();
  private lastFetch: number = 0;
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  
  private constructor() {}
  
  static getInstance(): RemoteConfig {
    if (!RemoteConfig.instance) {
      RemoteConfig.instance = new RemoteConfig();
    }
    return RemoteConfig.instance;
  }
  
  async fetchConfig(): Promise<RemoteConfigData> {
    const now = Date.now();
    
    // Return cached config if still fresh
    if (now - this.lastFetch < this.CACHE_DURATION_MS) {
      return this.config;
    }
    
    try {
      // In production, this would fetch from your config service
      // For now, return mock config that can be toggled
      const response = await this.fetchFromService();
      this.config = response;
      this.lastFetch = now;
      
      return this.config;
    } catch (error) {
      console.error('[RemoteConfig] Failed to fetch config:', error);
      return this.config; // Return cached/default config on error
    }
  }
  
  private async fetchFromService(): Promise<RemoteConfigData> {
    // Mock implementation - replace with actual API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          risk: {
            enabled: true,
            thresholds: {
              burstCallsPerMinute: 3,
              burstWindowMs: 60000,
              pacingVarianceThreshold: 1000,
              highRiskScore: 70,
              criticalRiskScore: 90,
              shadowModeEnabled: true // Start in shadow mode
            },
            riskyAsns: [
              'AS13335',
              'AS16509',
              'AS8075',
              'AS32934'
            ],
            trustedAsns: [
              'AS7018', // AT&T
              'AS7922', // Verizon
              'AS209', // T-Mobile
              'AS10507' // Sprint
            ]
          },
          features: {
            enableRiskScoring: false, // Feature flag OFF by default
            enableBurstDetection: true,
            enableASNFiltering: true,
            enablePacingAnalysis: true,
            enableShadowMode: true
          }
        });
      }, 100);
    });
  }
  
  private getDefaultConfig(): RemoteConfigData {
    return {
      risk: {
        enabled: false,
        thresholds: {
          burstCallsPerMinute: 3,
          burstWindowMs: 60000,
          pacingVarianceThreshold: 1000,
          highRiskScore: 70,
          criticalRiskScore: 90,
          shadowModeEnabled: true
        },
        riskyAsns: [],
        trustedAsns: []
      },
      features: {
        enableRiskScoring: false,
        enableBurstDetection: false,
        enableASNFiltering: false,
        enablePacingAnalysis: false,
        enableShadowMode: true
      }
    };
  }
  
  getThresholds(): RiskThresholds {
    return this.config.risk.thresholds;
  }
  
  getFeatureFlags(): RemoteConfigData['features'] {
    return this.config.features;
  }
  
  getRiskyAsns(): Set<string> {
    return new Set(this.config.risk.riskyAsns);
  }
  
  getTrustedAsns(): Set<string> {
    return new Set(this.config.risk.trustedAsns);
  }
  
  isRiskScoringEnabled(): boolean {
    return this.config.features.enableRiskScoring;
  }
  
  isShadowModeEnabled(): boolean {
    return this.config.features.enableShadowMode;
  }
  
  // For testing - allows manual config override
  setConfig(config: Partial<RemoteConfigData>): void {
    this.config = { ...this.config, ...config };
  }
}