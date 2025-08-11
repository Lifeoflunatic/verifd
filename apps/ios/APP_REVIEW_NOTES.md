# verifd iOS App Review Notes

## App Shortcuts and Time-Sensitive Notifications

This document provides privacy explanations and implementation details for Apple App Review regarding verifd's App Shortcuts and Time-Sensitive Notifications features.

## Overview

verifd implements iOS App Shortcuts and Time-Sensitive Notifications to provide users with quick access to verification features while maintaining strict privacy standards and user control.

## Feature Implementation

### 1. App Shortcuts (iOS 16+)

**Purpose**: Allow users to quickly grant verification passes and manage expecting call windows through Siri and Spotlight.

**Available Shortcuts**:
- **Grant 30m to Last Missed Call**: Grants a 30-minute verification pass to the most recent missed call
- **Expect Call**: Enables a 15 or 30-minute window for verified callers to reach the user
- **Block Last Call**: Blocks the most recent incoming call (placeholder implementation)

**Privacy Implementation**:
- All shortcuts are behind the `APP_SHORTCUTS_ENABLED` feature flag
- No automatic execution - all shortcuts require explicit user invocation
- No data collection or analytics on shortcut usage beyond local app improvement
- All processing happens locally on device

### 2. Time-Sensitive Notifications (iOS 15+)

**Purpose**: Notify users when verification windows are active and when they're about to expire.

**Notification Types**:
- **Expecting Window Active**: Confirms when a verification window is enabled
- **Verification Pass Granted**: Notifies when a specific number can call back
- **Window Expiring**: 5-minute warning before window expiry

**Privacy Implementation**:
- Requires explicit user permission for notifications
- Time-sensitive interruption level only for active verification windows
- No phone numbers or personal information in notification content for privacy
- All notifications are local - no server-side push notifications

## Privacy Compliance

### Data Collection
- **NO** personal data is transmitted to external servers via shortcuts or notifications
- **NO** usage analytics are sent to third parties
- **NO** phone numbers from CallKit are stored or transmitted
- **NO** automatic background processing of call data

### User Control
- Feature flags allow complete disabling of shortcuts and notifications
- Individual permission requests for notifications and contacts
- All actions require explicit user initiation
- Users can revoke permissions at any system level

### Contacts Usage
- Contacts access is only requested for 30-day verification passes
- **NO** automatic contact creation
- Clear user consent flow with explanation of purpose
- Fallback to contact groups when direct contact creation fails
- Automatic cleanup of expired temporary contacts

## App Store Guidelines Compliance

### Guideline 2.1 - App Completeness
- All shortcuts have proper error handling and fallback behaviors
- Feature flags ensure stable experience during gradual rollout
- Comprehensive unit tests verify functionality

### Guideline 2.3.3 - Accurate Metadata
- Shortcut descriptions clearly explain functionality
- No misleading capabilities or automatic behaviors promised

### Guideline 2.5.1 - Software Requirements
- Minimum iOS 15.0 for time-sensitive notifications
- Minimum iOS 16.0 for App Shortcuts
- Graceful degradation on older iOS versions

### Guideline 5.1.1 - Privacy - Data Collection and Storage
- All data processing happens locally on device
- No server-side analytics or tracking of shortcut usage
- Phone numbers are never transmitted without explicit user action

### Guideline 5.1.2 - Privacy - Data Use and Sharing
- No data sharing with third parties
- CallKit data is never stored or transmitted
- Contact creation requires explicit permission and user action

## Technical Implementation Details

### App Shortcuts Integration
```swift
// Shortcuts are properly declared with AppShortcutsProvider
@available(iOS 16.0, *)
struct VerifdShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        guard FeatureFlags.APP_SHORTCUTS_ENABLED else { return [] }
        // ... shortcuts implementation
    }
}
```

### Time-Sensitive Notifications
```swift
// Proper permission handling and time-sensitive configuration
@available(iOS 15.0, *)
func scheduleTimeSensitiveNotification() async {
    guard FeatureFlags.TIME_SENSITIVE_NOTIFICATIONS_ENABLED else { return }
    
    content.interruptionLevel = .timeSensitive // iOS 15+ only
    // ... notification implementation
}
```

### Privacy-First Architecture
- Feature flags: `APP_SHORTCUTS_ENABLED`, `TIME_SENSITIVE_NOTIFICATIONS_ENABLED`, `SIRI_INTEGRATION_ENABLED`
- Local data storage only via App Group container
- No network requests from shortcuts or notification handlers
- Clear separation between user-initiated actions and background processing

## Testing and Quality Assurance

### Unit Test Coverage
- `VerifdAppIntentsTests.swift`: Tests all App Intent functionality
- `TimeSensitiveNotificationTests.swift`: Tests notification scheduling and handling
- Comprehensive error handling and edge case coverage
- Mock objects for testing without external dependencies

### User Experience Testing
- Shortcuts work correctly from Siri voice commands
- Spotlight search integration functions properly
- Time-sensitive notifications appear at appropriate times
- Graceful handling of permission denials

## Permissions and Entitlements

### Required Permissions
- **Notifications**: For time-sensitive alerts about verification windows
- **Contacts**: Only for 30-day verification pass creation (user-initiated)
- **App Groups**: For sharing data with Call Directory Extension

### App Store Connect Configuration
- Proper App Privacy section filled with data collection details
- Age rating appropriate for communication app usage
- Clear app description of verification functionality

## Support and Troubleshooting

### Common Issues
1. **Shortcuts not appearing in Siri**: Ensure iOS 16+ and feature flag enabled
2. **Notifications not working**: Check notification permissions and iOS 15+ requirement
3. **Contact creation failing**: Handle permission denial gracefully with group fallback

### User Communication
- Clear error messages explaining permission requirements
- Helpful alerts guiding users to Settings when permissions are needed
- Transparent communication about data usage and storage

## Conclusion

verifd's App Shortcuts and Time-Sensitive Notifications implementation prioritizes user privacy, explicit consent, and local processing. All features are designed to enhance user experience while maintaining the highest privacy standards required by the App Store guidelines.

The implementation includes comprehensive testing, proper error handling, and clear user communication about functionality and permissions. All processing happens locally on the user's device, with no data transmission to external servers through these features.