import { IDENTITY_PING_TEMPLATE } from '../constants.js';
import { IdentityPingTemplate } from '../types/index.js';

/**
 * Generate Identity Ping SMS message
 */
export function generateIdentityPingSMS(template: IdentityPingTemplate): string {
  let message = IDENTITY_PING_TEMPLATE;
  
  // Replace template variables
  message = message.replace('{{recipientName}}', template.name || 'there');
  message = message.replace('{{senderName}}', template.name);
  message = message.replace('{{reason}}', template.reason);
  message = message.replace('{{expiryMinutes}}', template.expiryMinutes.toString());
  message = message.replace('{{verifyUrl}}', template.verifyUrl);
  
  return message;
}

/**
 * Truncate message to SMS character limit
 */
export function truncateSMS(message: string, maxLength = 160): string {
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength - 3) + '...';
}

/**
 * Count SMS segments needed
 */
export function countSMSSegments(message: string): number {
  const length = message.length;
  
  if (length <= 160) return 1;
  
  // For concatenated SMS, each segment is 153 characters
  return Math.ceil(length / 153);
}

/**
 * Validate SMS content (no special characters that might break)
 */
export function isValidSMSContent(message: string): boolean {
  // Allow basic ASCII and common Unicode
  // Exclude control characters
  const invalidChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
  return !invalidChars.test(message);
}