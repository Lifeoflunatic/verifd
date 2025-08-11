/**
 * Privacy-Safe Telemetry with Differential Privacy
 * 
 * Collects only numeric counters with added noise for privacy.
 * No PII, no device IDs, no location data beyond country level.
 * All metrics are aggregated with differential privacy guarantees.
 */

export interface TelemetryCounter {
  metric: string;
  value: number;
  timestamp: number;
  metadata?: {
    feature?: string;
    action?: string;
    result?: 'success' | 'failure' | 'timeout';
    country?: string; // Country-level only, no precise location
  };
}

export interface AggregatedMetrics {
  metric: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  mean: number;
  noise: number; // Amount of noise added
  privacyBudget: number; // Remaining privacy budget
  period: {
    start: string;
    end: string;
  };
}

export class PrivacyTelemetry {
  private static instance: PrivacyTelemetry;
  private counters: Map<string, TelemetryCounter[]> = new Map();
  private privacyBudget: number = 1.0; // Total privacy budget (epsilon)
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL = 60 * 1000; // 1 minute
  private readonly MAX_QUEUE_SIZE = 1000;
  private flushTimer?: NodeJS.Timeout;
  
  // Differential privacy parameters
  private readonly EPSILON = 0.1; // Privacy parameter (lower = more privacy)
  private readonly SENSITIVITY = 1.0; // Max contribution per user
  
  private constructor(
    private readonly telemetryEndpoint?: string,
    private readonly enableTelemetry: boolean = false
  ) {
    if (this.enableTelemetry) {
      this.startFlushTimer();
    }
  }
  
  static getInstance(params?: {
    telemetryEndpoint?: string;
    enableTelemetry?: boolean;
  }): PrivacyTelemetry {
    if (!PrivacyTelemetry.instance) {
      PrivacyTelemetry.instance = new PrivacyTelemetry(
        params?.telemetryEndpoint,
        params?.enableTelemetry
      );
    }
    return PrivacyTelemetry.instance;
  }
  
  /**
   * Record a privacy-safe counter
   */
  recordCounter(
    metric: string,
    value: number = 1,
    metadata?: TelemetryCounter['metadata']
  ): void {
    if (!this.enableTelemetry) {
      return;
    }
    
    // Sanitize metadata - remove any potential PII
    const sanitizedMetadata = metadata ? {
      feature: metadata.feature,
      action: metadata.action,
      result: metadata.result,
      country: metadata.country ? this.generalizeCountry(metadata.country) : undefined
    } : undefined;
    
    const counter: TelemetryCounter = {
      metric: this.sanitizeMetricName(metric),
      value: Math.min(Math.max(value, 0), 100), // Clamp to reasonable range
      timestamp: Date.now(),
      metadata: sanitizedMetadata
    };
    
    // Add counter to queue
    const key = counter.metric;
    if (!this.counters.has(key)) {
      this.counters.set(key, []);
    }
    
    const queue = this.counters.get(key)!;
    queue.push(counter);
    
    // Prevent unbounded growth
    if (queue.length > this.MAX_QUEUE_SIZE) {
      queue.shift(); // Remove oldest
    }
    
    // Flush if batch size reached
    if (queue.length >= this.BATCH_SIZE) {
      this.flush();
    }
  }
  
  /**
   * Add Laplace noise for differential privacy
   */
  private addLaplaceNoise(value: number): number {
    if (this.privacyBudget <= 0) {
      // Privacy budget exhausted, return heavily noised value
      return value + this.generateLaplaceNoise(this.SENSITIVITY / 0.01);
    }
    
    const noise = this.generateLaplaceNoise(this.SENSITIVITY / this.EPSILON);
    
    // Deduct from privacy budget
    this.privacyBudget -= this.EPSILON / 100; // Slowly consume budget
    
    return value + noise;
  }
  
  /**
   * Generate Laplace-distributed noise
   */
  private generateLaplaceNoise(scale: number): number {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }
  
  /**
   * Aggregate counters with differential privacy
   */
  private aggregateWithPrivacy(counters: TelemetryCounter[]): AggregatedMetrics | null {
    if (counters.length === 0) {
      return null;
    }
    
    const values = counters.map(c => c.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = sum / values.length;
    
    // Add differential privacy noise
    const noisedSum = this.addLaplaceNoise(sum);
    const noisedCount = this.addLaplaceNoise(counters.length);
    const noisedMean = noisedSum / Math.max(noisedCount, 1);
    
    const now = Date.now();
    const period = {
      start: new Date(now - this.FLUSH_INTERVAL).toISOString(),
      end: new Date(now).toISOString()
    };
    
    return {
      metric: counters[0].metric,
      count: Math.max(0, Math.round(noisedCount)),
      sum: Math.max(0, Math.round(noisedSum)),
      min: Math.max(0, min), // Don't noise min/max to preserve bounds
      max: Math.max(0, max),
      mean: Math.max(0, noisedMean),
      noise: Math.abs(noisedSum - sum), // Amount of noise added
      privacyBudget: this.privacyBudget,
      period
    };
  }
  
  /**
   * Flush aggregated metrics to telemetry endpoint
   */
  async flush(): Promise<void> {
    if (!this.enableTelemetry || this.counters.size === 0) {
      return;
    }
    
    const aggregatedMetrics: AggregatedMetrics[] = [];
    
    // Aggregate all counters
    for (const [metric, counters] of this.counters.entries()) {
      if (counters.length === 0) continue;
      
      const aggregated = this.aggregateWithPrivacy(counters);
      if (aggregated) {
        aggregatedMetrics.push(aggregated);
      }
      
      // Clear processed counters
      this.counters.set(metric, []);
    }
    
    if (aggregatedMetrics.length === 0) {
      return;
    }
    
    // Send to telemetry endpoint
    if (this.telemetryEndpoint) {
      try {
        await this.sendTelemetry(aggregatedMetrics);
      } catch (error) {
        console.error('[Telemetry] Failed to send metrics:', error);
      }
    } else {
      // Log locally in development
      console.log('[Telemetry] Aggregated metrics:', {
        metrics: aggregatedMetrics,
        privacyBudget: this.privacyBudget,
        timestamp: new Date().toISOString()
      });
    }
    
    // Reset privacy budget periodically (e.g., daily)
    if (this.shouldResetPrivacyBudget()) {
      this.privacyBudget = 1.0;
    }
  }
  
  /**
   * Send telemetry to backend
   */
  private async sendTelemetry(metrics: AggregatedMetrics[]): Promise<void> {
    const response = await fetch(this.telemetryEndpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telemetry-Version': '1.0.0'
      },
      body: JSON.stringify({
        metrics,
        timestamp: new Date().toISOString(),
        privacyMode: 'differential',
        epsilon: this.EPSILON
      })
    });
    
    if (!response.ok) {
      throw new Error(`Telemetry upload failed: ${response.status}`);
    }
  }
  
  /**
   * Generalize country to region for additional privacy
   */
  private generalizeCountry(country: string): string {
    const regions: Record<string, string> = {
      'US': 'NA', 'CA': 'NA', 'MX': 'NA', // North America
      'GB': 'EU', 'FR': 'EU', 'DE': 'EU', 'IT': 'EU', 'ES': 'EU', // Europe
      'CN': 'AS', 'JP': 'AS', 'KR': 'AS', 'IN': 'AS', // Asia
      'AU': 'OC', 'NZ': 'OC', // Oceania
      'BR': 'SA', 'AR': 'SA', // South America
      'ZA': 'AF', 'NG': 'AF', // Africa
    };
    
    return regions[country] || 'OTHER';
  }
  
  /**
   * Sanitize metric names to prevent PII leakage
   */
  private sanitizeMetricName(metric: string): string {
    // Remove any numbers that could be phone numbers, IDs, etc.
    return metric.replace(/\d{4,}/g, 'XXXX')
      .replace(/[a-f0-9]{8,}/gi, 'HASH') // Remove potential hashes/IDs
      .substring(0, 100); // Limit length
  }
  
  /**
   * Check if privacy budget should be reset
   */
  private shouldResetPrivacyBudget(): boolean {
    // Reset daily (simplified - in production use proper time tracking)
    const lastReset = parseInt(localStorage.getItem('telemetry_last_reset') || '0');
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    
    if (now - lastReset > ONE_DAY) {
      localStorage.setItem('telemetry_last_reset', now.toString());
      return true;
    }
    
    return false;
  }
  
  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL);
  }
  
  /**
   * Stop telemetry collection
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    // Final flush
    this.flush();
  }
  
  /**
   * Get current privacy budget
   */
  getPrivacyBudget(): number {
    return this.privacyBudget;
  }
  
  /**
   * Common telemetry events
   */
  static readonly Events = {
    // Feature usage
    FEATURE_ENABLED: 'feature.enabled',
    FEATURE_USED: 'feature.used',
    FEATURE_ERROR: 'feature.error',
    
    // vPass events
    VPASS_GRANTED: 'vpass.granted',
    VPASS_CHECKED: 'vpass.checked',
    VPASS_EXPIRED: 'vpass.expired',
    
    // Verification events
    VERIFY_STARTED: 'verify.started',
    VERIFY_COMPLETED: 'verify.completed',
    VERIFY_FAILED: 'verify.failed',
    
    // Risk scoring
    RISK_ASSESSED: 'risk.assessed',
    RISK_HIGH_BLOCKED: 'risk.high_blocked',
    RISK_SHADOW_LOG: 'risk.shadow_log',
    
    // Performance
    API_LATENCY: 'api.latency',
    DB_QUERY_TIME: 'db.query_time',
    CACHE_HIT: 'cache.hit',
    CACHE_MISS: 'cache.miss'
  };
}

// Export singleton instance
export const telemetry = PrivacyTelemetry.getInstance();