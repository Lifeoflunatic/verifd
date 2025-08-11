/**
 * Staging-specific configuration for verifd
 * Used for canary validation, key rotation testing, and release train
 */

import { config as baseConfig } from '../config.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Staging-specific overrides
export const stagingConfig = {
  ...baseConfig,
  
  // Environment
  environment: 'staging' as const,
  isStaging: true,
  logLevel: 'debug' as const,
  
  // More restrictive rate limits for staging
  rateLimits: {
    perIp: {
      max: 3,
      windowMs: 60000, // 1 minute
    },
    perPhone: {
      max: 5,
      windowMs: 60000, // 1 minute
    },
  },
  
  // Reduced vPass scopes for testing
  vpass: {
    defaultScope: '30m',
    scopes: ['30m', '24h'], // No 30d in staging
  },
  
  // Voice ping restrictions
  voicePing: {
    maxPerDay: 1, // Much more restrictive
    businessHoursOnly: true,
    businessStart: '10:00',
    businessEnd: '16:00',
  },
  
  // SMS only in staging
  channels: {
    available: ['sms'],
    default: 'sms',
  },
  
  // Staging-specific paths
  paths: {
    stagingKeys: process.env.STAGING_KEYS_DIR || './keys/staging',
    stagingConfig: process.env.STAGING_CONFIG_DIR || './config/staging',
    stagingLogs: process.env.STAGING_LOGS_DIR || './logs/staging',
    stagingDb: process.env.STAGING_DB || './var/db/verifd-staging.sqlite',
  },
  
  // Canary controller staging settings
  canary: {
    slackChannel: process.env.CANARY_SLACK_CHANNEL || '#staging-canary-approvals',
    slackBotToken: process.env.SLACK_STAGING_BOT_TOKEN,
    slackSigningSecret: process.env.SLACK_STAGING_SIGNING_SECRET,
    adminToken: process.env.ADMIN_CANARY_TOKEN,
    killSwitchToken: process.env.ADMIN_KILL_SWITCH_TOKEN,
    adminSigningKey: process.env.ADMIN_SIGNING_KEY,
    signingKey: process.env.CANARY_SIGNING_KEY,
    
    // More lenient gates for staging validation
    successGates: {
      verifyLift: 15, // 15% instead of 20%
      notifActionTap: 10, // 10% instead of 12%
      falseAllow: 1.0, // 1.0% instead of 0.8%
      complaintRate: 0.5, // 0.5% instead of 0.2%
    },
    
    // Shorter evaluation periods for faster testing
    evaluationPeriod: {
      dailyEvaluationHour: 23, // 11 PM UTC
      consecutiveDaysRequired: 3, // 3 instead of 5
      approvalTimeoutMs: 2 * 60 * 60 * 1000, // 2 hours instead of 4
    },
  },
  
  // Key rotation settings
  keyRotation: {
    jwksEndpoint: process.env.JWKS_ENDPOINT_URL || 'http://localhost:3001/.well-known/jwks.json',
    signingKeyPath: process.env.SIGNING_KEY_PATH || './keys/staging/signing.key',
    signingKeyId: process.env.SIGNING_KEY_ID || `staging-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    rotationIntervalDays: 30, // 30 days for staging
    keyBackupEnabled: true,
  },
  
  // Release train configuration
  releaseTrain: {
    webhook: process.env.RELEASE_TRAIN_WEBHOOK_STAGING,
    stagingBranch: process.env.STAGING_DEPLOY_BRANCH || 'feat/zod-row-typing',
    deploymentTimeout: 10 * 60 * 1000, // 10 minutes
    validationTimeout: 5 * 60 * 1000, // 5 minutes
    rollbackEnabled: true,
  },
  
  // Slack integration
  slack: {
    staging: {
      botToken: process.env.SLACK_STAGING_BOT_TOKEN,
      signingSecret: process.env.SLACK_STAGING_SIGNING_SECRET,
      channel: '#staging-canary-approvals',
      approvalUsers: process.env.SLACK_STAGING_APPROVAL_USERS?.split(',') || ['admin'],
    },
  },
  
  // Monitoring and alerting
  monitoring: {
    healthCheckInterval: 30000, // 30 seconds
    metricsRetentionDays: 7, // 7 days for staging
    verboseLogging: true,
    telemetryEnabled: true,
    alertsEnabled: true,
  },
  
  // Database settings
  database: {
    path: process.env.STAGING_DB || './var/db/verifd-staging.sqlite',
    backupEnabled: false, // No backups in staging
    connectionPoolSize: 5,
    queryTimeout: 10000, // 10 seconds
  },
} as const;

/**
 * Load staging admin tokens from secure file
 */
export function loadStagingAdminTokens() {
  try {
    const tokensPath = join(stagingConfig.paths.stagingKeys, 'admin-tokens.json');
    const tokens = JSON.parse(readFileSync(tokensPath, 'utf8'));
    return {
      canaryToken: tokens.canary_token,
      killSwitchToken: tokens.kill_switch_token,
      adminSigningKey: tokens.admin_signing_key,
    };
  } catch (error) {
    console.warn('Failed to load staging admin tokens:', error);
    return null;
  }
}

/**
 * Load staging signing keys
 */
export function loadStagingSigningKeys() {
  try {
    const signingKeyPath = join(stagingConfig.paths.stagingKeys, 'signing.key');
    const canaryKeyPath = join(stagingConfig.paths.stagingKeys, 'canary.key');
    const hmacKeyPath = join(stagingConfig.paths.stagingKeys, 'hmac.key');
    const jwtKeyPath = join(stagingConfig.paths.stagingKeys, 'jwt.key');
    
    return {
      signingKey: readFileSync(signingKeyPath, 'utf8'),
      canaryKey: readFileSync(canaryKeyPath, 'utf8'),
      hmacKey: readFileSync(hmacKeyPath, 'utf8').trim(),
      jwtKey: readFileSync(jwtKeyPath, 'utf8').trim(),
    };
  } catch (error) {
    console.warn('Failed to load staging signing keys:', error);
    return null;
  }
}

/**
 * Validate staging environment
 */
export function validateStagingEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check required environment variables
  const requiredEnvVars = [
    'ADMIN_CANARY_TOKEN',
    'ADMIN_KILL_SWITCH_TOKEN',
    'ADMIN_SIGNING_KEY',
    'CANARY_SIGNING_KEY',
  ];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      errors.push(`Missing required environment variable: ${envVar}`);
    }
  }
  
  // Check staging keys
  const keys = loadStagingSigningKeys();
  if (!keys) {
    errors.push('Failed to load staging signing keys');
  }
  
  // Check admin tokens
  const tokens = loadStagingAdminTokens();
  if (!tokens) {
    errors.push('Failed to load staging admin tokens');
  }
  
  // Check Slack configuration (optional but recommended)
  if (!stagingConfig.slack.staging.botToken) {
    errors.push('Slack bot token not configured (SLACK_STAGING_BOT_TOKEN)');
  }
  
  if (!stagingConfig.slack.staging.signingSecret) {
    errors.push('Slack signing secret not configured (SLACK_STAGING_SIGNING_SECRET)');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get staging deployment info
 */
export function getStagingDeploymentInfo() {
  return {
    environment: 'staging',
    port: stagingConfig.port,
    branch: stagingConfig.releaseTrain.stagingBranch,
    database: stagingConfig.database.path,
    canary: {
      phase: 'off', // Default phase
      slackChannel: stagingConfig.canary.slackChannel,
      successGates: stagingConfig.canary.successGates,
    },
    endpoints: {
      health: `http://localhost:${stagingConfig.port}/health`,
      canaryConfig: `http://localhost:${stagingConfig.port}/canary/config`,
      canaryDashboard: `http://localhost:${stagingConfig.port}/canary/dashboard`,
      jwks: `http://localhost:${stagingConfig.port}/.well-known/jwks.json`,
    },
    validation: validateStagingEnvironment(),
  };
}

/**
 * Initialize staging configuration
 */
export function initStagingConfig() {
  if (process.env.NODE_ENV !== 'staging') {
    throw new Error('Staging configuration can only be loaded in staging environment');
  }
  
  const validation = validateStagingEnvironment();
  if (!validation.valid) {
    console.error('Staging environment validation failed:');
    validation.errors.forEach(error => console.error(`  - ${error}`));
    throw new Error('Invalid staging environment configuration');
  }
  
  console.log('[staging] Configuration loaded successfully');
  console.log(`[staging] Port: ${stagingConfig.port}`);
  console.log(`[staging] Database: ${stagingConfig.database.path}`);
  console.log(`[staging] Slack Channel: ${stagingConfig.canary.slackChannel}`);
  
  return stagingConfig;
}

export default stagingConfig;