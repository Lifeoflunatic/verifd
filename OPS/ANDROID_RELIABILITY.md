# Android Reliability Improvements

## Overview
Enhanced reliability features for verifd Android app to ensure notification actions work consistently, even when the app is in the background or the device is in deep sleep.

## Key Improvements

### 1. Exported Receiver with Custom Permission
- **Change**: NotifActionReceiver is now exported with signature-level permission protection
- **Benefit**: System can wake up the app to handle notification actions
- **Security**: Protected by `com.verifd.android.permission.NOTIFICATION_ACTION` (signature-level)

### 2. WakefulNotificationReceiver Base Class
- **Purpose**: Manages wake locks to ensure actions complete in deep sleep
- **Features**:
  - Automatic wake lock acquisition/release
  - 60-second timeout protection
  - Proper cleanup on completion
  - Coroutine-based async handling

### 3. Retry Mechanism with Exponential Backoff
- **Implementation**: 3 retry attempts with exponential backoff
- **Delays**: 1s, 2s, 4s (plus 0-500ms jitter)
- **Telemetry**: Records failures after all retries exhausted

## Technical Details

### Wake Lock Management
```kotlin
// Automatic wake lock lifecycle
1. BroadcastReceiver.onReceive() triggered
2. goAsync() called for extended processing
3. Wake lock acquired (60s timeout)
4. Coroutine launched for async work
5. Action handled with retries
6. Wake lock released in finally block
```

### Retry Strategy
- **Attempt 1**: Immediate execution
- **Attempt 2**: After 1-1.5s delay
- **Attempt 3**: After 2-2.5s delay
- **Failure**: Telemetry recorded, user notified

### AndroidManifest Changes
```xml
<!-- Custom permission for security -->
<permission
    android:name="com.verifd.android.permission.NOTIFICATION_ACTION"
    android:protectionLevel="signature" />

<!-- Exported receiver for reliability -->
<receiver
    android:name=".notification.NotifActionReceiver"
    android:exported="true"
    android:enabled="true"
    android:permission="com.verifd.android.permission.NOTIFICATION_ACTION">
```

## Benefits

### User Experience
- ✅ Actions work even when app is killed
- ✅ Actions work in battery optimization modes
- ✅ Actions work during deep sleep
- ✅ Automatic retry on transient failures

### System Integration
- ✅ Proper wake lock management
- ✅ Respects Android power management
- ✅ Clean resource cleanup
- ✅ No battery drain from stuck wake locks

### Security
- ✅ Signature-level permission protection
- ✅ No exposure to third-party apps
- ✅ Intent validation before processing
- ✅ Secure PendingIntent flags

## Testing Checklist

### Basic Functionality
- [ ] SMS action opens SMS composer
- [ ] WhatsApp action opens WhatsApp
- [ ] Copy action copies to clipboard
- [ ] Toast messages appear correctly

### Reliability Testing
- [ ] Actions work when app is in background
- [ ] Actions work when app is killed (swipe from recents)
- [ ] Actions work in Doze mode
- [ ] Actions work with battery optimization enabled
- [ ] Actions work after device reboot

### Edge Cases
- [ ] Multiple notifications with different actions
- [ ] Rapid action button taps
- [ ] Actions during active phone call
- [ ] Actions with no network connectivity
- [ ] Actions with app data cleared

### Performance
- [ ] Wake locks released properly (check with `adb shell dumpsys power`)
- [ ] No ANRs during action handling
- [ ] Retry delays work as expected
- [ ] Telemetry records successes and failures

## Monitoring

### Key Metrics
- Action success rate
- Retry attempt distribution
- Wake lock timeout occurrences
- Average action completion time

### Debug Commands
```bash
# Check wake locks
adb shell dumpsys power | grep verifd

# Monitor broadcasts
adb shell dumpsys activity broadcasts | grep verifd

# Check receiver registration
adb shell dumpsys package com.verifd.android | grep Receiver
```

## Known Limitations

1. **Android 12+ Restrictions**: Some background restrictions still apply
2. **Manufacturer Optimizations**: Some OEMs may still kill background apps aggressively
3. **Network Dependencies**: SMS/WhatsApp actions require network for template fetching

## Future Improvements

- [ ] WorkManager integration for deferred actions
- [ ] Foreground service for critical actions
- [ ] Local template caching for offline support
- [ ] Advanced telemetry with failure reasons
- [ ] A/B testing for retry strategies