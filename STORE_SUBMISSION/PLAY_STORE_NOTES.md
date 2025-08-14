# Play Store Submission Notes - verifd Android

## App Description

verifd provides privacy-first call verification, helping users identify legitimate callers before they answer. Callers verify their identity through a quick web form or SMS link, receiving a temporary "vPass" that allows their call to ring through normally. No more missed calls from important but unknown numbers.

## Key Features

### 1. Call Screening Service
- **Purpose**: Screen incoming calls and identify verified callers
- **Permissions**: ANSWER_PHONE_CALLS, READ_PHONE_STATE
- **Privacy**: No call audio recorded, only metadata processed
- **STIR/SHAKEN**: Supports carrier attestation levels
- **User Control**: Can be disabled in Phone app settings

### 2. Missed Call Actions
- **Purpose**: Quick actions on missed call notifications
- **Actions Available**:
  - Approve for 30 minutes
  - Approve for 24 hours  
  - Approve for 30 days
  - Block caller
- **Implementation**: PendingIntent with idempotency
- **Feature Flag**: Gradual rollout via remote configuration

### 3. Quick Settings Tile
- **Purpose**: Set "expecting" window for deliveries/appointments
- **Durations**: 15 or 30 minutes
- **Persistent Notification**: Shows countdown during active window
- **Auto-Cleanup**: WindowSweeperWorker removes expired windows
- **Boot Recovery**: Restored after device restart

### 4. SMS Power Mode (Optional)
- **Purpose**: Auto-send verification link via default SMS app
- **User Control**: Requires explicit opt-in
- **Implementation**: Uses SMS intent, not direct sending
- **Compliance**: Follows Google Play SMS policy

### 5. Dual-SIM Support
- **Detection**: Identifies which SIM received the call
- **Verification**: Links vPass to specific phone number
- **Display**: Shows SIM indicator in notifications

## Permissions Justification

### Required Permissions

```xml
<!-- Core functionality -->
<uses-permission android:name="android.permission.ANSWER_PHONE_CALLS" />
  Justification: Required for CallScreeningService to identify callers

<uses-permission android:name="android.permission.READ_PHONE_STATE" />
  Justification: Detect incoming calls and dual-SIM configuration

<uses-permission android:name="android.permission.INTERNET" />
  Justification: Verify caller status with backend API

<!-- Notifications -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
  Justification: Show missed call actions and expecting windows

<!-- Background work -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  Justification: Restore Quick Tile state after reboot

<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
  Justification: Maintain expecting window state
```

### Optional Permissions

```xml
<!-- SMS (only if Power Mode enabled) -->
<uses-permission android:name="android.permission.SEND_SMS" />
  Justification: Send verification links (requires user opt-in)

<!-- Contacts (for 30-day passes) -->
<uses-permission android:name="android.permission.READ_CONTACTS" />
<uses-permission android:name="android.permission.WRITE_CONTACTS" />
  Justification: Create temporary contacts for long-term passes
```

## Data Safety Section

### Data Collection
- **Phone Number**: For verification only, hashed in logs
- **Call Metadata**: Timestamp and duration for risk assessment
- **Device Info**: Android version for compatibility
- **Network Info**: ASN for spam detection (optional)

### Data Sharing
- **None**: No data shared with third parties
- **Analytics**: Differential privacy with ε=0.1
- **Crash Reports**: Anonymized stack traces only

### Data Security
- **Encryption**: TLS 1.3 for all network communication
- **Storage**: Encrypted SharedPreferences
- **Deletion**: Auto-cleanup after pass expiry

### Data Practices
- ✅ Data encrypted in transit
- ✅ Option to delete data
- ✅ No selling of user data
- ✅ No ads or marketing

## Target Audience & Content Rating

### Target Age
- **Age Group**: 13+ (Teen)
- **Reason**: Business/productivity app

### Content Rating Questionnaire
- Violence: None
- Sexual Content: None
- Profanity: None
- Controlled Substances: None
- User Interaction: Yes (caller names/reasons)
- Location Sharing: No
- Personal Info Sharing: No (only phone numbers)

## Feature Flags & Staged Rollout

### Remote Configuration
All features start disabled and are gradually enabled:

```json
{
  "MISSED_CALL_ACTIONS": {
    "enabled": false,
    "percentage": 0,
    "minVersion": "1.0.0"
  },
  "QUICK_TILE_EXPECTING": {
    "enabled": false,
    "percentage": 0,
    "minVersion": "1.0.0"
  }
}
```

### Rollout Plan
1. **Week 1**: 1% in US/CA
2. **Week 2**: 10% in US/CA
3. **Week 3**: 50% in US/CA/UK/AU
4. **Week 4**: 100% globally

### Kill Switch
Emergency disable via remote config:
```json
{
  "GLOBAL_KILL_SWITCH": true  // Disables all features
}
```

## Testing Instructions

### Test Credentials
- Phone: +1 (555) 000-TEST
- Verification: Auto-approves in debug builds
- Backend: https://staging.api.verifd.com

### Test Cases

1. **Basic Call Screening**
   - Install and set as default screening app
   - Receive call from unknown number
   - Should see "Checking caller..." screen
   - If verified, call rings through

2. **Missed Call Actions**
   - Miss call from unknown number
   - Pull down notification
   - See 4 action buttons
   - Tap "Approve 30m"
   - Caller can now reach you

3. **Quick Tile**
   - Add tile in Quick Settings
   - Tap "Expecting 15m"
   - See persistent notification
   - All calls allowed for 15 minutes
   - Auto-expires

4. **Risk Scoring (Shadow Mode)**
   - Make 4+ calls in 1 minute
   - Check logcat for [SHADOW_RISK]
   - Should show high burst score
   - No user-visible effect (shadow mode)

## Policy Compliance

### Google Play Policies

#### Device and Network Abuse
- ✅ No unauthorized phone calls
- ✅ No SMS spam
- ✅ Respects user choices

#### Permissions
- ✅ All permissions justified
- ✅ Follows least-privilege principle
- ✅ Clear permission rationale shown

#### Privacy & Security
- ✅ Prominent privacy policy
- ✅ Secure data transmission
- ✅ No collection of unnecessary data

#### Deceptive Behavior
- ✅ Accurate description
- ✅ No misleading functionality
- ✅ Clear about limitations

### Specific Policy Areas

#### CallScreeningService
- Registered properly in manifest
- Requests role via RoleManager
- Handles all callbacks correctly
- No blocking of emergency numbers

#### SMS (if Power Mode enabled)
- Uses ACTION_SEND intent
- No direct SMS API usage
- User confirmation required
- Clear opt-in flow

#### Background Work
- Uses WorkManager for efficiency
- Respects Doze mode
- No excessive wake locks
- Battery-optimized

## Device Compatibility

### Minimum Requirements
- **API Level**: 26 (Android 8.0)
- **RAM**: 2 GB
- **Storage**: 50 MB
- **Network**: 3G or higher

### Tested Devices
- Pixel 4/5/6/7/8 series
- Samsung Galaxy S20/S21/S22/S23
- OnePlus 8/9/10/11
- Xiaomi Mi 11/12/13
- Nothing Phone (1)/(2)

### Known Issues
- Samsung: May need "App permissions" enabled separately
- Xiaomi: MIUI may restrict background work
- OnePlus: OxygenOS may delay notifications
- Huawei: Without GMS, some features unavailable

## Release Notes

### Version 1.0.0 (Build 100)
**New Features:**
- Call screening with vPass verification
- Missed call quick actions
- Quick Settings tile for expecting windows
- Dual-SIM support
- STIR/SHAKEN attestation support

**Improvements:**
- Privacy-first design with minimal data collection
- Differential privacy telemetry
- Remote feature flags for safe rollout
- Automatic cleanup of expired passes

**Bug Fixes:**
- First release, no prior bugs

## APK Details

### Build Configuration
```gradle
android {
    compileSdk 34
    minSdk 26
    targetSdk 34
    
    defaultConfig {
        applicationId "com.verifd.android"
        versionCode 100
        versionName "1.0.0"
    }
}
```

### ProGuard Rules
```proguard
# Keep CallScreeningService
-keep class com.verifd.android.service.CallScreeningService { *; }

# Keep notification actions
-keep class com.verifd.android.receiver.NotificationActionReceiver { *; }

# Keep Quick Tile Service
-keep class com.verifd.android.service.VerifdTileService { *; }
```

### Signing
- **Release Key**: SHA-256: [REDACTED]
- **Upload Key**: SHA-256: [REDACTED]
- **App Signing**: Enrolled in Play App Signing

## Support Information

### Contact
- **Developer**: verifd Inc.
- **Email**: support@verifd.com
- **Website**: https://verifd.com
- **Privacy Policy**: https://verifd.com/privacy
- **Terms**: https://verifd.com/terms

### Support Channels
- In-app feedback form
- Email support (24-48h response)
- FAQ at https://verifd.com/help

## Pre-Launch Report Response

Common issues and responses:

**Issue: Crash on Android 8.0**
- Fixed: Added null check for PhoneAccountHandle

**Issue: Accessibility - Button without content description**
- Fixed: Added contentDescription to all interactive elements

**Issue: Performance - Slow startup**
- Fixed: Moved database init to background thread

**Issue: Security - Cleartext traffic**
- Fixed: Enforced HTTPS only, no cleartext permitted

## Submission Checklist

- [x] Tested on 10+ physical devices
- [x] Pre-launch report issues resolved
- [x] All permissions justified
- [x] Data safety section completed
- [x] Content rating questionnaire done
- [x] Screenshots for all device types
- [x] Feature graphic created (1024x500)
- [x] Privacy policy URL live
- [x] Support email monitored
- [x] ProGuard rules verified
- [x] Signed with release key
- [x] Staged rollout configured
- [x] Remote config kill switch tested