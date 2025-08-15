/**
 * Dynamic CORS configuration
 * Supports environment-based allow-lists and pattern matching
 */

export interface CorsConfig {
  origins: string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
}

/**
 * Parse CORS origins from environment variable
 * Supports comma-separated lists and wildcards
 */
export function parseCorsOrigins(envVar?: string): string[] {
  const defaults = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002'
  ];

  if (!envVar) {
    return defaults;
  }

  // Parse comma-separated origins
  const origins = envVar
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  // Always include localhost in development
  if (process.env.NODE_ENV === 'development') {
    return [...new Set([...defaults, ...origins])];
  }

  return origins;
}

/**
 * Create CORS configuration from environment
 */
export function getCorsConfig(): CorsConfig {
  // Parse allowed origins from environment
  // Support both CORS_ALLOWED_ORIGINS and CORS_ORIGINS for compatibility
  const corsEnv = process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS;
  const origins = parseCorsOrigins(corsEnv);
  
  // Add production domains if configured
  if (process.env.VERIFY_DOMAIN) {
    origins.push(`https://${process.env.VERIFY_DOMAIN}`);
  }
  
  if (process.env.VERIFY_PREVIEW_DOMAIN) {
    // Support Vercel preview deployments
    origins.push(`https://${process.env.VERIFY_PREVIEW_DOMAIN}`);
    origins.push(`https://*.vercel.app`);
  }

  return {
    origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-sweeper-secret']
  };
}

/**
 * Check if an origin is allowed
 * Supports exact matches and wildcard patterns
 */
export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  // Check exact matches
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Check wildcard patterns
  for (const pattern of allowedOrigins) {
    if (pattern.includes('*')) {
      // Convert wildcard pattern to regex
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\./g, '\\.') + '$'
      );
      if (regex.test(origin)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Dynamic CORS origin function for Fastify
 */
export function corsOriginFunction(origin: string, callback: (err: Error | null, allow: boolean) => void) {
  const corsConfig = getCorsConfig();
  const allowed = isOriginAllowed(origin, corsConfig.origins);
  
  // Log rejected origins in development
  if (!allowed && process.env.NODE_ENV === 'development') {
    console.warn(`CORS: Rejected origin ${origin}`);
  }
  
  callback(null, allowed);
}