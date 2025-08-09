import { createHash } from 'crypto';

/**
 * Privacy-first logging utilities
 * Hashes sensitive data like phone numbers before logging
 */

/**
 * Hash a phone number for privacy-safe logging
 * Uses SHA-256 with a prefix for easy identification in logs
 */
export function hashPhoneNumber(phoneNumber: string): string {
  const hash = createHash('sha256').update(phoneNumber).digest('hex');
  return `ph_${hash.substring(0, 16)}`;
}

/**
 * Privacy-safe logger that automatically hashes phone numbers
 */
export class PrivacyLogger {
  /**
   * Log with automatic phone number hashing
   * Replaces any E.164 formatted numbers in the message with their hash
   */
  static info(message: string): void {
    const sanitized = this.sanitizeMessage(message);
    console.log(`[INFO] ${sanitized}`);
  }

  static error(message: string, error?: any): void {
    const sanitized = this.sanitizeMessage(message);
    console.error(`[ERROR] ${sanitized}`, error);
  }

  static warn(message: string): void {
    const sanitized = this.sanitizeMessage(message);
    console.warn(`[WARN] ${sanitized}`);
  }

  static debug(message: string): void {
    const sanitized = this.sanitizeMessage(message);
    console.debug(`[DEBUG] ${sanitized}`);
  }

  /**
   * Sanitize a message by replacing phone numbers with their hashes
   */
  private static sanitizeMessage(message: string): string {
    // Replace E.164 formatted phone numbers with hashes
    return message.replace(/\+[1-9]\d{1,14}/g, (phoneNumber) => {
      return hashPhoneNumber(phoneNumber);
    });
  }

  /**
   * Create a sanitized object for logging that hashes phone number fields
   */
  static sanitizeObject(obj: Record<string, any>): Record<string, any> {
    const sanitized = { ...obj };
    
    // Common phone number field names to hash
    const phoneFields = ['number_e164', 'fromNumber', 'toNumber', 'phone_number', 'phoneNumber'];
    
    for (const field of phoneFields) {
      if (sanitized[field] && typeof sanitized[field] === 'string') {
        sanitized[field] = hashPhoneNumber(sanitized[field]);
      }
    }

    return sanitized;
  }
}