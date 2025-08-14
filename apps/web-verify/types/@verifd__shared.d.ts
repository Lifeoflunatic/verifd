// Type declaration for @verifd/shared workspace package
// This prevents type-check hard fails if the path resolution changes
declare module '@verifd/shared' {
  export interface PassCheckResponse {
    allowed: boolean;
    scope?: '30m' | '24h' | '30d';
    expires_at?: string; // ISO8601 format
  }
  
  // Export other types as needed
  export * from '../../packages/shared/src/types/index';
}