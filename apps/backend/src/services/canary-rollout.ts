/**
 * Canary Rollout Manager - US 5% with daily Slack rollups
 */

import { FastifyInstance } from 'fastify';
import { WebClient } from '@slack/web-api';
import crypto from 'crypto';
import { Phase } from '../routes/canary.js';

interface CanaryConfig {
  phase: Phase;
  flags: {
    MISSED_CALL_ACTIONS: number; // Percentage
    enableTemplates: boolean;
    enableRiskScoring: 'off' | 'shadow' | 'enforce';
  };
  cohorts: {
    sticky: boolean;
    seed: string;
    regions: string[];
  };
  rollup: {
    morningTime: string; // IST
    afternoonTime: string; // IST
    channel: string;
  };
  regions?: string[]; // Optional for backward compatibility
}

export class CanaryRolloutManager {
  private config: CanaryConfig;
  private slackClient: WebClient;
  private metricsCache: Map<string, any> = new Map();
  
  constructor(private fastify: FastifyInstance) {
    this.slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
    
    // Initialize US 5% canary configuration
    this.config = {
      phase: 'canary_5',
      flags: {
        MISSED_CALL_ACTIONS: 5,
        enableTemplates: true,
        enableRiskScoring: 'shadow',
      },
      cohorts: {
        sticky: true,
        seed: crypto.randomBytes(16).toString('hex'),
        regions: ['US-WEST', 'US-EAST'],
      },
      rollup: {
        morningTime: '09:00', // 9 AM IST
        afternoonTime: '14:00', // 2 PM IST
        channel: '#canary-operations',
      },
    };
    
    this.initializeSchedules();
  }

  /**
   * Initialize daily rollup schedules
   */
  private initializeSchedules(): void {
    // Morning rollup at 9 AM IST (3:30 AM UTC)
    this.scheduleDailyTask('03:30', () => this.sendMorningRollup());
    
    // Afternoon alert at 2 PM IST (8:30 AM UTC)
    this.scheduleDailyTask('08:30', () => this.checkAfternoonThresholds());
  }

  /**
   * Schedule a daily task at specific UTC time
   */
  private scheduleDailyTask(utcTime: string, task: () => Promise<void>): void {
    const [hours, minutes] = utcTime.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setUTCHours(hours, minutes, 0, 0);
    
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
    
    const delay = scheduledTime.getTime() - now.getTime();
    
    setTimeout(() => {
      task();
      // Reschedule for next day
      setInterval(task, 24 * 60 * 60 * 1000);
    }, delay);
    
    this.fastify.log.info({
      task: utcTime === '03:30' ? 'morning_rollup' : 'afternoon_check',
      nextRun: scheduledTime.toISOString(),
    });
  }

  /**
   * Send morning rollup at 9 AM IST
   */
  private async sendMorningRollup(): Promise<void> {
    const metrics = await this.collectDailyMetrics();
    const trends = this.calculateTrends(metrics);
    
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '☀️ Good Morning! Canary Daily Rollup',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Phase:* ${this.config.phase}`,
          },
          {
            type: 'mrkdwn',
            text: `*Coverage:* ${this.getPhasePercentage()}%`,
          },
          {
            type: 'mrkdwn',
            text: `*Regions:* ${this.config.regions.join(', ')}`,
          },
          {
            type: 'mrkdwn',
            text: `*Day:* ${this.getDayInPhase()}`,
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*📊 Gate Metrics (Last 24h)*',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Verify Lift:*\n${metrics.verify_lift}% ${trends.verify_lift}\n_Threshold: ≥20%_`,
          },
          {
            type: 'mrkdwn',
            text: `*Notif Tap:*\n${metrics.notif_action_tap}% ${trends.notif_action_tap}\n_Threshold: ≥12%_`,
          },
          {
            type: 'mrkdwn',
            text: `*False Allow:*\n${metrics.false_allow}% ${trends.false_allow}\n_Threshold: ≤0.8%_`,
          },
          {
            type: 'mrkdwn',
            text: `*Complaint Rate:*\n${metrics.complaint_rate}% ${trends.complaint_rate}\n_Threshold: ≤0.2%_`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: this.getGateSummary(metrics),
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Next evaluation: ${this.getNextEvaluationTime()} | Dashboard: <http://canary.verifd.com|View>`,
          },
        ],
      },
    ];
    
    if (this.areGatesFailing(metrics)) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '⚠️ *Action Required:* Some gates are failing. Monitor closely.',
        },
      });
    }
    
    await this.slackClient.chat.postMessage({
      channel: this.config.rollup.channel,
      blocks,
      text: 'Canary Daily Rollup',
    });
    
    // Cache metrics for afternoon check
    this.metricsCache.set('morning', metrics);
    
    // Log rollup
    this.fastify.log.info({
      action: 'morning_rollup_sent',
      metrics,
      trends,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check thresholds at 2 PM IST and alert if needed
   */
  private async checkAfternoonThresholds(): Promise<void> {
    const metrics = await this.collectDailyMetrics();
    const morningMetrics = this.metricsCache.get('morning');
    
    const breaches = this.detectThresholdBreaches(metrics);
    
    if (breaches.length === 0) {
      // No alerts needed
      this.fastify.log.info({
        action: 'afternoon_check_passed',
        metrics,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    // Send alert for threshold breaches
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚨 Canary Threshold Alert',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${breaches.length} gate(s) breaching thresholds*`,
        },
      },
      {
        type: 'divider',
      },
    ];
    
    for (const breach of breaches) {
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*${breach.metric}:*`,
          },
          {
            type: 'mrkdwn',
            text: `Current: ${breach.current}%\nThreshold: ${breach.threshold}%`,
          },
        ],
      });
      
      if (morningMetrics) {
        const degradation = breach.current - morningMetrics[breach.metricKey];
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Degradation since morning: ${degradation.toFixed(2)}%`,
            },
          ],
        });
      }
    }
    
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📊 View Dashboard',
          },
          url: 'http://canary.verifd.com',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔄 Pause Rollout',
          },
          action_id: 'pause_rollout',
          style: 'danger',
          confirm: {
            title: {
              type: 'plain_text',
              text: 'Pause Canary?',
            },
            text: {
              type: 'mrkdwn',
              text: 'This will stop new users from entering the canary. Existing users remain.',
            },
            confirm: {
              type: 'plain_text',
              text: 'Pause',
            },
            deny: {
              type: 'plain_text',
              text: 'Cancel',
            },
          },
        },
      ],
    });
    
    await this.slackClient.chat.postMessage({
      channel: this.config.rollup.channel,
      blocks,
      text: '🚨 Canary Threshold Alert',
    });
    
    // Log alert
    this.fastify.log.warn({
      action: 'afternoon_threshold_alert',
      breaches,
      metrics,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Set canary phase and update configuration
   */
  async setPhase(phase: CanaryConfig['phase']): Promise<void> {
    const previousPhase = this.config.phase;
    this.config.phase = phase;
    
    // Update feature flags based on phase
    switch (phase) {
      case 'canary_5':
        this.config.flags.MISSED_CALL_ACTIONS = 5;
        this.config.regions = ['US-WEST', 'US-EAST'];
        break;
      case 'canary_20':
        this.config.flags.MISSED_CALL_ACTIONS = 20;
        this.config.regions = ['US-WEST', 'US-EAST', 'US-CENTRAL'];
        break;
      case 'ga_50':
        this.config.flags.MISSED_CALL_ACTIONS = 50;
        this.config.regions = ['US-*', 'CA-*'];
        break;
      case 'full_100':
        this.config.flags.MISSED_CALL_ACTIONS = 100;
        this.config.flags.enableRiskScoring = 'enforce';
        this.config.regions = ['*'];
        break;
    }
    
    // Create audit log entry
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action: 'phase_set',
      previousPhase,
      newPhase: phase,
      flags: this.config.flags,
      regions: this.config.regions,
      signature: this.signAuditEntry({
        previousPhase,
        newPhase: phase,
        timestamp: new Date().toISOString(),
      }),
    };
    
    // Append to audit log
    await this.appendAuditLog(auditEntry);
    
    // Update sticky cohorts
    await this.updateStickyCohorts();
    
    // Send Slack notification
    await this.notifyPhaseChange(previousPhase, phase);
    
    this.fastify.log.info({
      action: 'phase_set',
      previousPhase,
      newPhase: phase,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get current canary dashboard data
   */
  async getDashboard(): Promise<any> {
    const metrics = await this.collectDailyMetrics();
    const historicalMetrics = await this.getHistoricalMetrics(7); // Last 7 days
    
    return {
      phase: this.config.phase,
      coverage: this.getPhasePercentage(),
      dayInPhase: this.getDayInPhase(),
      regions: this.config.regions,
      flags: this.config.flags,
      cohorts: {
        sticky: this.config.cohorts.sticky,
        seed: this.config.cohorts.seed.substring(0, 8) + '...',
      },
      currentMetrics: metrics,
      gates: {
        verify_lift: {
          current: metrics.verify_lift,
          threshold: 20,
          status: metrics.verify_lift >= 20 ? 'passing' : 'failing',
        },
        notif_action_tap: {
          current: metrics.notif_action_tap,
          threshold: 12,
          status: metrics.notif_action_tap >= 12 ? 'passing' : 'failing',
        },
        false_allow: {
          current: metrics.false_allow,
          threshold: 0.8,
          status: metrics.false_allow <= 0.8 ? 'passing' : 'failing',
        },
        complaint_rate: {
          current: metrics.complaint_rate,
          threshold: 0.2,
          status: metrics.complaint_rate <= 0.2 ? 'passing' : 'failing',
        },
      },
      trends: {
        verify_lift: this.calculateTrend(historicalMetrics.verify_lift),
        notif_action_tap: this.calculateTrend(historicalMetrics.notif_action_tap),
        false_allow: this.calculateTrend(historicalMetrics.false_allow),
        complaint_rate: this.calculateTrend(historicalMetrics.complaint_rate),
      },
      nextEvaluation: this.getNextEvaluationTime(),
      auditLog: await this.getRecentAuditEntries(10),
    };
  }

  // Helper methods

  private async collectDailyMetrics(): Promise<any> {
    // In production, query from metrics database
    // For now, return simulated metrics
    return {
      verify_lift: 22 + Math.random() * 5 - 2.5,
      notif_action_tap: 13 + Math.random() * 3 - 1.5,
      false_allow: 0.6 + Math.random() * 0.4 - 0.2,
      complaint_rate: 0.15 + Math.random() * 0.1 - 0.05,
    };
  }

  private calculateTrends(metrics: any): any {
    return {
      verify_lift: metrics.verify_lift > 20 ? '📈' : '📉',
      notif_action_tap: metrics.notif_action_tap > 12 ? '📈' : '📉',
      false_allow: metrics.false_allow < 0.8 ? '📈' : '📉',
      complaint_rate: metrics.complaint_rate < 0.2 ? '📈' : '📉',
    };
  }

  private getPhasePercentage(): number {
    const percentages = {
      off: 0,
      canary_5: 5,
      canary_20: 20,
      ga_50: 50,
      full_100: 100,
    };
    return percentages[this.config.phase];
  }

  private getDayInPhase(): number {
    // Calculate days since phase started
    // In production, track phase start date
    return 1;
  }

  private getGateSummary(metrics: any): string {
    const passing = [];
    const failing = [];
    
    if (metrics.verify_lift >= 20) passing.push('Verify Lift');
    else failing.push('Verify Lift');
    
    if (metrics.notif_action_tap >= 12) passing.push('Notif Tap');
    else failing.push('Notif Tap');
    
    if (metrics.false_allow <= 0.8) passing.push('False Allow');
    else failing.push('False Allow');
    
    if (metrics.complaint_rate <= 0.2) passing.push('Complaint Rate');
    else failing.push('Complaint Rate');
    
    if (failing.length === 0) {
      return '✅ *All gates passing!* Ready for promotion consideration.';
    } else if (passing.length > failing.length) {
      return `⚠️ *${failing.length} gate(s) failing:* ${failing.join(', ')}`;
    } else {
      return `❌ *${failing.length} gate(s) failing:* ${failing.join(', ')}. Monitoring for auto-rollback.`;
    }
  }

  private areGatesFailing(metrics: any): boolean {
    return metrics.verify_lift < 20 ||
           metrics.notif_action_tap < 12 ||
           metrics.false_allow > 0.8 ||
           metrics.complaint_rate > 0.2;
  }

  private detectThresholdBreaches(metrics: any): any[] {
    const breaches = [];
    
    if (metrics.verify_lift < 20) {
      breaches.push({
        metric: 'Verify Lift',
        metricKey: 'verify_lift',
        current: metrics.verify_lift,
        threshold: 20,
        operator: '≥',
      });
    }
    
    if (metrics.notif_action_tap < 12) {
      breaches.push({
        metric: 'Notification Tap',
        metricKey: 'notif_action_tap',
        current: metrics.notif_action_tap,
        threshold: 12,
        operator: '≥',
      });
    }
    
    if (metrics.false_allow > 0.8) {
      breaches.push({
        metric: 'False Allow Rate',
        metricKey: 'false_allow',
        current: metrics.false_allow,
        threshold: 0.8,
        operator: '≤',
      });
    }
    
    if (metrics.complaint_rate > 0.2) {
      breaches.push({
        metric: 'Complaint Rate',
        metricKey: 'complaint_rate',
        current: metrics.complaint_rate,
        threshold: 0.2,
        operator: '≤',
      });
    }
    
    return breaches;
  }

  private getNextEvaluationTime(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setUTCHours(2, 0, 0, 0); // 2 AM UTC
    return tomorrow.toISOString();
  }

  private async updateStickyCohorts(): Promise<void> {
    // Update sticky cohort assignments
    // In production, this would update user assignments in database
    this.fastify.log.info({
      action: 'sticky_cohorts_updated',
      seed: this.config.cohorts.seed,
      regions: this.config.regions,
    });
  }

  private async notifyPhaseChange(previousPhase: string, newPhase: string): Promise<void> {
    await this.slackClient.chat.postMessage({
      channel: this.config.rollup.channel,
      text: `🎯 Canary phase changed: ${previousPhase} → ${newPhase}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🎯 *Canary Phase Updated*\n\`${previousPhase}\` → \`${newPhase}\``,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Coverage:* ${this.getPhasePercentage()}%`,
            },
            {
              type: 'mrkdwn',
              text: `*Regions:* ${this.config.regions.join(', ')}`,
            },
          ],
        },
      ],
    });
  }

  private signAuditEntry(entry: any): string {
    // Sign with Ed25519
    const message = JSON.stringify(entry);
    const signature = crypto
      .sign('sha256', Buffer.from(message), process.env.ADMIN_SIGNING_KEY!)
      .toString('base64');
    return `Ed25519:${signature}`;
  }

  private async appendAuditLog(entry: any): Promise<void> {
    // Append to audit log file
    const auditPath = '/var/log/verifd/canary-audit.jsonl';
    // In production, write to audit log
    this.fastify.log.info({ auditEntry: entry });
  }

  private async getHistoricalMetrics(days: number): Promise<any> {
    // In production, query historical metrics
    return {
      verify_lift: Array(days).fill(20).map((v, i) => v + Math.random() * 5),
      notif_action_tap: Array(days).fill(12).map((v, i) => v + Math.random() * 3),
      false_allow: Array(days).fill(0.6).map((v, i) => v + Math.random() * 0.4),
      complaint_rate: Array(days).fill(0.15).map((v, i) => v + Math.random() * 0.1),
    };
  }

  private calculateTrend(values: number[]): string {
    if (values.length < 2) return '➡️';
    const recent = values.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const previous = values.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
    return recent > previous ? '📈' : recent < previous ? '📉' : '➡️';
  }

  private async getRecentAuditEntries(count: number): Promise<any[]> {
    // In production, read from audit log
    return [
      {
        timestamp: new Date().toISOString(),
        action: 'phase_set',
        phase: 'canary_5',
        signature: 'Ed25519:...',
      },
    ];
  }
}

// Export for use in routes
export async function initializeCanaryRollout(fastify: FastifyInstance) {
  const rolloutManager = new CanaryRolloutManager(fastify);
  
  // Add routes
  fastify.get('/canary/dashboard', async (request, reply) => {
    const dashboard = await rolloutManager.getDashboard();
    return reply.send(dashboard);
  });
  
  fastify.post('/canary/phase', async (request, reply) => {
    const { phase, adminToken } = request.body as any;
    
    if (adminToken !== process.env.ADMIN_CANARY_TOKEN) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    
    await rolloutManager.setPhase(phase);
    
    return reply.send({
      success: true,
      phase,
      coverage: rolloutManager.getPhasePercentage(),
    });
  });
  
  return rolloutManager;
}