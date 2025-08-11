import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanaryController } from '../src/services/canary-controller';

// Mock Slack Web API
vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ts: '1234567890.123456' }),
    },
  })),
}));

// Mock environment variables
process.env.ADMIN_CANARY_TOKEN = 'test-canary-token';
process.env.SLACK_SIGNING_SECRET = 'test-slack-secret';
process.env.ADMIN_SIGNING_KEY = 'test-admin-key';
process.env.SLACK_BOT_TOKEN = 'test-bot-token';
process.env.CANARY_SLACK_CHANNEL = '#test-channel';

describe('CanaryController', () => {
  let controller: CanaryController;
  
  beforeEach(() => {
    controller = new CanaryController();
    vi.clearAllMocks();
  });

  describe('Daily Evaluation', () => {
    it('should detect success gates and increment counter', async () => {
      const mockState = {
        phase: 'canary_5',
        startDate: new Date().toISOString(),
        consecutiveSuccessDays: 4,
        consecutiveFailureDays: 0,
        lastEvaluation: new Date().toISOString(),
        metrics: {
          verify_lift: [22, 23, 24, 25],
          notif_action_tap: [13, 14, 14, 15],
          false_allow: [0.7, 0.6, 0.6, 0.5],
          complaint_rate: [0.15, 0.12, 0.11, 0.10],
        },
      };

      const mockTodayMetrics = {
        verify_lift: 26,        // ✓ ≥20%
        notif_action_tap: 15,   // ✓ ≥12%
        false_allow: 0.5,       // ✓ ≤0.8%
        complaint_rate: 0.09,   // ✓ ≤0.2%
      };

      // Mock methods
      vi.spyOn(controller as any, 'loadCanaryState').mockResolvedValue(mockState);
      vi.spyOn(controller as any, 'fetchTodayMetrics').mockResolvedValue(mockTodayMetrics);
      vi.spyOn(controller as any, 'saveCanaryState').mockResolvedValue(undefined);
      vi.spyOn(controller as any, 'appendAuditLog').mockResolvedValue(undefined);
      const proposeSpy = vi.spyOn(controller as any, 'proposePromotion').mockResolvedValue(undefined);

      await controller.evaluateDailyMetrics();

      // Should propose promotion after 5 consecutive success days
      expect(proposeSpy).toHaveBeenCalledWith(expect.objectContaining({
        consecutiveSuccessDays: 5,
        consecutiveFailureDays: 0,
      }));
    });

    it('should detect failed gates and trigger rollback after 2 days', async () => {
      const mockState = {
        phase: 'canary_5',
        startDate: new Date().toISOString(),
        consecutiveSuccessDays: 0,
        consecutiveFailureDays: 1,
        lastEvaluation: new Date().toISOString(),
        metrics: {
          verify_lift: [18, 17],
          notif_action_tap: [10, 9],
          false_allow: [1.0, 1.2],
          complaint_rate: [0.3, 0.4],
        },
      };

      const mockTodayMetrics = {
        verify_lift: 15,        // ✗ <20%
        notif_action_tap: 8,    // ✗ <12%
        false_allow: 1.5,       // ✗ >0.8%
        complaint_rate: 0.5,    // ✗ >0.2%
      };

      vi.spyOn(controller as any, 'loadCanaryState').mockResolvedValue(mockState);
      vi.spyOn(controller as any, 'fetchTodayMetrics').mockResolvedValue(mockTodayMetrics);
      vi.spyOn(controller as any, 'saveCanaryState').mockResolvedValue(undefined);
      vi.spyOn(controller as any, 'appendAuditLog').mockResolvedValue(undefined);
      const rollbackSpy = vi.spyOn(controller as any, 'autoRollback').mockResolvedValue(undefined);

      await controller.evaluateDailyMetrics();

      // Should trigger rollback after 2 consecutive failure days
      expect(rollbackSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          consecutiveFailureDays: 2,
        }),
        mockTodayMetrics
      );
    });
  });

  describe('Slack Interactions', () => {
    it('should approve valid promotion request', async () => {
      const mockState = {
        phase: 'canary_5',
        pendingPromotion: {
          fromPhase: 'canary_5',
          toPhase: 'canary_20',
          proposedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
          approvalToken: 'test-token-123',
        },
        startDate: new Date().toISOString(),
        consecutiveSuccessDays: 5,
        consecutiveFailureDays: 0,
        lastEvaluation: new Date().toISOString(),
        metrics: {
          verify_lift: [22, 23, 24, 25, 26],
          notif_action_tap: [13, 14, 14, 15, 15],
          false_allow: [0.7, 0.6, 0.6, 0.5, 0.5],
          complaint_rate: [0.15, 0.12, 0.11, 0.10, 0.09],
        },
      };

      const mockPayload = {
        type: 'block_actions',
        user: {
          id: 'U123456',
          username: 'testuser',
        },
        actions: [{
          action_id: 'approve_promotion',
          value: 'test-token-123',
          action_ts: '1234567890.123456',
        }],
        response_url: 'https://hooks.slack.com/response',
        message_ts: '1234567890.123456',
        channel: {
          id: 'C123456',
          name: 'test-channel',
        },
        headers: {
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
          'x-slack-signature': 'v0=test-signature',
        },
      };

      vi.spyOn(controller as any, 'verifySlackSignature').mockReturnValue(true);
      vi.spyOn(controller as any, 'loadCanaryState').mockResolvedValue(mockState);
      vi.spyOn(controller as any, 'saveCanaryState').mockResolvedValue(undefined);
      const executeSpy = vi.spyOn(controller as any, 'executePromotion').mockResolvedValue(undefined);
      vi.spyOn(controller as any, 'respondToSlack').mockResolvedValue(undefined);

      await controller.handleSlackInteraction(mockPayload as any);

      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingPromotion: expect.objectContaining({
            approvalToken: 'test-token-123',
          }),
        }),
        mockPayload.user
      );
    });

    it('should reject expired promotion request', async () => {
      const mockState = {
        phase: 'canary_5',
        pendingPromotion: {
          fromPhase: 'canary_5',
          toPhase: 'canary_20',
          proposedAt: new Date(Date.now() - 5 * 3600000).toISOString(), // 5 hours ago
          expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago (expired)
          approvalToken: 'test-token-123',
        },
        startDate: new Date().toISOString(),
        consecutiveSuccessDays: 5,
        consecutiveFailureDays: 0,
        lastEvaluation: new Date().toISOString(),
        metrics: {
          verify_lift: [],
          notif_action_tap: [],
          false_allow: [],
          complaint_rate: [],
        },
      };

      const mockPayload = {
        type: 'block_actions',
        user: {
          id: 'U123456',
          username: 'testuser',
        },
        actions: [{
          action_id: 'approve_promotion',
          value: 'test-token-123',
          action_ts: '1234567890.123456',
        }],
        response_url: 'https://hooks.slack.com/response',
        message_ts: '1234567890.123456',
        channel: {
          id: 'C123456',
          name: 'test-channel',
        },
      };

      vi.spyOn(controller as any, 'verifySlackSignature').mockReturnValue(true);
      vi.spyOn(controller as any, 'loadCanaryState').mockResolvedValue(mockState);
      vi.spyOn(controller as any, 'saveCanaryState').mockResolvedValue(undefined);
      const respondSpy = vi.spyOn(controller as any, 'respondToSlack').mockResolvedValue(undefined);

      await controller.handleSlackInteraction(mockPayload as any);

      expect(respondSpy).toHaveBeenCalledWith(
        'https://hooks.slack.com/response',
        expect.objectContaining({
          text: '⏰ Promotion request has expired',
        })
      );
    });

    it('should handle promotion rejection', async () => {
      const mockState = {
        phase: 'canary_5',
        pendingPromotion: {
          fromPhase: 'canary_5',
          toPhase: 'canary_20',
          proposedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          approvalToken: 'test-token-123',
        },
        startDate: new Date().toISOString(),
        consecutiveSuccessDays: 5,
        consecutiveFailureDays: 0,
        lastEvaluation: new Date().toISOString(),
        metrics: {
          verify_lift: [],
          notif_action_tap: [],
          false_allow: [],
          complaint_rate: [],
        },
      };

      const mockPayload = {
        type: 'block_actions',
        user: {
          id: 'U123456',
          username: 'testuser',
        },
        actions: [{
          action_id: 'reject_promotion',
          value: 'test-token-123',
          action_ts: '1234567890.123456',
        }],
        response_url: 'https://hooks.slack.com/response',
        message_ts: '1234567890.123456',
        channel: {
          id: 'C123456',
          name: 'test-channel',
        },
      };

      vi.spyOn(controller as any, 'verifySlackSignature').mockReturnValue(true);
      vi.spyOn(controller as any, 'loadCanaryState').mockResolvedValue(mockState);
      const saveSpy = vi.spyOn(controller as any, 'saveCanaryState').mockResolvedValue(undefined);
      const auditSpy = vi.spyOn(controller as any, 'appendAuditLog').mockResolvedValue(undefined);
      vi.spyOn(controller as any, 'respondToSlack').mockResolvedValue(undefined);

      await controller.handleSlackInteraction(mockPayload as any);

      // Should clear pending promotion
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingPromotion: undefined,
        })
      );

      // Should log rejection
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'promotion_rejected',
          rejectedBy: 'testuser',
        })
      );
    });
  });

  describe('Gate Evaluation', () => {
    it('should correctly evaluate passing gates', () => {
      const metrics = {
        verify_lift: 25,        // ✓ ≥20%
        notif_action_tap: 15,   // ✓ ≥12%
        false_allow: 0.5,       // ✓ ≤0.8%
        complaint_rate: 0.1,    // ✓ ≤0.2%
      };

      const result = (controller as any).checkGates(metrics);
      expect(result).toBe(true);
    });

    it('should correctly evaluate failing gates', () => {
      const metrics = {
        verify_lift: 18,        // ✗ <20%
        notif_action_tap: 15,   // ✓ ≥12%
        false_allow: 0.5,       // ✓ ≤0.8%
        complaint_rate: 0.1,    // ✓ ≤0.2%
      };

      const result = (controller as any).checkGates(metrics);
      expect(result).toBe(false);
    });

    it('should detect all gate failures', () => {
      const metrics = {
        verify_lift: 15,        // ✗ <20%
        notif_action_tap: 10,   // ✗ <12%
        false_allow: 1.0,       // ✗ >0.8%
        complaint_rate: 0.3,    // ✗ >0.2%
      };

      const result = (controller as any).checkGates(metrics);
      expect(result).toBe(false);
    });
  });

  describe('RCA Stub Generation', () => {
    it('should generate comprehensive RCA stub', () => {
      const mockState = {
        phase: 'canary_20',
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
        consecutiveSuccessDays: 0,
        consecutiveFailureDays: 2,
        lastEvaluation: new Date().toISOString(),
        metrics: {
          verify_lift: [],
          notif_action_tap: [],
          false_allow: [],
          complaint_rate: [],
        },
      };

      const failedMetrics = {
        verify_lift: 15,        // Failed
        notif_action_tap: 10,   // Failed
        false_allow: 1.2,       // Failed
        complaint_rate: 0.4,    // Failed
      };

      const rcaStub = (controller as any).generateRCAStub(mockState, failedMetrics);

      expect(rcaStub).toContain('Canary Rollback RCA');
      expect(rcaStub).toContain('Phase:** canary_20');
      expect(rcaStub).toContain('Duration:** 7 days');
      expect(rcaStub).toContain('Verify Lift: 15% < 20%');
      expect(rcaStub).toContain('Notif Tap: 10% < 12%');
      expect(rcaStub).toContain('False Allow: 1.2% > 0.8%');
      expect(rcaStub).toContain('Complaint Rate: 0.4% > 0.2%');
      expect(rcaStub).toContain('Automated rollback after 2 consecutive gate failures');
    });
  });

  describe('Phase Progression', () => {
    it('should correctly determine next phase', () => {
      const controller = new CanaryController();
      
      expect((controller as any).getNextPhase('off')).toBe('canary_5');
      expect((controller as any).getNextPhase('canary_5')).toBe('canary_20');
      expect((controller as any).getNextPhase('canary_20')).toBe('ga_50');
      expect((controller as any).getNextPhase('ga_50')).toBe('full_100');
      expect((controller as any).getNextPhase('full_100')).toBe(null);
    });
  });
});