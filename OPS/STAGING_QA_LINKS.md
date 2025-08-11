# 🎯 verifd Staging QA - Central Links Hub

## 📱 Mobile Apps

### Android APK  
- **Latest Build**: [Run #16892943430](https://github.com/Lifeoflunatic/verifd/actions/runs/16892943430)
- **GitHub Release**: [v1.3.0-rc1-staging+5](https://github.com/Lifeoflunatic/verifd/releases/tag/v1.3.0-rc1-staging+5)
- **Direct APK**: [verifd-staging.apk](https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging+5/verifd-staging.apk)
- **SHA256**: `ee94130bcf27bef9237ac894d9979111f1702717e8537c42524155aab943ed4c`
- **QR Code**: [Download QR](https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging+5/qr-verifd-staging.png)

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

---

## 📦 GitHub Release (Stable URLs)

**Release Tag**: v1.3.0-rc1-staging+5
**Created**: 2025-08-11 21:46:11 UTC  
**Build Run**: #16892943430

### Direct Download Links
- **APK**: [verifd-staging.apk](https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging+5/verifd-staging.apk)
- **SHA256**: [apk.sha256](https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging+5/apk.sha256)
- **Metadata**: [apk-metadata.json](https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging+5/apk-metadata.json)
- **QR Code**: [qr-verifd-staging.png](https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging+5/qr-verifd-staging.png)

### Verification
```bash
# Download and verify
wget https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging+5/verifd-staging.apk
wget https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging+5/apk.sha256
sha256sum -c apk.sha256
```

**SHA256**: `ee94130bcf27bef9237ac894d9979111f1702717e8537c42524155aab943ed4c`

---

**Last Updated**: 2025-08-11  
**Environment**: Staging  
**Ready For**: QA Testing