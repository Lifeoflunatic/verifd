/**
 * Canary advancement endpoint with admin signature verification
 */

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';

const AdvanceRequestSchema = z.object({
  adminToken: z.string(),
  phase: z.enum(['off', 'canary_5', 'canary_20', 'ga_50', 'full_100']),
  reason: z.string(),
});

export default async function canaryAdvanceRoutes(fastify: FastifyInstance) {
  /**
   * POST /canary/advance - Admin-only phase advancement with signature
   */
  fastify.post('/canary/advance', async (request, reply: any) => {
    // Verify admin signature
    const signature = request.headers['x-admin-signature'] as string;
    if (!signature) {
      return reply.status(401).send({ error: 'missing_signature' });
    }
    
    // Parse and validate request
    const body = AdvanceRequestSchema.parse(request.body);
    
    // Verify admin token
    if (body.adminToken !== process.env.ADMIN_CANARY_TOKEN) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    
    // Verify signature (simplified - in production use proper verification)
    const expectedSignature = crypto
      .createHmac('sha256', process.env.ADMIN_SIGNING_KEY || 'dev-key')
      .update(JSON.stringify(request.body))
      .digest('hex');
    
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      fastify.log.warn('Invalid admin signature attempt');
      return reply.status(401).send({ error: 'invalid_signature' });
    }
    
    try {
      // Load current config
      const configPath = './config/canary.json';
      const fs = await import('fs/promises');
      const path = await import('path');
      
      let config: any;
      try {
        const data = await fs.readFile(configPath, 'utf8');
        config = JSON.parse(data);
      } catch {
        // Default config if file doesn't exist
        config = {
          version: 1,
          timestamp: new Date().toISOString(),
          phase: 'off',
          flags: {
            MISSED_CALL_ACTIONS: { enabled: false, percentage: 0, geo: [] },
            enableTemplates: true,
            enableRiskScoring: { enabled: true, shadowMode: true },
          },
          successGates: {
            verifyLift: 20,
            notifActionTap: 12,
            falseAllow: 0.8,
            complaintRate: 0.2,
          },
          monitoring: {
            startDate: '',
            consecutiveDays: 0,
          },
        };
      }
      
      // Update phase and flags
      const oldPhase = config.phase;
      config.phase = body.phase;
      config.version += 1;
      config.timestamp = new Date().toISOString();
      
      // Update flags based on phase
      switch (body.phase) {
        case 'off':
          config.flags.MISSED_CALL_ACTIONS.enabled = false;
          config.flags.MISSED_CALL_ACTIONS.percentage = 0;
          config.flags.MISSED_CALL_ACTIONS.geo = [];
          break;
        case 'canary_5':
          config.flags.MISSED_CALL_ACTIONS.enabled = true;
          config.flags.MISSED_CALL_ACTIONS.percentage = 5;
          config.flags.MISSED_CALL_ACTIONS.geo = ['US'];
          config.monitoring.startDate = new Date().toISOString();
          break;
        case 'canary_20':
          config.flags.MISSED_CALL_ACTIONS.enabled = true;
          config.flags.MISSED_CALL_ACTIONS.percentage = 20;
          config.flags.MISSED_CALL_ACTIONS.geo = ['US', 'CA'];
          break;
        case 'ga_50':
          config.flags.MISSED_CALL_ACTIONS.enabled = true;
          config.flags.MISSED_CALL_ACTIONS.percentage = 50;
          config.flags.MISSED_CALL_ACTIONS.geo = ['US', 'CA', 'GB', 'AU'];
          break;
        case 'full_100':
          config.flags.MISSED_CALL_ACTIONS.enabled = true;
          config.flags.MISSED_CALL_ACTIONS.percentage = 100;
          config.flags.MISSED_CALL_ACTIONS.geo = []; // All countries
          break;
      }
      
      // Save updated config
      const dir = path.dirname(configPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      
      // Append to audit log
      const auditEntry = {
        timestamp: new Date().toISOString(),
        action: 'phase_advance',
        actor: 'admin_signed',
        oldPhase,
        newPhase: body.phase,
        reason: body.reason,
        signature: signature.substring(0, 16) + '...',
        version: config.version,
      };
      
      const auditPath = './logs/canary-audit.jsonl';
      const auditDir = path.dirname(auditPath);
      await fs.mkdir(auditDir, { recursive: true });
      await fs.appendFile(auditPath, JSON.stringify(auditEntry) + '\n', 'utf8');
      
      // Log success
      fastify.log.info({
        msg: 'Canary phase advanced',
        from: oldPhase,
        to: body.phase,
        reason: body.reason,
      });
      
      return reply.send({
        success: true,
        phase: body.phase,
        version: config.version,
        timestamp: config.timestamp,
      });
      
    } catch (error) {
      fastify.log.error('Failed to advance canary phase:', error);
      return reply.status(500).send({ error: 'advancement_failed' });
    }
  });
  
  /**
   * GET /canary/state - Get current canary controller state
   */
  fastify.get('/canary/state', async (request, reply: any) => {
    try {
      const fs = await import('fs/promises');
      
      // Load state file
      const statePath = './data/canary-state.json';
      let state: any;
      
      try {
        const data = await fs.readFile(statePath, 'utf8');
        state = JSON.parse(data);
      } catch {
        // Default state if file doesn't exist
        state = {
          phase: 'off',
          startDate: new Date().toISOString(),
          consecutiveSuccessDays: 0,
          consecutiveFailureDays: 0,
          lastEvaluation: null,
          pendingPromotion: null,
          metrics: {
            verify_lift: [],
            notif_action_tap: [],
            false_allow: [],
            complaint_rate: [],
          },
        };
      }
      
      return reply.send(state);
      
    } catch (error) {
      fastify.log.error('Failed to get canary state:', error);
      return reply.status(500).send({ error: 'state_unavailable' });
    }
  });
  
  /**
   * POST /canary/slack-interaction - Handle Slack approval interactions
   */
  fastify.post('/canary/slack-interaction', async (request, reply: any) => {
    // Verify Slack signature
    const timestamp = request.headers['x-slack-request-timestamp'] as string;
    const signature = request.headers['x-slack-signature'] as string;
    
    if (!timestamp || !signature) {
      return reply.status(401).send({ error: 'missing_slack_headers' });
    }
    
    // Check timestamp is within 5 minutes
    const time = Math.floor(Date.now() / 1000);
    if (Math.abs(time - parseInt(timestamp)) > 300) {
      return reply.status(401).send({ error: 'request_timeout' });
    }
    
    // Verify signature
    const sigBasestring = `v0:${timestamp}:${JSON.stringify(request.body)}`;
    const mySignature = 'v0=' + crypto
      .createHmac('sha256', process.env.SLACK_SIGNING_SECRET || 'dev-secret')
      .update(sigBasestring)
      .digest('hex');
    
    if (!crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature))) {
      return reply.status(401).send({ error: 'invalid_slack_signature' });
    }
    
    // Parse Slack payload
    const payload = typeof request.body === 'string' 
      ? JSON.parse(decodeURIComponent(request.body).replace('payload=', ''))
      : request.body;
    
    // Import and use controller
    const { CanaryController } = await import('../services/canary-controller.js');
    const controller = new CanaryController();
    
    try {
      await controller.handleSlackInteraction(payload);
      return reply.send({ ok: true });
    } catch (error) {
      fastify.log.error('Failed to handle Slack interaction:', error);
      return reply.status(500).send({ error: 'interaction_failed' });
    }
  });
}