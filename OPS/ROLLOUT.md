# Production Rollout & Rollback Playbook

## Pre-Deploy Checklist

Before deploying to production:

- [ ] All tests passing in CI
- [ ] Environment variables validated: `./scripts/validate-env.sh all`
- [ ] Node 22 verified: `node scripts/check-node-version.js`
- [ ] Database migrations tested locally
- [ ] CORS origins updated for production
- [ ] S3/R2 lifecycle policies applied
- [ ] Sweeper cron configured and tested

## Deployment Process

### 1. Deploy Web Verify (Vercel)

```bash
# From main branch with all changes committed
cd apps/web-verify
vercel --prod

# Or via Git push (auto-deploy)
git push origin main
```

### 2. Deploy Backend

```bash
# For Railway/Render/Fly.io
git push production main

# For manual deployment
cd apps/backend
pnpm build
# Copy dist/ to server
# Restart process
```

### 3. Verify Deployment

```bash
# Quick health checks
curl -s -o /dev/null -w "%{http_code}\n" https://verify.getpryvacy.com/
# Expected: 200

curl -s -o /dev/null -w "%{http_code}\n" https://verify.getpryvacy.com/v/test123
# Expected: 200

curl -s https://api.getpryvacy.com/healthz | jq .
# Expected: {"status":"ok","timestamp":"..."}

# Test CORS
curl -sI -H "Origin: https://verify.getpryvacy.com" \
  https://api.getpryvacy.com/verify/start | grep -i access-control-allow-origin
# Expected: access-control-allow-origin: https://verify.getpryvacy.com
```

## Rollback Procedures

### Quick Rollback (< 5 minutes)

#### Option 1: Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select `verifd-web-verify` project
3. Click "Deployments" tab
4. Find last known good deployment
5. Click "..." menu → "Promote to Production"
6. Confirm promotion

#### Option 2: Vercel CLI

```bash
# List recent deployments
vercel list --prod

# Find the deployment URL of last good version
# Example: verifd-web-verify-abc123.vercel.app

# Promote it to production
vercel alias set verifd-web-verify-abc123.vercel.app verify.getpryvacy.com

# Verify
curl -I https://verify.getpryvacy.com/
```

### Backend Rollback

```bash
# For Git-based deployments
git revert HEAD
git push production main

# For Docker deployments
docker pull verifd/backend:previous-tag
docker stop verifd-backend
docker run -d --name verifd-backend verifd/backend:previous-tag

# For PM2
pm2 stop backend
git checkout previous-tag
pnpm install --frozen-lockfile
pnpm build
pm2 start backend
```

### Database Rollback

```bash
# Backup current state first!
cp /var/data/verifd.db /var/data/verifd.db.backup

# Restore from backup
cp /var/data/verifd.db.previous /var/data/verifd.db

# Or revert migration
cd apps/backend
node scripts/rollback-migration.js
```

## Monitoring & Alerts

### Health Check Endpoints

```bash
# Frontend
https://verify.getpryvacy.com/

# Backend
https://api.getpryvacy.com/healthz
https://api.getpryvacy.com/healthz/detailed

# Verify flow
https://api.getpryvacy.com/verify/start (POST)
https://verify.getpryvacy.com/v/[code]
```

### Key Metrics to Monitor

1. **Response Times**
   - `/verify/start` < 200ms
   - `/verify/submit` < 500ms
   - Web page load < 2s

2. **Error Rates**
   - 4xx errors < 5%
   - 5xx errors < 0.1%
   - CORS errors = 0

3. **Business Metrics**
   - Verifications started/hour
   - Verifications completed/hour
   - Voice recordings uploaded/hour

### Uptime Monitoring

Set up monitoring with your preferred service:

```bash
# UptimeRobot / Pingdom / StatusCake
- https://verify.getpryvacy.com/ (every 5 min)
- https://api.getpryvacy.com/healthz (every 5 min)

# Custom health check
curl -X POST https://api.getpryvacy.com/verify/start \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": null}' \
  | jq -e '.code'
```

## Emergency Contacts

- **On-call Engineer**: [rotation schedule]
- **Vercel Support**: support@vercel.com
- **AWS Support**: [console link]
- **Cloudflare Support**: [dashboard link]

## Post-Mortem Template

After any rollback, document:

1. **Timeline**
   - When was issue detected?
   - When was rollback initiated?
   - When was service restored?

2. **Root Cause**
   - What changed?
   - Why did it break?
   - Why wasn't it caught in testing?

3. **Impact**
   - How many users affected?
   - What functionality was broken?
   - Revenue/reputation impact?

4. **Lessons Learned**
   - What could prevent this?
   - What tests were missing?
   - Process improvements needed?

5. **Action Items**
   - [ ] Add missing tests
   - [ ] Update monitoring
   - [ ] Document edge case
   - [ ] Update runbook

## Quick Reference Commands

```bash
# Check current production version
curl -s https://verify.getpryvacy.com/api/version

# Test verify flow end-to-end
./scripts/test-e2e-prod.sh

# View recent errors (if Sentry configured)
sentry-cli releases list --org=verifd

# Check S3/R2 voice uploads
aws s3 ls s3://verifd-voices/voice/ --recursive --summarize

# Manual sweeper trigger
curl -X POST https://api.getpryvacy.com/sweeper/clean \
  -H "x-sweeper-secret: $SWEEPER_SECRET"

# Database backup
sqlite3 /var/data/verifd.db ".backup /var/backups/verifd-$(date +%Y%m%d).db"
```

## Rollout Schedule

Recommended deployment windows:

- **Best**: Tuesday-Thursday, 10am-3pm (lowest traffic)
- **Avoid**: Friday afternoons, weekends, holidays
- **Emergency fixes**: Anytime (follow rollback procedure if issues)

## Success Criteria

Deployment is successful when:

1. All health checks return 200
2. No increase in error rates after 30 minutes
3. Verify flow works end-to-end
4. Voice uploads working (if S3/R2 configured)
5. No CORS errors in browser console
6. Sweeper cron executing successfully

---

**Remember**: It's always better to rollback quickly and investigate offline than to debug in production!