// Time utilities

/**
 * Get Unix timestamp (seconds)
 */
export function getUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Check if timestamp has expired
 */
export function isExpired(expiresAt: number): boolean {
  return expiresAt < getUnixTimestamp();
}

/**
 * Format remaining time in human-readable format
 */
export function formatTimeRemaining(expiresAt: number): string {
  const now = getUnixTimestamp();
  const remaining = expiresAt - now;
  
  if (remaining <= 0) return 'Expired';
  
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  
  if (minutes > 0) {
    return `${minutes} minutes`;
  }
  
  return 'Less than a minute';
}

/**
 * Get expiry timestamp for hours from now
 */
export function getExpiryTimestamp(hours: number): number {
  return getUnixTimestamp() + (hours * 3600);
}

/**
 * Format Unix timestamp to ISO string
 */
export function timestampToISO(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

/**
 * Parse ISO string to Unix timestamp
 */
export function isoToTimestamp(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}