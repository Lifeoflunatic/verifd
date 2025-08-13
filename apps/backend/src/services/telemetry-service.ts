/**
 * Telemetry Service with Backoff and Knobs
 */

import { FastifyInstance } from 'fastify';
import { telemetryKnobs, TelemetryConfig } from '../config/telemetry-config.js';
import crypto from 'crypto';

export interface TelemetryEvent {
  eventType: string;
  eventId?: string;
  timestamp?: number;
  userId?: string;
  sessionId?: string;
  geo?: string;
  properties?: Record<string, any>;
  metrics?: Record<string, number>;
  context?: TelemetryContext;
}

export interface TelemetryContext {
  app_version?: string;
  device_type?: string;
  os_version?: string;
  browser?: string;
  ip?: string;
  user_agent?: string;
  referrer?: string;
  environment?: string;
}

export class TelemetryService {
  private fastify: FastifyInstance;
  private eventQueue: TelemetryEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private failureCount = 0;
  
  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;
    this.startFlushTimer();
  }
  
  /**
   * Record a telemetry event
   */
  async recordEvent(event: TelemetryEvent): Promise<void> {
    // Check if telemetry is enabled
    if (!telemetryKnobs.isEnabled()) {
      return;
    }
    
    // Check if event type is allowed
    if (!telemetryKnobs.isEventAllowed(event.eventType)) {
      this.fastify.log.debug(`Telemetry event blocked: ${event.eventType}`);
      return;
    }
    
    // Check sampling
    if (!telemetryKnobs.shouldSample(event.eventType, event.userId, event.geo)) {
      this.fastify.log.debug(`Telemetry event not sampled: ${event.eventType}`);
      return;
    }
    
    // Add event metadata
    const enrichedEvent: TelemetryEvent = {
      ...event,
      eventId: event.eventId || crypto.randomUUID(),
      timestamp: event.timestamp || Date.now(),
    };
    
    // Redact PII
    if (enrichedEvent.properties) {
      enrichedEvent.properties = telemetryKnobs.redactPII(enrichedEvent.properties);
    }
    if (enrichedEvent.context) {
      enrichedEvent.context = telemetryKnobs.redactPII(enrichedEvent.context);
    }
    
    // Add to queue
    this.eventQueue.push(enrichedEvent);
    
    // Check if we should flush
    const config = telemetryKnobs.getConfig();
    if (this.eventQueue.length >= config.batchSize) {
      await this.flush();
    }
  }
  
  /**
   * Flush queued events
   */
  async flush(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    const config = telemetryKnobs.getConfig();
    
    // Get batch of events
    const batch = this.eventQueue.splice(0, config.batchSize);
    
    try {
      // Calculate backoff delay
      const backoffKey = 'telemetry_flush';
      const delay = telemetryKnobs.getBackoffDelay(backoffKey);
      
      if (delay === -1) {
        // Max attempts exceeded, drop events
        this.fastify.log.error('Telemetry flush max attempts exceeded, dropping events');
        this.failureCount++;
        return;
      }
      
      if (delay > 0) {
        // Wait for backoff delay
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Send batch to telemetry endpoint
      await this.sendBatch(batch);
      
      // Reset backoff on success
      telemetryKnobs.resetBackoff(backoffKey);
      this.failureCount = 0;
      
      this.fastify.log.info({
        eventCount: batch.length,
        queueSize: this.eventQueue.length
      }, 'Telemetry batch sent successfully');
      
    } catch (error) {
      // Put events back in queue
      this.eventQueue.unshift(...batch);
      this.failureCount++;
      
      this.fastify.log.error({
        error,
        failureCount: this.failureCount,
        queueSize: this.eventQueue.length
      }, 'Failed to send telemetry batch');
      
      // Check if we should disable telemetry after too many failures
      if (this.failureCount >= 10) {
        this.fastify.log.error('Disabling telemetry due to repeated failures');
        telemetryKnobs.setEnabled(false);
      }
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Send batch to telemetry endpoint
   */
  private async sendBatch(events: TelemetryEvent[]): Promise<void> {
    const config = telemetryKnobs.getConfig();
    
    // Compress if enabled
    let body: any = { events };
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Telemetry-Version': '1.0',
      'X-Telemetry-Source': 'verifd-backend'
    };
    
    if (config.storage.compressionEnabled) {
      // TODO: Implement compression
      headers['Content-Encoding'] = 'gzip';
    }
    
    // Mock sending for development
    if (process.env.NODE_ENV === 'development') {
      this.fastify.log.debug({
        events: events.map(e => ({
          type: e.eventType,
          id: e.eventId,
          timestamp: e.timestamp
        }))
      }, 'Telemetry batch (dev mode - not sent)');
      return;
    }
    
    // Send to endpoint
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`Telemetry endpoint returned ${response.status}`);
    }
  }
  
  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }
    
    const config = telemetryKnobs.getConfig();
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        this.fastify.log.error(error, 'Error in telemetry flush timer');
      });
    }, config.flushIntervalMs);
  }
  
  /**
   * Stop flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
  
  /**
   * Shutdown telemetry service
   */
  async shutdown(): Promise<void> {
    this.stopFlushTimer();
    
    // Final flush
    await this.flush();
    
    this.fastify.log.info('Telemetry service shutdown complete');
  }
  
  /**
   * Get telemetry statistics
   */
  getStats(): TelemetryStats {
    const config = telemetryKnobs.getConfig();
    
    return {
      enabled: config.enabled,
      queueSize: this.eventQueue.length,
      failureCount: this.failureCount,
      isProcessing: this.isProcessing,
      config: {
        endpoint: config.endpoint,
        batchSize: config.batchSize,
        flushInterval: config.flushIntervalMs,
        samplingRate: config.sampling.defaultRate
      }
    };
  }
  
  /**
   * Helper methods for common events
   */
  
  async recordApiCall(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
    userId?: string
  ): Promise<void> {
    await this.recordEvent({
      eventType: 'api_call',
      userId,
      properties: {
        endpoint,
        method,
        status_code: statusCode,
        success: statusCode < 400
      },
      metrics: {
        duration
      }
    });
  }
  
  async recordFeatureFlag(
    flagName: string,
    value: any,
    userId?: string,
    geo?: string
  ): Promise<void> {
    await this.recordEvent({
      eventType: 'feature_flag',
      userId,
      geo,
      properties: {
        flag_name: flagName,
        flag_value: value
      }
    });
  }
  
  async recordError(
    error: Error,
    context?: Record<string, any>,
    userId?: string
  ): Promise<void> {
    await this.recordEvent({
      eventType: 'error',
      userId,
      properties: {
        error_name: error.name,
        error_message: error.message,
        error_stack: error.stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines
        ...context
      }
    });
  }
  
  async recordVerifyFlow(
    action: 'started' | 'completed' | 'failed',
    phoneNumber: string,
    method: 'sms' | 'voice' | 'whatsapp',
    geo?: string
  ): Promise<void> {
    await this.recordEvent({
      eventType: 'verify_flow',
      geo,
      properties: {
        action,
        method,
        phone_hash: crypto.createHash('sha256').update(phoneNumber).digest('hex').substring(0, 8)
      }
    });
  }
  
  async recordNotificationAction(
    action: 'sms' | 'whatsapp' | 'copy',
    result: 'success' | 'failure',
    userId?: string
  ): Promise<void> {
    await this.recordEvent({
      eventType: 'notification_action',
      userId,
      properties: {
        action,
        result
      }
    });
  }
}

export interface TelemetryStats {
  enabled: boolean;
  queueSize: number;
  failureCount: number;
  isProcessing: boolean;
  config: {
    endpoint: string;
    batchSize: number;
    flushInterval: number;
    samplingRate: number;
  };
}

// Factory function
export function createTelemetryService(fastify: FastifyInstance): TelemetryService {
  return new TelemetryService(fastify);
}