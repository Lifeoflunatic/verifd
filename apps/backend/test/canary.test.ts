import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import canaryRoutes from '../src/routes/canary';
import fs from 'fs/promises';
import path from 'path';

// Mock environment variables
process.env.ADMIN_CANARY_TOKEN = 'test-canary-token';
process.env.CANARY_SIGNING_KEY = 'test-signing-key';

describe('Canary Routes', () => {
  let fastify: any;
  const CANARY_CONFIG_PATH = './config/canary.json';
  const METRICS_LOG_PATH = './logs/canary-metrics.jsonl';
  const AUDIT_LOG_PATH = './logs/canary-audit.jsonl';

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    await fastify.register(canaryRoutes);
    
    // Clean up test files
    try {
      await fs.unlink(CANARY_CONFIG_PATH);
      await fs.unlink(METRICS_LOG_PATH);
      await fs.unlink(AUDIT_LOG_PATH);
    } catch {
      // Files may not exist
    }
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /canary/config', () => {
    it('should return default config when no config exists', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/canary/config',
      });

      expect(response.statusCode).toBe(200);
      const config = JSON.parse(response.payload);
      
      expect(config.phase).toBe('off');
      expect(config.flags.MISSED_CALL_ACTIONS.enabled).toBe(false);
      expect(config.flags.MISSED_CALL_ACTIONS.percentage).toBe(0);
      expect(config.flags.enableTemplates).toBe(true);
      expect(config.flags.enableRiskScoring.shadowMode).toBe(true);
    });

    it('should include signature header', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/canary/config',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-canary-signature']).toBeDefined();
      expect(response.headers['x-canary-version']).toBeDefined();
    });
  });

  describe('POST /canary/phase', () => {
    it('should reject unauthorized requests', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/canary/phase',
        payload: {
          adminToken: 'wrong-token',
          phase: 'canary_5',
          reason: 'test',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload)).toEqual({ error: 'unauthorized' });
    });

    it('should update to canary_5 phase', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/canary/phase',
        payload: {
          adminToken: 'test-canary-token',
          phase: 'canary_5',
          reason: 'Starting canary rollout',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.success).toBe(true);
      expect(result.phase).toBe('canary_5');
      expect(result.version).toBe(2); // Incremented from 1

      // Verify config was updated
      const configResponse = await fastify.inject({
        method: 'GET',
        url: '/canary/config',
      });
      
      const config = JSON.parse(configResponse.payload);
      expect(config.phase).toBe('canary_5');
      expect(config.flags.MISSED_CALL_ACTIONS.enabled).toBe(true);
      expect(config.flags.MISSED_CALL_ACTIONS.percentage).toBe(5);
      expect(config.flags.MISSED_CALL_ACTIONS.geo).toEqual(['US']);
    });

    it('should create audit log for phase change', async () => {
      await fastify.inject({
        method: 'POST',
        url: '/canary/phase',
        payload: {
          adminToken: 'test-canary-token',
          phase: 'canary_20',
          reason: 'Expanding rollout',
        },
      });

      // Check audit log
      const auditLog = await fs.readFile(AUDIT_LOG_PATH, 'utf8');
      const entries = auditLog.trim().split('\n').map(line => JSON.parse(line));
      
      expect(entries.length).toBeGreaterThan(0);
      const lastEntry = entries[entries.length - 1];
      expect(lastEntry.action).toBe('phase_change');
      expect(lastEntry.newPhase).toBe('canary_20');
      expect(lastEntry.reason).toBe('Expanding rollout');
    });
  });

  describe('POST /canary/metrics', () => {
    it('should accept and log daily metrics', async () => {
      const metrics = {
        date: '2025-01-15',
        metrics: {
          verify_started: 10000,
          verify_completed: 2400,
          verify_lift: 24,
          notif_action_tap: 14.5,
          false_allow: 0.6,
          complaint_rate: 0.1,
        },
        phase: 'canary_5',
        passedGates: true,
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/canary/metrics',
        payload: metrics,
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.success).toBe(true);
      expect(result.gatesPassed).toBe(true);
      expect(result.consecutiveDays).toBe(1);

      // Verify metrics were logged
      const metricsLog = await fs.readFile(METRICS_LOG_PATH, 'utf8');
      const loggedMetrics = JSON.parse(metricsLog.trim());
      expect(loggedMetrics.date).toBe('2025-01-15');
    });

    it('should detect failed gates', async () => {
      const metrics = {
        date: '2025-01-15',
        metrics: {
          verify_started: 10000,
          verify_completed: 1800,
          verify_lift: 18, // Below 20% threshold
          notif_action_tap: 10, // Below 12% threshold
          false_allow: 1.0, // Above 0.8% threshold
          complaint_rate: 0.3, // Above 0.2% threshold
        },
        phase: 'canary_5',
        passedGates: false,
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/canary/metrics',
        payload: metrics,
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.gatesPassed).toBe(false);
      expect(result.consecutiveDays).toBe(0);
      expect(result.recommendation).toBe('continue_monitoring');
    });

    it('should track consecutive days of success', async () => {
      // Submit 3 days of successful metrics
      for (let day = 1; day <= 3; day++) {
        const metrics = {
          date: `2025-01-${15 + day}`,
          metrics: {
            verify_started: 10000,
            verify_completed: 2500,
            verify_lift: 25,
            notif_action_tap: 15,
            false_allow: 0.5,
            complaint_rate: 0.1,
          },
          phase: 'canary_5',
          passedGates: true,
        };

        const response = await fastify.inject({
          method: 'POST',
          url: '/canary/metrics',
          payload: metrics,
        });

        const result = JSON.parse(response.payload);
        expect(result.consecutiveDays).toBe(day);
      }
    });
  });

  describe('GET /canary/dashboard', () => {
    it('should return dashboard with current status', async () => {
      // Set up canary phase first
      await fastify.inject({
        method: 'POST',
        url: '/canary/phase',
        payload: {
          adminToken: 'test-canary-token',
          phase: 'canary_5',
          reason: 'test',
        },
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/canary/dashboard',
      });

      expect(response.statusCode).toBe(200);
      const dashboard = JSON.parse(response.payload);
      
      expect(dashboard.currentPhase).toBe('canary_5');
      expect(dashboard.flags.MISSED_CALL_ACTIONS.percentage).toBe(5);
      expect(dashboard.successGates).toBeDefined();
      expect(dashboard.recommendation).toBeDefined();
    });
  });

  describe('POST /canary/rollback', () => {
    it('should rollback to off phase', async () => {
      // First enable canary
      await fastify.inject({
        method: 'POST',
        url: '/canary/phase',
        payload: {
          adminToken: 'test-canary-token',
          phase: 'canary_20',
          reason: 'test',
        },
      });

      // Then rollback
      const response = await fastify.inject({
        method: 'POST',
        url: '/canary/rollback',
        payload: {
          adminToken: 'test-canary-token',
          reason: 'High error rate detected',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.success).toBe(true);
      expect(result.phase).toBe('off');

      // Verify config was rolled back
      const configResponse = await fastify.inject({
        method: 'GET',
        url: '/canary/config',
      });
      
      const config = JSON.parse(configResponse.payload);
      expect(config.phase).toBe('off');
      expect(config.flags.MISSED_CALL_ACTIONS.enabled).toBe(false);
      expect(config.flags.MISSED_CALL_ACTIONS.percentage).toBe(0);
    });

    it('should create audit log for rollback', async () => {
      await fastify.inject({
        method: 'POST',
        url: '/canary/rollback',
        payload: {
          adminToken: 'test-canary-token',
          reason: 'Emergency rollback',
        },
      });

      const auditLog = await fs.readFile(AUDIT_LOG_PATH, 'utf8');
      const entries = auditLog.trim().split('\n').map(line => JSON.parse(line));
      
      const rollbackEntry = entries.find(e => e.action === 'emergency_rollback');
      expect(rollbackEntry).toBeDefined();
      expect(rollbackEntry.reason).toBe('Emergency rollback');
    });
  });

  describe('Success Gates Logic', () => {
    it('should correctly evaluate all gates passing', async () => {
      const metrics = {
        date: '2025-01-15',
        metrics: {
          verify_started: 10000,
          verify_completed: 2500,
          verify_lift: 25, // ✓ ≥20%
          notif_action_tap: 15, // ✓ ≥12%
          false_allow: 0.5, // ✓ ≤0.8%
          complaint_rate: 0.1, // ✓ ≤0.2%
        },
        phase: 'canary_5',
        passedGates: true,
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/canary/metrics',
        payload: metrics,
      });

      const result = JSON.parse(response.payload);
      expect(result.gatesPassed).toBe(true);
    });

    it('should correctly evaluate partial gate failure', async () => {
      const metrics = {
        date: '2025-01-15',
        metrics: {
          verify_started: 10000,
          verify_completed: 2500,
          verify_lift: 25, // ✓ ≥20%
          notif_action_tap: 11, // ✗ <12%
          false_allow: 0.5, // ✓ ≤0.8%
          complaint_rate: 0.1, // ✓ ≤0.2%
        },
        phase: 'canary_5',
        passedGates: false,
      };

      const response = await fastify.inject({
        method: 'POST',
        url: '/canary/metrics',
        payload: metrics,
      });

      const result = JSON.parse(response.payload);
      expect(result.gatesPassed).toBe(false);
    });

    it('should recommend expansion after 5 consecutive days', async () => {
      // Simulate 5 days of successful metrics
      for (let day = 1; day <= 5; day++) {
        await fastify.inject({
          method: 'POST',
          url: '/canary/metrics',
          payload: {
            date: `2025-01-${15 + day}`,
            metrics: {
              verify_started: 10000,
              verify_completed: 2500,
              verify_lift: 25,
              notif_action_tap: 15,
              false_allow: 0.5,
              complaint_rate: 0.1,
            },
            phase: 'canary_5',
            passedGates: true,
          },
        });
      }

      const response = await fastify.inject({
        method: 'GET',
        url: '/canary/dashboard',
      });

      const dashboard = JSON.parse(response.payload);
      expect(dashboard.monitoring.consecutiveDaysMetGates).toBe(5);
      expect(dashboard.recommendation).toContain('Ready to expand');
    });
  });
});