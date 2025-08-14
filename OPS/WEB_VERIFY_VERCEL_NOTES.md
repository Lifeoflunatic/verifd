# Vercel Build Configuration for web-verify (Monorepo)

## Summary
This document outlines the required configuration for deploying the web-verify Next.js app to Vercel from a pnpm monorepo using workspace packages.

## Key Configuration Changes

### 1. next.config.js
Add `transpilePackages` to ensure Vercel can process workspace packages:
```javascript
const nextConfig = {
  transpilePackages: ['@verifd/shared'],
  // ... other config
};
```

### 2. tsconfig.json
Configure TypeScript path mapping and compilation options:
```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@verifd/shared": ["../../packages/shared/src/index.ts"]
    }
    // ... other options
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    "types/**/*.d.ts",  // Important: Include type declaration stubs
    ".next/types/**/*.ts"
  ]
}
```

### 3. Type Declaration Fallback
Create `apps/web-verify/types/@verifd__shared.d.ts` as a fallback:
```typescript
declare module '@verifd/shared' {
  export interface PassCheckResponse {
    allowed: boolean;
    scope?: '30m' | '24h' | '30d';
    expires_at?: string;
  }
  // Export other types as needed
}
```

## Common Gotchas

1. **Workspace Resolution**: Vercel doesn't automatically resolve pnpm workspace packages. The `transpilePackages` config is essential.

2. **TypeScript Paths**: The `paths` mapping in tsconfig.json helps TypeScript resolve the imports during type checking.

3. **Include Array**: The `include` array in tsconfig.json MUST include `"types/**/*.d.ts"` to ensure type declaration stubs are picked up.

4. **Module Resolution**: Use `"moduleResolution": "bundler"` for Next.js 14+ (recommended over "node").

5. **Import Paths**: Avoid subpath imports like `@verifd/shared/constants` unless properly configured. Use main package exports instead.

6. **Build vs Runtime**: The configuration fixes build-time resolution. Runtime issues (like useSearchParams) are separate concerns.

## Vercel Deployment Settings

When deploying to Vercel:
1. Set Root Directory: `apps/web-verify`
2. Build Command: `pnpm build` or `cd ../.. && pnpm --filter=web-verify build`
3. Output Directory: `.next`
4. Install Command: `pnpm install --frozen-lockfile`

## Testing Locally

Before deploying to Vercel:
```bash
cd apps/web-verify
pnpm build
pnpm start
```

If the build succeeds locally with these configurations, it should work on Vercel.

## Related Files
- `/apps/web-verify/next.config.js` - Next.js configuration
- `/apps/web-verify/tsconfig.json` - TypeScript configuration
- `/apps/web-verify/types/@verifd__shared.d.ts` - Type declarations
- `/packages/shared/src/index.ts` - Shared package exports