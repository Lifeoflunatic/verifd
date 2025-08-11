# Android Notifications System

## Overview
verifd Android app uses a two-channel notification system to provide timely caller information while respecting user preferences and system resources.

## Notification Channels

### 1. Missed Call Actions (`verifd_actions`)
- **Importance**: HIGH
- **Purpose**: Time-sensitive missed call notifications with quick approval actions
- **Features**:
  - Sound and vibration enabled by default
  - Shows action buttons for quick vPass approval (30m, 24h, 30d)
  - Auto-dismisses when action taken
  - Risk-aware (suppressed for high-risk/spam calls)

### 2. Persistent Notifications (`verifd_persistent`)
- **Importance**: LOW
- **Purpose**: Ongoing status notifications that don't interrupt
- **Use cases**:
  - Active expecting window status
  - Quick Tile service status
  - High-risk call notifications (silent)
- **Features**:
  - No sound or vibration
  - Non-dismissible while active
  - Shows in notification shade but not as heads-up

## Permission Handling

### Android 13+ (API 33+)
- **Runtime permission**: `POST_NOTIFICATIONS` required
- **Request flow**:
  1. Check permission on MainActivity resume
  2. Show rationale if previously denied
  3. Request permission via ActivityResultLauncher
  4. Show in-app banner if denied with settings shortcut

### Android 12 and below
- Notifications work without runtime permission
- Channels created automatically on first use

## User Controls

### In-App Settings
- Enable/disable missed call actions
- Configure notification preferences
- Quick access to system notification settings

### System Settings
- Per-channel controls (sound, vibration, importance)
- App-level notification toggle
- Do Not Disturb mode respected

## Implementation Details

### Channel Creation
- Channels created in `App.kt` on application start
- One-time creation (Android handles duplicates)
- Backwards compatible with pre-Oreo devices

### Notification IDs
- Unique per phone number using hash-based generation
- Consistent IDs enable updates and cancellation
- Range: 2000-12000 for missed calls, 1001 for expecting window

### Risk Assessment Integration
- HIGH/CRITICAL risk calls use low-importance channel
- Spam calls suppressed entirely
- Verified callers get normal priority

## QA Testing Points

### Permission Flow
1. Fresh install on Android 13+ device
2. Verify permission prompt appears
3. Test both grant and deny paths
4. Verify settings shortcut in denial banner

### Notification Behavior
1. Trigger missed call with actions enabled
2. Verify action buttons work correctly
3. Test expecting window persistent notification
4. Verify high-risk calls are silent

### Channel Management
1. Check Settings > Apps > verifd > Notifications
2. Verify two channels appear
3. Test per-channel customization
4. Verify changes persist across app restarts

## Troubleshooting

### Common Issues

#### Notifications not appearing
- Check app notification permission
- Verify channel not disabled in settings
- Check Do Not Disturb mode
- Review device battery optimization settings

#### Actions not working
- Ensure notification permission granted
- Check if feature flag enabled
- Verify backend connectivity
- Check rate limiting not triggered

#### Persistent notification stuck
- Force stop app from settings
- Clear notification manually
- Check for expecting window expiry

## Privacy & Security

- No PII in notification content (phone numbers sanitized)
- Actions use secure PendingIntents with immutable flags
- Request codes prevent intent hijacking
- Notification IDs hashed to prevent enumeration

## Performance Considerations

- Channels created once at app start
- Notification updates batched when possible
- Low-importance for non-urgent notifications
- Proper cleanup on window expiry/cancellation