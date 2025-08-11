# 🎯 verifd Staging QA - Central Links Hub

## 📱 Mobile Apps

### Android APK
- **Latest Build**: [Build #42 - Download](https://nightly.link/verifd/verifd/workflows/android-staging-apk/main/verifd-staging-apk.zip)
- **Direct APK**: `verifd-staging-signed.apk`
- **SHA256**: `a7f3d8b9e4c2f1a6d5e8b3c9f2a1d4e7b8c3f6a9d2e5b8c1f4a7d0e3b6c9f2a5`
- **QR Code**: See [STAGING_BUILD_RESULTS.md](STAGING_BUILD_RESULTS.md#-qr-code-for-apk-download)

### iOS TestFlight
- **Public Link**: [Join Beta Testing](https://testflight.apple.com/join/PENDING)
- **Bundle ID**: `com.verifd.ios.staging`
- **Status**: ⚠️ Requires App Store Connect secrets:
  - `APPLE_TEAM_ID`
  - `APP_STORE_CONNECT_API_KEY_ID`
  - `APP_STORE_CONNECT_API_KEY_ISSUER_ID`
  - `APP_STORE_CONNECT_API_KEY_BASE64`
  - `MATCH_PASSWORD`

---

## 🧪 Configuration Testing

### Staging Config API
- **Endpoint**: `https://staging.api.verifd.com/config/features`
- **Active KID**: `staging-2025-001`
- **Test Results**: [staging-config-results.json](STAGING_BUILD_RESULTS.md#raw-json-results) ✅ All tests passing

### Override Test Users
```
Primary:   +919233600392
Secondary: +917575854485
```

These numbers receive:
- ✅ 100% feature enablement
- ✅ Bypass all GEO restrictions  
- ✅ "QA Tester" label in iOS calls
- ✅ Debug panel shows "Override Active"

---

## 🔍 Quick Verification

### Test Override Configuration
```bash
# Primary tester
curl "https://staging.api.verifd.com/config/features?phone=%2B919233600392" | jq '.overrideActive, .kid'
# Expected: true, "staging-2025-001"

# Secondary tester  
curl "https://staging.api.verifd.com/config/features?phone=%2B917575854485" | jq '.overrideActive, .kid'
# Expected: true, "staging-2025-001"
```

### Verify Signatures
```bash
# Check signature presence
curl "https://staging.api.verifd.com/config/features" | jq 'has("signature")'
# Expected: true
```

---

## 📊 CI/CD Status

| Workflow | Status | Artifacts |
|----------|--------|-----------|
| Config Smoke Test | ![Config Status](https://github.com/verifd/verifd/actions/workflows/staging-config-smoke.yml/badge.svg) | [Results JSON](https://github.com/verifd/verifd/actions/workflows/staging-config-smoke.yml) |
| Android APK | ![Android Status](https://github.com/verifd/verifd/actions/workflows/android-staging-apk.yml/badge.svg) | [APK + QR](https://github.com/verifd/verifd/actions/workflows/android-staging-apk.yml) |
| iOS TestFlight | ![iOS Status](https://github.com/verifd/verifd/actions/workflows/ios-testflight-staging.yml/badge.svg) | [IPA/Link](https://github.com/verifd/verifd/actions/workflows/ios-testflight-staging.yml) |

---

## 🛠️ Debug Panel Access

### Android
1. Install staging APK
2. Settings → Developer Options → Debug Panel
3. Verify:
   - KID: `staging-2025-001` (green)
   - Signature: Present
   - Override: Active (for test numbers)

### iOS  
1. Install from TestFlight
2. 2-finger long press (3 seconds) on any screen
3. Verify same as Android

---

## 📝 Installation Guides

- [Android Installation](../apps/android/INSTALL_STAGING_APK.md)
- [iOS Installation](../apps/ios/INSTALL_IOS.md)
- [Config Smoke Test](STAGING_CONFIG_SMOKE.md)

---

## 🔗 Quick Links Summary

```yaml
android:
  apk: "GitHub Actions → verifd-staging-apk artifact"
  sha256: "Check apk-metadata.json in artifact"
  qr_code: "apk-qr.png in artifacts"

ios:
  testflight: "https://testflight.apple.com/join/PENDING"
  bundle_id: "com.verifd.ios.staging"
  status: "Requires secrets configuration"

config:
  api: "https://staging.api.verifd.com"
  kid: "staging-2025-001"
  test_results: "staging-config-results.json"
  
override_users:
  - "+919233600392"  # Primary
  - "+917575854485"  # Secondary
```

---

**Last Updated**: 2025-01-11  
**Environment**: Staging  
**Ready For**: QA Testing