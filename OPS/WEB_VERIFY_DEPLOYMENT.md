# Web-Verify Deployment Configuration

## Overview
The web-verify Next.js app is deployed to Vercel using a monorepo-root deployment strategy with pnpm workspace filters.

## Key Configuration

### 1. Deploy from Monorepo Root
- **NEVER** set Root Directory in Vercel dashboard
- Deploy from `/` (repository root)
- Use pnpm filters in build commands to target specific packages

### 2. Package Naming Convention
```json
// apps/web-verify/package.json
{
  "name": "@verifd/web-verify"  // Must match pnpm filter exactly
}
```

### 3. Root vercel.json
```json
{
  "installCommand": "pnpm install",
  "buildCommand": "pnpm --filter @verifd/shared build && pnpm --filter @verifd/web-verify build",
  "framework": "nextjs"
  // Note: No outputDirectory - let Vercel Next.js integration manage .next location
}
```

### 4. Framework Detection Workaround
```json
// Root package.json
{
  "devDependencies": {
    "next": "^14.2.5"  // Required for Vercel to detect Next.js in monorepo
  }
}
```

## Why This Configuration?

### Framework Detection Order
1. Vercel uploads files
2. Detects framework (looks for Next.js in root package.json)
3. Applies configuration (vercel.json, dashboard settings)
4. Runs build

**Problem**: Step 2 happens BEFORE step 3, so Vercel can't find Next.js in subdirectories.

### Solution Components
- **Root Next.js dependency**: Forces framework detection
- **Empty Root Directory**: Prevents path doubling (apps/web-verify/apps/web-verify)
- **pnpm filters**: Targets specific workspace packages for building
- **No outputDirectory**: Lets Vercel's Next.js integration handle build output location

## CI/CD Pipeline

### Build Validation
The CI workflow (`web-verify-smoke.yml`) ensures:
1. Shared package builds successfully
2. Web-verify app builds successfully
3. Next.js route table contains required routes:
   - `/` (home page)
   - `/v/[code]` (dynamic verification route)

### Post-Deploy Checks
After deployment to main:
1. Hash URL health checks (if VERCEL_DEPLOYMENT_URL secret is set)
2. Custom domain health checks (verify.getpryvacy.com)
3. Expected HTTP status codes:
   - `GET /` → 200
   - `GET /v/test123` → 200
   - `GET /does-not-exist` → 404

## Vercel Dashboard Settings

### Required Configuration
- **Team**: kingsizedmx-gmailcoms-projects
- **Project**: verifd-web-verify
- **Root Directory**: (leave empty)
- **Framework Preset**: Next.js
- **Install Command**: `pnpm install`
- **Build Command**: `pnpm --filter @verifd/shared build && pnpm --filter @verifd/web-verify build`
- **Output Directory**: (leave as default)
- **Node.js Version**: 22.x
- **Deployment Protection**: Disabled (for public access and curl checks)

### Custom Domain
- Production alias: verify.getpryvacy.com
- Automatic HTTPS with Vercel certificates

## Common Issues & Solutions

### Issue: "No Next.js version detected"
**Solution**: Ensure Next.js is in root package.json devDependencies

### Issue: "Unsupported URL Type 'workspace:'"
**Solution**: Use `pnpm install` in Install Command (not npm/yarn)

### Issue: "No projects matched the filters"
**Solution**: Ensure package name matches pnpm filter exactly (@verifd/web-verify)

### Issue: Path doubling (apps/web-verify/apps/web-verify)
**Solution**: Clear Root Directory in Vercel dashboard

## Maintenance Notes

### Future Improvements
Once Vercel improves monorepo framework detection:
1. Remove Next.js from root devDependencies
2. Test deployment still works
3. Update this documentation

### Monitoring
- Check deployment logs for Next.js route table
- Verify x-powered-by: Next.js header in responses
- Monitor build times and caching behavior

## References
- [Vercel Monorepo Documentation](https://vercel.com/docs/monorepos)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs)