# Render Backend Deployment Checklist

## Prerequisites
✅ render.yaml configured with pnpm activation
✅ Backend build and start scripts tested locally
✅ Environment variables documented in .env.example

## Deployment Steps

### 1. Create from Blueprint
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Blueprint**
3. Connect your GitHub repository
4. Select the `main` branch
5. Service should appear as `verifd-backend` (Free plan)
6. Click **Create & Deploy**

### 2. Add Environment Variables
Go to **Service** → **Environment** and add:

```env
# S3/R2 Storage
S3_COMPAT_ENDPOINT=https://d753c32a10fa7b9b0269032f3c86405e.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=verifd-voice
AWS_ACCESS_KEY_ID=56fe8a2d99a5b061289cddef08d27a13
AWS_SECRET_ACCESS_KEY=c83ba1b0bea4c488221d367c92c66aa7a846f927f8722688cdf38e955b583389
PUBLIC_CDN_BASE=https://pub-5d94bbfe116043ec8464291e992a034f.r2.dev/verifd-voice

# CORS Configuration
CORS_ALLOWED_ORIGINS=https://verify.getpryvacy.com,https://verifd-web-verify-*.vercel.app

# Security
SWEEPER_SECRET=c83ba1b0bea4c488221d367c92c66aa7a846f927f8722688cdf38e955b583389

# Server
PORT=3002
NODE_ENV=production
```

### 3. Verify Deployment
Once deployed, check:
- Health endpoint: `https://verifd-backend.onrender.com/healthz`
- Should return: `{"status":"ok","timestamp":"..."}`

## Troubleshooting

### If "pnpm: command not found" error
Already fixed in render.yaml - build command includes:
```bash
corepack enable && corepack prepare pnpm@9 --activate
```

### If database errors
- SQLite database will be created automatically in production
- For production, consider migrating to PostgreSQL

### If CORS errors
- Backend supports both `CORS_ALLOWED_ORIGINS` and `CORS_ORIGINS`
- Wildcard patterns are supported (e.g., `*.vercel.app`)

## Notes
- Backend respects PORT environment variable (default 3000)
- Health check path is `/healthz`
- Auto-deploy is enabled for the main branch
- Using Node.js v22 as specified in render.yaml