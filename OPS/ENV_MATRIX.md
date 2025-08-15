# Environment Variables Matrix

## Overview

Complete list of environment variables required for each service across development, preview, and production environments.

## Web Verify (Next.js)

| Variable | Development | Preview | Production | Required | Description |
|----------|------------|---------|------------|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3002` | `https://api-preview.getpryvacy.com` | `https://api.getpryvacy.com` | ✅ | Backend API endpoint |
| `SENTRY_DSN` | - | `https://...@sentry.io/...` | `https://...@sentry.io/...` | ❌ | Error tracking |
| `NEXT_PUBLIC_GA_ID` | - | - | `G-XXXXXXXXXX` | ❌ | Google Analytics |

## Backend (Fastify)

### Core Configuration

| Variable | Development | Preview | Production | Required | Description |
|----------|------------|---------|------------|----------|-------------|
| `PORT` | `3002` | `3002` | `3002` | ✅ | Server port |
| `NODE_ENV` | `development` | `preview` | `production` | ✅ | Environment mode |
| `LOG_LEVEL` | `debug` | `info` | `warn` | ✅ | Logging verbosity |
| `DATABASE_URL` | `./data/verifd.db` | `./data/verifd.db` | `/var/data/verifd.db` | ✅ | SQLite path |

### Security & Auth

| Variable | Development | Preview | Production | Required | Description |
|----------|------------|---------|------------|----------|-------------|
| `JWT_SECRET` | `dev-secret-change-me` | `preview-[random]` | `prod-[random-64]` | ✅ | JWT signing key |
| `SWEEPER_SECRET` | `dev-sweeper` | `preview-[random]` | `prod-[random-32]` | ✅ | Cron auth token |
| `CRON_SECRET` | - | `vercel-[random]` | `vercel-[random]` | ❌ | Vercel cron auth |

### CORS Configuration

| Variable | Development | Preview | Production | Required | Description |
|----------|------------|---------|------------|----------|-------------|
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:3001` | `https://verifd-web-verify-*.vercel.app` | `https://verify.getpryvacy.com` | ✅ | Comma-separated origins |
| `VERIFY_DOMAIN` | `localhost:3000` | `verifd-web-verify-*.vercel.app` | `verify.getpryvacy.com` | ✅ | Primary domain |
| `VERIFY_PREVIEW_DOMAIN` | - | `verifd-web-verify-*.vercel.app` | - | ❌ | Preview domains |

### Object Storage (S3/R2)

| Variable | Development | Preview | Production | Required | Description |
|----------|------------|---------|------------|----------|-------------|
| `AWS_REGION` | - | `us-east-1` | `us-east-1` | ❌* | S3 region |
| `AWS_ACCESS_KEY_ID` | - | `<AWS_ACCESS_KEY_ID>` | `<AWS_ACCESS_KEY_ID>` | ❌* | AWS/R2 access key |
| `AWS_SECRET_ACCESS_KEY` | - | `...` | `...` | ❌* | AWS/R2 secret |
| `S3_BUCKET_NAME` | - | `verifd-voices-preview` | `verifd-voices` | ❌* | S3 bucket |
| `S3_PUBLIC_DOMAIN` | - | `https://....s3.amazonaws.com` | `https://voices.getpryvacy.com` | ❌* | CDN/public URL |
| `R2_ENDPOINT` | - | `https://....r2.cloudflarestorage.com` | `https://....r2.cloudflarestorage.com` | ❌* | R2 endpoint |
| `R2_BUCKET_NAME` | - | `verifd-voices-preview` | `verifd-voices` | ❌* | R2 bucket |

*Required if voice recording is enabled

### URLs & Domains

| Variable | Development | Preview | Production | Required | Description |
|----------|------------|---------|------------|----------|-------------|
| `API_BASE_URL` | `http://localhost:3002` | `https://api-preview.getpryvacy.com` | `https://api.getpryvacy.com` | ✅ | Self URL |
| `VERIFY_BASE_URL` | `http://localhost:3000` | `https://verifd-web-verify-*.vercel.app` | `https://verify.getpryvacy.com` | ✅ | Web verify URL |
| `BACKEND_URL` | - | `https://api-preview.getpryvacy.com` | `https://api.getpryvacy.com` | ❌ | For cron jobs |

## CI/CD Secrets (GitHub Actions)

| Secret | Description | Required |
|--------|-------------|----------|
| `VERCEL_TOKEN` | Vercel deployment token | ✅ |
| `VERCEL_ORG_ID` | Vercel organization ID | ✅ |
| `VERCEL_PROJECT_ID` | Vercel project ID | ✅ |
| `SENTRY_AUTH_TOKEN` | Sentry release tracking | ❌ |

## Validation Script

Save as `scripts/validate-env.sh`:

```bash
#!/bin/bash

# Validate required environment variables

REQUIRED_BACKEND=(
  "PORT"
  "NODE_ENV"
  "DATABASE_URL"
  "JWT_SECRET"
  "SWEEPER_SECRET"
  "CORS_ALLOWED_ORIGINS"
  "API_BASE_URL"
  "VERIFY_BASE_URL"
)

REQUIRED_WEB=(
  "NEXT_PUBLIC_API_BASE_URL"
)

# Check backend vars
if [[ "$1" == "backend" ]]; then
  for var in "${REQUIRED_BACKEND[@]}"; do
    if [[ -z "${!var}" ]]; then
      echo "❌ Missing required: $var"
      exit 1
    fi
  done
  echo "✅ All backend vars present"
fi

# Check web vars
if [[ "$1" == "web" ]]; then
  for var in "${REQUIRED_WEB[@]}"; do
    if [[ -z "${!var}" ]]; then
      echo "❌ Missing required: $var"
      exit 1
    fi
  done
  echo "✅ All web vars present"
fi
```

## Security Notes

1. **Never commit `.env` files** - Use `.env.example` as template
2. **Rotate secrets quarterly** - Especially JWT_SECRET and SWEEPER_SECRET
3. **Use strong secrets** - Minimum 32 characters, generated with:
   ```bash
   openssl rand -base64 32
   ```
4. **Separate environments** - Never reuse production secrets in dev/preview
5. **Audit access logs** - Monitor for unauthorized sweeper/cron calls

## Quick Setup

### Development
```bash
# Backend
cd apps/backend
cp .env.example .env
# Edit .env with dev values

# Web
cd apps/web-verify
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:3002" > .env.local
```

### Production (Vercel)
```bash
# Set via Vercel CLI
vercel env add NEXT_PUBLIC_API_BASE_URL production
vercel env add SWEEPER_SECRET production
# ... etc
```

### Validation
```bash
# In CI or before deploy
source .env
./scripts/validate-env.sh backend
./scripts/validate-env.sh web
```