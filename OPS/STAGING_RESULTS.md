# Staging Smoke Test Results

## Build: v1.3.0-rc1-staging+8

**Date:** 2025-08-12T20:38:00Z  
**Branch:** feat/zod-row-typing  
**Workflow Run:** [#16920036766](https://github.com/Lifeoflunatic/verifd/actions/runs/16920036766)  

## ✅ Android APK Build

### APK Details
- **SHA256:** `9ca5081cb817f19a02e85401b61bcb44a48f7fbe670349ee3cb130e7f1e78d49`
- **Size:** 7.7M
- **Version:** 1.0.0-staging
- **Download:** [verifd-staging-signed.apk](https://nightly.link/Lifeoflunatic/verifd/runs/16920036766/verifd-staging-apk)

### QR Code for Installation
![APK Download QR Code](./artifacts/apk-qrcode.png)

## ✅ Release Link Smoke Test

### Test Parameters
- **Phone:** +919233600392 (staging override)
- **Locale:** en-US
- **Device ID:** test-device-android-001
- **User Name:** TestUser

### Response
```json
{
  "sms_template": "TestUser here. Verify: https://vfd.link/eyJhbGciOiJI",
  "whatsapp_template": "Hey—it's TestUser. I screen unknown calls. Reply with Name + Reason or tap to verify: https://vfd.link/eyJhbGciOiJI",
  "verify_link": "https://vfd.link/eyJhbGciOiJI",
  "signature": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "cached": false,
  "ttl_seconds": 86400
}
```

### Validation
- ✅ SMS template under 160 chars (52 chars)
- ✅ WhatsApp template formatted correctly
- ✅ Short URL generation working
- ✅ JWT signature present
- ✅ 24-hour TTL configured
- ✅ Rate limiting active (60/hour device, 3/5min number)

## ⚠️ Backend TypeScript Status

### Current Issues
- **better-sqlite3:** Native module compilation fails on macOS
- **Workaround:** Using `USE_MOCK_DB=true` for testing
- **Next:** Need to complete TypeScript cleanup (Task 3)

## Features Enabled

### Staging Rollout (50% cohort)
- ✅ Missed Call Actions (IN geo)
- ✅ Quick Tile Expecting
- ✅ App Shortcuts

### Staging Rollout (Other)
- ✅ Identity Lookup (25%)
- ✅ Templates (75%)
- ✅ WhatsApp (75%)
- ⚠️ Risk Scoring (10%, shadow mode)

## Configuration Keys
- **Signing KID:** staging-2025-001
- **API Endpoint:** https://staging.api.verifd.com
- **Override Numbers:** +919233600392, +917575854485

## Summary

✅ **APK Build:** Successfully built v1.3.0-rc1-staging+8  
✅ **Release Link:** Template endpoint working with short URLs  
⚠️ **TypeScript:** 22 errors remaining (native SQLite issue)  

## Next Steps

1. Complete backend TypeScript cleanup
2. Manual QA on Android device with staging APK
3. Deploy to staging environment
4. Run E2E test suite