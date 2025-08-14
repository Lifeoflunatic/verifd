/**
 * Canary Controller - Automated promotion/rollback with Slack approval gates
 */

import crypto from 'crypto';
import { z } from 'zod';
import { WebClient } from '@slack/web-api';
import { createHmac } from 'crypto';

// Slack interaction payload schema
const SlackInteractionSchema = z.object({
  type: z.literal('block_actions'),
  user: z.object({
    id: z.string(),
    username: z.string(),
  }),
  actions: z.array(z.object({
    action_id: z.string(),
    value: z.string(),
    action_ts: z.string(),
  })),
  response_url: z.string(),
  message_ts: z.string(),
  channel: z.object({
    id: z.string(),
    name: z.string(),
  }),
});

// Canary state schema
const CanaryStateSchema = z.object({
  phase: z.enum(['off', 'canary_5', 'canary_20', 'ga_50', 'full_100']),
  startDate: z.string(),
  consecutiveSuccessDays: z.number(),
  consecutiveFailureDays: z.number(),
  lastEvaluation: z.string(),
  pendingPromotion: z.object({
    fromPhase: z.string(),
    toPhase: z.string(),
    proposedAt: z.string(),
    expiresAt: z.string(),
    approvalToken: z.string(),
  }).optional(),
  metrics: z.object({
    verify_lift: z.array(z.number()),
    notif_action_tap: z.array(z.number()),
    false_allow: z.array(z.number()),
    complaint_rate: z.array(z.number()),
  }),
});

type CanaryState = z.infer<typeof CanaryStateSchema>;
type SlackInteraction = z.infer<typeof SlackInteractionSchema>;

export class CanaryController {
  private slack: WebClient;
  private readonly SLACK_CHANNEL = process.env.CANARY_SLACK_CHANNEL || '#canary-approvals';
  private readonly SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;
  private readonly APPROVAL_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
  
  // Success gates
  private readonly GATES = {
    verify_lift: 20,      // ≥ 20%
    notif_action_tap: 12, // ≥ 12%
    false_allow: 0.8,     // ≤ 0.8%
    complaint_rate: 0.2,  // ≤ 0.2%
  };

  constructor() {
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
  }

  /**
   * Daily evaluation job - runs at midnight UTC
   */
  async evaluateDailyMetrics(): Promise<void> {
    const state = await this.loadCanaryState();
    const todayMetrics = await this.fetchTodayMetrics();
    
    // Update metrics history
    state.metrics.verify_lift.push(todayMetrics.verify_lift);
    state.metrics.notif_action_tap.push(todayMetrics.notif_action_tap);
    state.metrics.false_allow.push(todayMetrics.false_allow);
    state.metrics.complaint_rate.push(todayMetrics.complaint_rate);
    
    // Keep only last 7 days
    Object.keys(state.metrics).forEach(key => {
      const metricArray = state.metrics[key as keyof typeof state.metrics];
      if (metricArray.length > 7) {
        metricArray.shift();
      }
    });
    
    // Check gates
    const gatesPassed = this.checkGates(todayMetrics);
    
    if (gatesPassed) {
      state.consecutiveSuccessDays++;
      state.consecutiveFailureDays = 0;
      
      // Check for promotion eligibility
      if (state.consecutiveSuccessDays >= 5 && !state.pendingPromotion) {
        await this.proposePromotion(state);
      }
    } else {
      state.consecutiveFailureDays++;
      state.consecutiveSuccessDays = 0;
      
      // Auto-rollback after 2 consecutive failures
      if (state.consecutiveFailureDays >= 2) {
        await this.autoRollback(state, todayMetrics);
      }
    }
    
    state.lastEvaluation = new Date().toISOString();
    await this.saveCanaryState(state);
    
    // Log evaluation
    await this.appendAuditLog({
      timestamp: new Date().toISOString(),
      action: 'daily_evaluation',
      phase: state.phase,
      metrics: todayMetrics,
      gatesPassed,
      consecutiveSuccess: state.consecutiveSuccessDays,
      consecutiveFailure: state.consecutiveFailureDays,
    });
  }

  /**
   * Check if all gates pass
   */
  private checkGates(metrics: any): boolean {
    return (
      metrics.verify_lift >= this.GATES.verify_lift &&
      metrics.notif_action_tap >= this.GATES.notif_action_tap &&
      metrics.false_allow <= this.GATES.false_allow &&
      metrics.complaint_rate <= this.GATES.complaint_rate
    );
  }

  /**
   * Propose promotion to Slack for approval
   */
  private async proposePromotion(state: CanaryState): Promise<void> {
    const nextPhase = this.getNextPhase(state.phase);
    if (!nextPhase) return;
    
    const approvalToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + this.APPROVAL_TIMEOUT_MS).toISOString();
    
    // Create pending promotion
    state.pendingPromotion = {
      fromPhase: state.phase,
      toPhase: nextPhase,
      proposedAt: new Date().toISOString(),
      expiresAt,
      approvalToken,
    };
    
    // Send Slack message with approval buttons
    const message = await this.slack.chat.postMessage({
      channel: this.SLACK_CHANNEL,
      text: `Canary Promotion Request`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚀 Canary Promotion Ready',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Current Phase:* ${state.phase}\n*Proposed Phase:* ${nextPhase}\n*Consecutive Success Days:* ${state.consecutiveSuccessDays}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Last 5 Days Metrics (avg):*',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: this.formatMetricsSummary(state.metrics),
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ Approve Promotion',
              },
              style: 'primary',
              action_id: 'approve_promotion',
              value: approvalToken,
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '❌ Reject',
              },
              style: 'danger',
              action_id: 'reject_promotion',
              value: approvalToken,
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '📊 View Dashboard',
              },
              action_id: 'view_dashboard',
              url: 'https://metrics.verifd.com/canary',
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `⏰ Expires in 4 hours at <!date^${Math.floor(new Date(expiresAt).getTime() / 1000)}^{time}|${expiresAt}>`,
            },
          ],
        },
      ],
    });
    
    // Log proposal
    await this.appendAuditLog({
      timestamp: new Date().toISOString(),
      action: 'promotion_proposed',
      fromPhase: state.phase,
      toPhase: nextPhase,
      approvalToken,
      slackMessageTs: message.ts,
      expiresAt,
    });
  }

  /**
   * Handle Slack interaction (approval/rejection)
   */
  async handleSlackInteraction(payload: SlackInteraction): Promise<void> {
    // Verify Slack signature
    if (!this.verifySlackSignature(payload)) {
      throw new Error('Invalid Slack signature');
    }
    
    const action = payload.actions[0];
    const approvalToken = action.value;
    
    const state = await this.loadCanaryState();
    
    // Check if promotion is valid
    if (!state.pendingPromotion || state.pendingPromotion.approvalToken !== approvalToken) {
      await this.respondToSlack(payload.response_url, {
        text: '❌ Invalid or expired promotion request',
      });
      return;
    }
    
    // Check expiration
    if (new Date() > new Date(state.pendingPromotion.expiresAt)) {
      await this.respondToSlack(payload.response_url, {
        text: '⏰ Promotion request has expired',
      });
      state.pendingPromotion = undefined;
      await this.saveCanaryState(state);
      return;
    }
    
    if (action.action_id === 'approve_promotion') {
      await this.executePromotion(state, payload.user);
      await this.respondToSlack(payload.response_url, {
        text: `✅ Promotion approved by @${payload.user.username}`,
      });
    } else if (action.action_id === 'reject_promotion') {
      state.pendingPromotion = undefined;
      await this.saveCanaryState(state);
      await this.respondToSlack(payload.response_url, {
        text: `❌ Promotion rejected by @${payload.user.username}`,
      });
      
      await this.appendAuditLog({
        timestamp: new Date().toISOString(),
        action: 'promotion_rejected',
        rejectedBy: payload.user.username,
        phase: state.phase,
      });
    }
  }

  /**
   * Execute approved promotion
   */
  private async executePromotion(state: CanaryState, approver: any): Promise<void> {
    if (!state.pendingPromotion) return;
    
    const { toPhase } = state.pendingPromotion;
    
    // Call canary phase endpoint
    const response = await fetch('http://localhost:3000/canary/advance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Signature': this.generateAdminSignature({
          phase: toPhase,
          timestamp: Date.now(),
        }),
      },
      body: JSON.stringify({
        adminToken: process.env.ADMIN_CANARY_TOKEN,
        phase: toPhase,
        reason: `Automated promotion after 5 days success, approved by ${approver.username}`,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to advance canary phase: ${response.status}`);
    }
    
    // Update state
    state.phase = toPhase as any;
    state.consecutiveSuccessDays = 0;
    state.pendingPromotion = undefined;
    state.startDate = new Date().toISOString();
    
    await this.saveCanaryState(state);
    
    // Log promotion
    await this.appendAuditLog({
      timestamp: new Date().toISOString(),
      action: 'promotion_executed',
      toPhase,
      approvedBy: approver.username,
      approverId: approver.id,
    });
    
    // Post success message
    await this.slack.chat.postMessage({
      channel: this.SLACK_CHANNEL,
      text: `✅ Canary successfully promoted to ${toPhase}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🎉 *Canary Promoted*\n*New Phase:* ${toPhase}\n*Approved by:* <@${approver.id}>\n*Time:* <!date^${Math.floor(Date.now() / 1000)}^{time_date}|now>`,
          },
        },
      ],
    });
  }

  /**
   * Auto-rollback after 2 consecutive failures
   */
  private async autoRollback(state: CanaryState, failedMetrics: any): Promise<void> {
    // Call rollback endpoint
    const response = await fetch('http://localhost:3000/canary/rollback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Signature': this.generateAdminSignature({
          action: 'rollback',
          timestamp: Date.now(),
        }),
      },
      body: JSON.stringify({
        adminToken: process.env.ADMIN_CANARY_TOKEN,
        reason: `Automated rollback after 2 consecutive days of gate failures`,
      }),
    });
    
    if (!response.ok) {
      console.error('Failed to rollback canary:', response.status);
      // Continue to alert even if rollback fails
    }
    
    // Generate RCA stub
    const rcaStub = this.generateRCAStub(state, failedMetrics);
    
    // Alert Slack
    await this.slack.chat.postMessage({
      channel: this.SLACK_CHANNEL,
      text: '🚨 Canary Auto-Rollback',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 Canary Auto-Rollback Triggered',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Phase:* ${state.phase}\n*Consecutive Failures:* ${state.consecutiveFailureDays} days\n*Action:* Rolled back to OFF`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Failed Gates:*',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: this.formatFailedGates(failedMetrics),
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*RCA Stub:*\n```' + rcaStub + '```',
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '📝 Create RCA Document',
              },
              url: `https://docs.verifd.com/rca/new?template=${encodeURIComponent(rcaStub)}`,
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '📊 View Metrics',
              },
              url: 'https://metrics.verifd.com/canary',
            },
          ],
        },
      ],
    });
    
    // Reset state
    state.phase = 'off';
    state.consecutiveSuccessDays = 0;
    state.consecutiveFailureDays = 0;
    
    await this.saveCanaryState(state);
    
    // Log rollback
    await this.appendAuditLog({
      timestamp: new Date().toISOString(),
      action: 'auto_rollback',
      reason: 'Gate failures for 2 consecutive days',
      failedMetrics,
      rcaStub,
    });
  }

  /**
   * Generate RCA stub for rollback
   */
  private generateRCAStub(state: CanaryState, metrics: any): string {
    const failedGates = [];
    if (metrics.verify_lift < this.GATES.verify_lift) {
      failedGates.push(`Verify Lift: ${metrics.verify_lift}% < ${this.GATES.verify_lift}%`);
    }
    if (metrics.notif_action_tap < this.GATES.notif_action_tap) {
      failedGates.push(`Notif Tap: ${metrics.notif_action_tap}% < ${this.GATES.notif_action_tap}%`);
    }
    if (metrics.false_allow > this.GATES.false_allow) {
      failedGates.push(`False Allow: ${metrics.false_allow}% > ${this.GATES.false_allow}%`);
    }
    if (metrics.complaint_rate > this.GATES.complaint_rate) {
      failedGates.push(`Complaint Rate: ${metrics.complaint_rate}% > ${this.GATES.complaint_rate}%`);
    }
    
    return `
# Canary Rollback RCA

## Incident Summary
- **Date:** ${new Date().toISOString()}
- **Phase:** ${state.phase}
- **Duration:** ${this.getDaysSince(state.startDate)} days
- **Trigger:** Automated rollback after 2 consecutive gate failures

## Failed Gates
${failedGates.map(g => `- ${g}`).join('\n')}

## Timeline
- T-2 days: First gate failure detected
- T-1 day: Second consecutive failure
- T-0: Automated rollback triggered

## Impact
- [ ] Users affected: TBD
- [ ] Revenue impact: TBD
- [ ] Support tickets: TBD

## Root Cause
[ TO BE INVESTIGATED ]

## Action Items
- [ ] Investigate metric anomalies
- [ ] Review recent deployments
- [ ] Check infrastructure issues
- [ ] Analyze user feedback

## Lessons Learned
[ TO BE COMPLETED ]
`;
  }

  /**
   * Verify Slack request signature
   */
  private verifySlackSignature(payload: any): boolean {
    const timestamp = payload.headers?.['x-slack-request-timestamp'];
    const signature = payload.headers?.['x-slack-signature'];
    
    if (!timestamp || !signature) return false;
    
    // Check timestamp is within 5 minutes
    const time = Math.floor(Date.now() / 1000);
    if (Math.abs(time - parseInt(timestamp)) > 300) {
      return false;
    }
    
    // Verify signature
    const sigBasestring = `v0:${timestamp}:${JSON.stringify(payload)}`;
    const mySignature = 'v0=' + createHmac('sha256', this.SLACK_SIGNING_SECRET)
      .update(sigBasestring)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(mySignature),
      Buffer.from(signature)
    );
  }

  /**
   * Helper methods
   */
  private getNextPhase(current: string): string | null {
    const phases = ['off', 'canary_5', 'canary_20', 'ga_50', 'full_100'];
    const idx = phases.indexOf(current);
    return idx >= 0 && idx < phases.length - 1 ? phases[idx + 1] : null;
  }

  private getDaysSince(date: string): number {
    const diff = Date.now() - new Date(date).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  private formatMetricsSummary(metrics: any): string {
    const last5Days = (arr: number[]) => arr.slice(-5);
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    
    return [
      `• Verify Lift: ${avg(last5Days(metrics.verify_lift)).toFixed(1)}% ✅`,
      `• Notif Tap: ${avg(last5Days(metrics.notif_action_tap)).toFixed(1)}% ✅`,
      `• False Allow: ${avg(last5Days(metrics.false_allow)).toFixed(2)}% ✅`,
      `• Complaint: ${avg(last5Days(metrics.complaint_rate)).toFixed(2)}% ✅`,
    ].join('\n');
  }

  private formatFailedGates(metrics: any): string {
    const gates = [];
    if (metrics.verify_lift < this.GATES.verify_lift) {
      gates.push(`• Verify Lift: ${metrics.verify_lift}% ❌ (need ≥${this.GATES.verify_lift}%)`);
    }
    if (metrics.notif_action_tap < this.GATES.notif_action_tap) {
      gates.push(`• Notif Tap: ${metrics.notif_action_tap}% ❌ (need ≥${this.GATES.notif_action_tap}%)`);
    }
    if (metrics.false_allow > this.GATES.false_allow) {
      gates.push(`• False Allow: ${metrics.false_allow}% ❌ (need ≤${this.GATES.false_allow}%)`);
    }
    if (metrics.complaint_rate > this.GATES.complaint_rate) {
      gates.push(`• Complaint: ${metrics.complaint_rate}% ❌ (need ≤${this.GATES.complaint_rate}%)`);
    }
    return gates.join('\n');
  }

  private generateAdminSignature(payload: any): string {
    return createHmac('sha256', process.env.ADMIN_SIGNING_KEY!)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  private async respondToSlack(url: string, message: any): Promise<void> {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  }

  private async loadCanaryState(): Promise<CanaryState> {
    // Implementation would load from database/file
    return {} as CanaryState;
  }

  private async saveCanaryState(state: CanaryState): Promise<void> {
    // Implementation would save to database/file
  }

  private async fetchTodayMetrics(): Promise<any> {
    // Implementation would fetch from telemetry system
    return {};
  }

  private async appendAuditLog(entry: any): Promise<void> {
    // Implementation would append to audit log
  }
}