/**
 * Telemetry Configuration with Backoff Settings
 */

export interface TelemetryConfig {
  enabled: boolean;
  endpoint: string;
  batchSize: number;
  flushIntervalMs: number;
  maxRetries: number;
  backoff: BackoffConfig;
  sampling: SamplingConfig;
  filters: FilterConfig;
  storage: StorageConfig;
}

export interface BackoffConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: boolean;
  maxAttempts: number;
}

export interface SamplingConfig {
  defaultRate: number; // 0.0 to 1.0
  eventRates: Record<string, number>;
  userRates: Record<string, number>; // Per-user sampling
  geoRates: Record<string, number>; // Per-region sampling
}

export interface FilterConfig {
  allowedEvents: string[];
  blockedEvents: string[];
  piiRedaction: boolean;
  sensitiveFields: string[];
}

export interface StorageConfig {
  maxQueueSize: number;
  maxStorageBytes: number;
  compressionEnabled: boolean;
  persistToDisk: boolean;
}

// Default configuration
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enabled: process.env.TELEMETRY_ENABLED !== 'false',
  endpoint: process.env.TELEMETRY_ENDPOINT || 'https://telemetry.verifd.com/v1/events',
  batchSize: parseInt(process.env.TELEMETRY_BATCH_SIZE || '100'),
  flushIntervalMs: parseInt(process.env.TELEMETRY_FLUSH_INTERVAL || '30000'), // 30 seconds
  maxRetries: parseInt(process.env.TELEMETRY_MAX_RETRIES || '3'),
  
  backoff: {
    initialDelayMs: parseInt(process.env.TELEMETRY_BACKOFF_INITIAL || '1000'), // 1 second
    maxDelayMs: parseInt(process.env.TELEMETRY_BACKOFF_MAX || '60000'), // 1 minute
    multiplier: parseFloat(process.env.TELEMETRY_BACKOFF_MULTIPLIER || '2'),
    jitter: process.env.TELEMETRY_BACKOFF_JITTER !== 'false',
    maxAttempts: parseInt(process.env.TELEMETRY_BACKOFF_MAX_ATTEMPTS || '5')
  },
  
  sampling: {
    defaultRate: parseFloat(process.env.TELEMETRY_SAMPLE_RATE || '1.0'),
    eventRates: {
      'page_view': 0.1, // Sample 10% of page views
      'api_call': 0.5, // Sample 50% of API calls
      'error': 1.0, // Sample 100% of errors
      'performance': 0.2, // Sample 20% of performance metrics
      'feature_flag': 1.0, // Sample 100% of feature flag evaluations
      'notification_action': 1.0, // Sample 100% of notification actions
      'verify_flow': 1.0, // Sample 100% of verification flows
      'pass_check': 0.3 // Sample 30% of pass checks
    },
    userRates: {}, // Can be configured per user
    geoRates: {
      'US': 1.0,
      'CA': 1.0,
      'GB': 0.8,
      'AU': 0.8,
      'IN': 0.5,
      'DEFAULT': 0.3
    }
  },
  
  filters: {
    allowedEvents: process.env.TELEMETRY_ALLOWED_EVENTS?.split(',') || [],
    blockedEvents: process.env.TELEMETRY_BLOCKED_EVENTS?.split(',') || [],
    piiRedaction: process.env.TELEMETRY_REDACT_PII !== 'false',
    sensitiveFields: [
      'phone_number',
      'email',
      'ip_address',
      'device_id',
      'user_id',
      'location',
      'name',
      'address'
    ]
  },
  
  storage: {
    maxQueueSize: parseInt(process.env.TELEMETRY_MAX_QUEUE || '10000'),
    maxStorageBytes: parseInt(process.env.TELEMETRY_MAX_STORAGE || '5242880'), // 5MB
    compressionEnabled: process.env.TELEMETRY_COMPRESSION !== 'false',
    persistToDisk: process.env.TELEMETRY_PERSIST === 'true'
  }
};

/**
 * Telemetry knobs for runtime control
 */
export class TelemetryKnobs {
  private config: TelemetryConfig;
  private backoffState: Map<string, BackoffState> = new Map();
  
  constructor(config: TelemetryConfig = DEFAULT_TELEMETRY_CONFIG) {
    this.config = config;
  }
  
  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
  
  /**
   * Set telemetry enabled state
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
  
  /**
   * Get sampling rate for an event
   */
  getSamplingRate(eventType: string, userId?: string, geo?: string): number {
    // User-specific rate takes precedence
    if (userId && this.config.sampling.userRates[userId] !== undefined) {
      return this.config.sampling.userRates[userId];
    }
    
    // Event-specific rate
    if (this.config.sampling.eventRates[eventType] !== undefined) {
      return this.config.sampling.eventRates[eventType];
    }
    
    // Geo-specific rate
    if (geo) {
      const geoRate = this.config.sampling.geoRates[geo] || 
                      this.config.sampling.geoRates['DEFAULT'];
      if (geoRate !== undefined) {
        return geoRate;
      }
    }
    
    // Default rate
    return this.config.sampling.defaultRate;
  }
  
  /**
   * Should sample this event?
   */
  shouldSample(eventType: string, userId?: string, geo?: string): boolean {
    const rate = this.getSamplingRate(eventType, userId, geo);
    return Math.random() < rate;
  }
  
  /**
   * Calculate backoff delay
   */
  getBackoffDelay(key: string): number {
    let state = this.backoffState.get(key);
    
    if (!state) {
      state = {
        attempts: 0,
        lastAttempt: 0,
        nextDelay: this.config.backoff.initialDelayMs
      };
      this.backoffState.set(key, state);
    }
    
    // Check if we've exceeded max attempts
    if (state.attempts >= this.config.backoff.maxAttempts) {
      return -1; // Signal to stop retrying
    }
    
    // Calculate delay with exponential backoff
    let delay = Math.min(
      state.nextDelay,
      this.config.backoff.maxDelayMs
    );
    
    // Add jitter if enabled
    if (this.config.backoff.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    // Update state for next attempt
    state.attempts++;
    state.lastAttempt = Date.now();
    state.nextDelay = state.nextDelay * this.config.backoff.multiplier;
    
    return Math.floor(delay);
  }
  
  /**
   * Reset backoff state for a key
   */
  resetBackoff(key: string): void {
    this.backoffState.delete(key);
  }
  
  /**
   * Check if event is allowed
   */
  isEventAllowed(eventType: string): boolean {
    // Check blocked list first
    if (this.config.filters.blockedEvents.includes(eventType)) {
      return false;
    }
    
    // If allowed list is empty, allow all non-blocked
    if (this.config.filters.allowedEvents.length === 0) {
      return true;
    }
    
    // Check allowed list
    return this.config.filters.allowedEvents.includes(eventType);
  }
  
  /**
   * Redact PII from data
   */
  redactPII(data: any): any {
    if (!this.config.filters.piiRedaction) {
      return data;
    }
    
    const redacted = { ...data };
    
    for (const field of this.config.filters.sensitiveFields) {
      if (field in redacted) {
        // Keep first 3 chars for debugging
        const value = String(redacted[field]);
        redacted[field] = value.substring(0, 3) + '***';
      }
    }
    
    return redacted;
  }
  
  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...updates };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): TelemetryConfig {
    return { ...this.config };
  }
}

interface BackoffState {
  attempts: number;
  lastAttempt: number;
  nextDelay: number;
}

// Export singleton instance
export const telemetryKnobs = new TelemetryKnobs();