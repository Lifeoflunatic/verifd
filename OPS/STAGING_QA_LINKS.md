# Staging QA Links

## Latest Build: v1.3.0-rc1-staging.11

**Build Date:** 2025-08-13T00:42:00Z  
**GitHub Release:** [v1.3.0-rc1-staging.11](https://github.com/Lifeoflunatic/verifd/releases/tag/v1.3.0-rc1-staging.11)  
**Branch:** feat/zod-row-typing  

### 📱 Quick Download (Public - No Login Required)
- **[Direct APK Download](https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging.11/verifd-staging.apk)**

### APK Details
- **Version:** 1.3.0-rc1-staging.11 (clean build with dot notation)  
- **SHA256:** `bb6d5979121670033cf7bcbb363988e33041d5b215c5d1678dab95d765e5a69f`  
- **Size:** 7.7M  
- **API Endpoint:** https://staging.api.verifd.com  

### ✅ What's Fixed in .11
- Version name strictly enforced from release tag (no suffixes)
- Single APK guarantee with count verification
- Standardized artifact naming for consistent downloads
- Post-release URL verification

### Download Methods

1. **Stable Release URL (Recommended)**
   ```bash
   # Direct download (works without GitHub login)
   curl -LO https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging.11/verifd-staging.apk
   
   # Or via GitHub CLI
   gh release download v1.3.0-rc1-staging.11 --repo Lifeoflunatic/verifd
   ```

2. **From Workflow Artifacts** (requires login)
   - [View Workflow Run](https://github.com/Lifeoflunatic/verifd/actions/runs/16924350095)
   - Download artifact: `verifd-staging-apk`

### Override Users (Staging)
- +919233600392
- +917575854485

### Configuration
- **Signing Key ID:** staging-2025-001

## Installation Instructions

1. **Download APK** from the link above or scan QR code
2. **Enable Unknown Sources** in Android Settings > Security
3. **Install APK** - tap downloaded file
4. **Grant Permissions:**
   - Phone (required)
   - Call Screening (Android 10+)
   - Notifications (Android 13+)
5. **Test Deep Links:**
   - QA Panel: `verifd://qa`
   - Settings: `verifd://settings`

## Features Enabled (Staging)
- ✅ Missed Call Actions (50% rollout, IN geo)
- ✅ Quick Tile Expecting (50% rollout)
- ✅ App Shortcuts (50% rollout)
- ✅ Identity Lookup (25% rollout)
- ✅ Templates (75% rollout)
- ✅ WhatsApp (75% rollout)
- ⚠️ Risk Scoring (10% rollout, shadow mode)