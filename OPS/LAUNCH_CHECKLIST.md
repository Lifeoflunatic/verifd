# 🚀 verifd Launch Checklist

## ✅ Infrastructure

- [x] **Domains**: `verify.getpryvacy.com` configured on Vercel
- [x] **Node 22**: Enforced via `.nvmrc`, package.json engines, CI
- [x] **Monorepo**: pnpm workspaces, turbo build system
- [x] **CI/CD**: GitHub Actions with Node 22, security checks

## ✅ Backend

- [x] **Endpoints**:
  - `POST /verify/start` - Create verification
  - `GET /verify/:code` - Check status  
  - `POST /verify/submit` - Submit verification
  - `GET /pass/check` - Check pass status
  - `POST /upload/voice` - Direct upload
  - `POST /upload/presigned` - S3/R2 presigned URLs
  - `POST /sweeper/clean` - Cleanup cron
  - `GET /healthz` - Health check

- [x] **Security**:
  - Helmet with `crossOriginResourcePolicy: false`
  - Rate limits: Global 100/min, route-specific on `/verify/start`
  - SWEEPER_SECRET for cron auth
  - JWT_SECRET for tokens

- [x] **CORS**: Dynamic allow-list supporting:
  - Production: `https://verify.getpryvacy.com`
  - Preview: `https://verifd-web-verify-*.vercel.app`
  - Development: `http://localhost:3000`

- [x] **Database**: SQLite with migrations, 15-min verify expiry

## ✅ Frontend

- [x] **Routes**:
  - `/` - Landing page
  - `/v/[code]` - Dynamic verify page

- [x] **Components**:
  - VerifyView with form validation
  - VoiceRecorder with privacy consent
  - Error/success states

- [x] **Privacy**:
  - One-time consent dialog
  - localStorage persistence
  - Clear privacy copy
  - Works without voice (optional)

## ✅ Storage (S3/R2)

- [x] **Configuration**: Docs at `docs/OBJECT_STORAGE.md`
- [x] **Lifecycle**: 24-hour auto-deletion on `voice/` prefix
- [x] **CORS**: Strict origins for PUT/POST
- [x] **Fallback**: Local upload if S3/R2 not configured

## ✅ Monitoring & Operations

- [x] **Health Checks**: 
  - `/healthz` endpoint (200 OK)
  - `/healthz/detailed` with dependency status

- [x] **Cron Jobs**:
  - Sweeper endpoint with secret auth
  - Vercel cron configuration example
  - Cleanup expired verifications + 30-day passes

- [x] **Documentation**:
  - `OPS/ENV_MATRIX.md` - Environment variables
  - `OPS/ROLLOUT.md` - Deployment & rollback
  - `docs/NODE22_SETUP.md` - Node version guide
  - `docs/OBJECT_STORAGE.md` - S3/R2 setup

- [x] **Scripts**:
  - `scripts/check-node-version.js` - Node 22 enforcement
  - `scripts/validate-env.sh` - Environment validation
  - `scripts/s3_lifecycle_cors.sh` - Storage setup

## 🔍 Verification Commands

```bash
# 1. Check production URLs
curl -s -o /dev/null -w "%{http_code}\n" https://verify.getpryvacy.com/
# Expected: 200

curl -s -o /dev/null -w "%{http_code}\n" https://verify.getpryvacy.com/v/test123
# Expected: 200

# 2. Check backend health
curl -s https://api.getpryvacy.com/healthz
# Expected: {"status":"ok","timestamp":"..."}

# 3. Test CORS headers
curl -sI -H "Origin: https://verify.getpryvacy.com" \
  https://api.getpryvacy.com/verify/start | grep -i access-control
# Expected: access-control-allow-origin header present

# 4. Test verify flow
curl -X POST https://api.getpryvacy.com/verify/start \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": null}'
# Expected: {"code":"...","verifyUrl":"...","expiresIn":900}
```

## 🚦 Go/No-Go Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Domains** | ✅ Ready | verify.getpryvacy.com live |
| **Backend API** | ✅ Ready | All endpoints implemented |
| **Frontend** | ✅ Ready | Deployed on Vercel |
| **CORS** | ✅ Ready | Dynamic configuration |
| **Storage** | ⚠️ Optional | Configure S3/R2 for production |
| **Cron** | ⚠️ Configure | Set SWEEPER_SECRET and schedule |
| **Monitoring** | ⚠️ Optional | Add uptime checks |
| **Node 22** | ✅ Ready | Enforced everywhere |

## 🎯 Final Steps for Production

1. **Configure S3/R2** (if using voice):
   ```bash
   ./scripts/s3_lifecycle_cors.sh
   ```

2. **Set production secrets**:
   ```bash
   vercel env add SWEEPER_SECRET production
   vercel env add JWT_SECRET production
   ```

3. **Enable cron sweeper**:
   - Set up Vercel cron or external scheduler
   - Test with: `curl -X POST .../sweeper/clean -H "x-sweeper-secret: ..."`

4. **Add monitoring**:
   - UptimeRobot/Pingdom on `/healthz`
   - Sentry DSN for error tracking

5. **Test end-to-end**:
   - Create verification
   - Submit with voice
   - Check pass status
   - Wait for expiry

## 📋 Post-Launch

- [ ] Monitor error rates for 24 hours
- [ ] Check sweeper cron execution logs
- [ ] Verify S3/R2 lifecycle deletion
- [ ] Review any CORS errors
- [ ] Document any edge cases found

---

**Ship it! 🚀** The MVP is production-ready. Voice storage and cron are optional but recommended for full functionality.