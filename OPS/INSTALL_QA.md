# QA Installation & Testing Guide

## Android Staging APK

### Installation

1. **Download APK**
   - Get latest staging APK from GitHub releases
   - Or from workflow artifacts

2. **Enable Installation**
   - Settings > Security > Unknown sources (enable)
   - Or Settings > Apps > Special access > Install unknown apps

3. **Install APK**
   - Open downloaded APK file
   - Tap "Install"
   - If prompted, allow Chrome/Files to install apps

4. **Grant Permissions**
   - On first launch, grant all requested permissions:
     - Phone (required for call screening)
     - SMS (for Power Mode)
     - Notifications (Android 13+)

### QA Panel Access (Staging Only)

#### Opening QA Panel
1. Open verifd app
2. Tap menu (three dots) in top-right
3. Select "QA Panel"

#### QA Panel Features

**Configuration Display**
- Shows current environment (staging/production)
- API endpoint being used
- Version and build number
- Feature flags status
- KID validation status
- Override user detection

**Quick Actions**
- **Notification Settings**: Direct access to app notification channels
- **Set Call Screening**: Opens system settings to set verifd as default
- **App Info**: Opens full app settings page
- **Clear Cache**: Clears app cache while preserving user data

**Override Users**
For testing with full features:
- Primary: `+919233600392`
- Secondary: `+917575854485`

These numbers bypass cohort restrictions and enable all features at 100%.

### Testing Checklist

#### Initial Setup
- [ ] Install APK successfully
- [ ] Grant all permissions
- [ ] Set as default call screening app

#### QA Panel
- [ ] Menu shows "QA Panel" option
- [ ] Panel opens and shows configuration
- [ ] KID shows `staging-2025-001` (green)
- [ ] Quick action buttons work

#### Notifications
- [ ] Notification permission requested (Android 13+)
- [ ] Two channels appear in settings:
  - Missed Call Actions (HIGH importance)
  - Persistent Notifications (LOW importance)
- [ ] Test notification appears for missed calls

#### Feature Verification
- [ ] Missed call actions show (30m/24h/30d/Block)
- [ ] Expecting window creates persistent notification
- [ ] Quick tile appears in notification shade

### Troubleshooting

#### QA Panel Not Visible
- Ensure you have staging build (not production)
- Check BuildConfig.BUILD_TYPE == "staging"
- Force stop and restart app

#### Permissions Issues
- Check Settings > Apps > verifd > Permissions
- Ensure all permissions granted
- For notifications, check system DND settings

#### Call Screening Not Working
- Settings > Apps > Default apps > Phone app
- Select verifd as screening app
- Test with call from non-contact

#### Configuration Not Loading
- Check internet connectivity
- Verify API endpoint reachable
- Check for VPN/proxy interference

### Debug Information

#### Build Variants
- **debug**: Local development, all features enabled
- **staging**: Test environment, QA panel visible
- **release**: Production, QA panel hidden

#### API Endpoints
- Staging: `https://staging.api.verifd.com`
- Production: `https://api.verifd.com`

#### Expected KID
- Staging: `staging-2025-001`
- Production: `prod-2025-001`

### Reporting Issues

When reporting issues, include:
1. Screenshot of QA panel
2. Android version
3. Device model
4. Steps to reproduce
5. Expected vs actual behavior

Use GitHub issues with label `qa-android`.