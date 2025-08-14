/**
 * Web-Verify Configuration
 * Handles environment-specific settings and API endpoints
 */

export interface WebVerifyConfig {
  apiBaseUrl: string;
  environment: 'development' | 'staging' | 'production';
  isStaging: boolean;
  isDevelopment: boolean;
}

/**
 * Get configuration based on environment
 */
function getConfig(): WebVerifyConfig {
  // Check if we're in a browser environment
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  
  // For staging builds, always pin to staging API regardless of NODE_ENV
  const isStaging = process.env.NEXT_PUBLIC_FORCE_STAGING === 'true' || 
                   process.env.VERCEL_ENV === 'preview' ||
                   (typeof window !== 'undefined' && window.location.hostname.includes('staging'));

  let apiBaseUrl: string;
  let environment: 'development' | 'staging' | 'production';

  if (isStaging) {
    // Always use staging API for staging environment
    apiBaseUrl = 'https://staging.api.verifd.com';
    environment = 'staging';
  } else if (isDevelopment) {
    // Use local development API or override
    apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
    environment = 'development';
  } else {
    // Production
    apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.verifd.com';
    environment = 'production';
  }

  return {
    apiBaseUrl,
    environment,
    isStaging,
    isDevelopment
  };
}

export const config = getConfig();

// Export individual values for convenience
export const { apiBaseUrl, environment, isStaging, isDevelopment } = config;

/**
 * Get API endpoint with base URL
 */
export function getApiEndpoint(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl}${cleanPath}`;
}

/**
 * Environment labels for UI display
 */
export const ENVIRONMENT_LABELS = {
  development: 'DEV',
  staging: 'STAGING', 
  production: ''
} as const;

/**
 * Get environment badge configuration
 */
export function getEnvironmentBadge() {
  const label = ENVIRONMENT_LABELS[environment];
  
  if (!label) return null;

  return {
    label,
    className: environment === 'staging' 
      ? 'bg-orange-100 text-orange-800 border-orange-300'
      : 'bg-blue-100 text-blue-800 border-blue-300'
  };
}