# Nightly.link 404 Fix Summary

## Problem
Nightly.link was returning 404 errors for all artifact URLs because it can only fetch artifacts from public repositories that it can see publicly.

## Solution Implemented

### 1. Published Stable GitHub Release (v1.3.0-rc1-staging+9)
- Created GitHub Release with APK as a stable asset
- Generated QR code for easy mobile download  
- Updated OPS/STAGING_QA_LINKS.md with stable URLs

**Release URLs:**
- APK: https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging+9/verifd-staging.apk
- QR Code: https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging+9/qr-verifd-staging.png
- SHA256: https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging+9/apk.sha256

### 2. Updated CI Workflow (android-staging-apk.yml)
- Added automatic GitHub Release creation for staging builds
- Standardized artifact naming to `verifd-staging.apk`
- Added QR code generation using qrencode/qrcode
- Automatic release tagging with timestamp if not provided

### 3. Created Hourly Link Smoke Test (hourly-link-smoke.yml)
- Runs every hour at :15
- Tests /v1/verify/link endpoint
- Validates template generation and length
- Generates QR code for latest release
- Can be triggered manually via workflow_dispatch

## Commands for Future Use

### Download Latest Staging APK
```bash
# Via GitHub Release
curl -LO https://github.com/Lifeoflunatic/verifd/releases/latest/download/verifd-staging.apk

# Via GitHub CLI
gh release download --repo Lifeoflunatic/verifd --pattern "*.apk"
```

### Create New Release
```bash
# Manual trigger with specific tag
gh workflow run android-staging-apk.yml --repo Lifeoflunatic/verifd \
  -f release_tag=v1.3.0-rc1-staging+10

# Auto-generates timestamped tag
gh workflow run android-staging-apk.yml --repo Lifeoflunatic/verifd
```

### Run Link Smoke Test
```bash
gh workflow run hourly-link-smoke.yml --repo Lifeoflunatic/verifd
```

## Benefits
1. **Stable URLs**: GitHub Release URLs are permanent and publicly accessible
2. **QR Codes**: Direct mobile download without typing URLs
3. **Automated**: CI creates releases automatically for staging builds
4. **Monitored**: Hourly smoke tests ensure link generation works
5. **Fallback**: If nightly.link works (public repo), it's still validated

## Files Modified
- `.github/workflows/android-staging-apk.yml` - Added release creation steps
- `.github/workflows/hourly-link-smoke.yml` - New hourly smoke test
- `OPS/STAGING_QA_LINKS.md` - Updated with stable release URLs
- `OPS/NIGHTLY_LINK_FIX_SUMMARY.md` - This summary document