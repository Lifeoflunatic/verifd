# App Store Review Notes - verifd iOS

## App Description

verifd is a privacy-first call verification service that helps users identify legitimate callers. By using out-of-band verification (SMS/web link), callers can prove their identity before placing a call. Once verified, they receive a temporary "vPass" that allows their next call to ring through like a known contact.

## Key Features

### 1. Call Directory Extension (IdentityLookup)
- **Purpose**: Filter verification-related SMS messages to a dedicated folder
- **Privacy**: All filtering happens on-device; no message content leaves the device
- **Behavior**: ALLOW-only filtering - never blocks normal SMS messages
- **User Control**: Can be disabled in Settings > Messages > Unknown & Spam

### 2. App Shortcuts (Siri & Spotlight)
- **Purpose**: Quick actions for granting vPasses to recent callers
- **Available Actions**:
  - Grant 30-minute pass to last missed call
  - Set expecting window (15/30 minutes)
  - Block last caller
- **Privacy**: All shortcuts operate locally using cached call data
- **Feature Flag**: Controlled via remote configuration for gradual rollout

### 3. Time-Sensitive Notifications
- **When Used**: Only during user-initiated "expecting" windows
- **Duration**: Maximum 30 minutes per window
- **Purpose**: Alert user when verification window is active
- **User Control**: Can be disabled in Settings > Notifications > verifd

### 4. Temporary Contacts (30-day vPass)
- **Implementation**: Creates temporary contact cards for 30-day passes
- **Cleanup**: Background task removes expired contacts daily
- **Privacy**: No permanent modifications to user's contact list
- **Fallback**: If background task fails, Call Directory denies expired passes

## Privacy & Data Handling

### Data Collection
- **Minimal**: Only phone numbers and verification timestamps
- **No PII**: Names and reasons are stored encrypted, deleted after expiry
- **Telemetry**: Differential privacy with Laplace noise (ε=0.1)
- **No Tracking**: No device IDs, no user profiles, no location tracking

### Data Storage
- **Local**: Recent calls cached for 24 hours
- **Server**: vPasses stored with automatic expiry
- **Encryption**: All data encrypted in transit (TLS 1.3)
- **Deletion**: Automatic cleanup of expired data

### Permissions Used
- **Contacts**: For temporary contact creation (30-day passes only)
- **Notifications**: For time-sensitive alerts during expecting windows
- **Siri & Shortcuts**: For quick actions via voice/Spotlight

## Feature Flags & Remote Configuration

All new features are deployed behind feature flags for safety:

```json
{
  "APP_SHORTCUTS_ENABLED": false,  // Default OFF
  "IDENTITY_LOOKUP_ENABLED": false, // Default OFF
  "enableRiskScoring": false        // Always starts OFF
}
```

Features are gradually enabled based on:
- Geographic location (country-level only)
- App version compatibility
- Cohort percentage rollout
- User opt-in for certain features

## Testing Instructions

### Test Account
- Phone: +1 (555) 000-TEST
- Verification Code: 123456 (works in TestFlight builds)

### Test Scenarios

1. **Basic Verification Flow**
   - Caller visits web-verify form
   - Enters name and reason
   - Receives SMS with verification link
   - Completes verification
   - Places call - should ring through

2. **App Shortcuts**
   - Miss a call from unknown number
   - Pull down Spotlight search
   - Type "Grant verifd"
   - Select "Grant 30m to last missed"
   - Caller should now ring through

3. **Message Filtering**
   - Enable filter in Settings > Messages
   - Receive verification SMS
   - Should appear in "verifd Verifications" folder
   - Normal SMS unaffected

4. **Expecting Window**
   - Use Shortcut to "Expect calls 15m"
   - Receive Time-Sensitive notification
   - All calls allowed during window
   - Auto-expires after 15 minutes

## Compliance

### GDPR/CCPA
- Right to deletion: All data auto-deletes after expiry
- Data portability: Users can export vPass history
- Consent: Explicit opt-in for all features
- Minimal collection: Only essential data stored

### Accessibility
- Full VoiceOver support
- Dynamic Type supported
- Reduced Motion respected
- High Contrast mode compatible

### iOS Guidelines
- No automatic messaging or calling
- No background location access
- No persistent network connections
- Respects user privacy settings

## Known Limitations

1. **No Auto-Reply**: iOS doesn't allow automatic SMS responses
2. **Call Directory Size**: Limited to 100K entries by iOS
3. **Background Tasks**: May be delayed by iOS power management
4. **Notification Limits**: Time-Sensitive limited to user-initiated actions

## Support Information

- **Website**: https://verifd.com
- **Support Email**: support@verifd.com
- **Privacy Policy**: https://verifd.com/privacy
- **Terms of Service**: https://verifd.com/terms

## Review Guidelines Compliance

### 1.1 Objectionable Content
- No inappropriate content
- Professional business use case

### 2.1 App Completeness
- Fully functional with no placeholder content
- All features thoroughly tested

### 2.3 Accurate Metadata
- Screenshots reflect actual app functionality
- Description matches implemented features

### 4.0 Design
- Native iOS design patterns
- Consistent with iOS Human Interface Guidelines

### 5.1 Privacy
- Clear privacy policy
- Minimal data collection
- User consent for all features

### 5.6 Developer Code of Conduct
- Respectful to users
- No spam or abuse potential
- Clear value proposition

## App Review Response

If asked about specific features:

**Q: Why do you need the IdentityLookup extension?**
A: To filter verification-related SMS messages into a dedicated folder, making it easier for users to find verification links. This is ALLOW-only filtering - we never block normal messages.

**Q: Why do you create temporary contacts?**
A: Only for 30-day vPasses, to ensure reliable call identification. These are automatically cleaned up and never permanently modify the user's contacts.

**Q: Why do you use Time-Sensitive notifications?**
A: Only during user-initiated "expecting" windows (max 30 minutes) when the user explicitly wants to receive calls. Never used for marketing or unsolicited notifications.

**Q: How do you handle user privacy?**
A: We collect minimal data (phone numbers only), use differential privacy for telemetry, auto-delete expired data, and never track users across apps or websites.

## Binary Details

- **Version**: 1.0.0 (Build 100)
- **Minimum iOS**: 15.0
- **Architectures**: arm64, arm64e
- **Size**: ~12 MB
- **Frameworks**: CallKit, Contacts, Intents, IdentityLookup
- **Entitlements**: 
  - com.apple.developer.contact-notes
  - com.apple.developer.siri
  - com.apple.developer.identitylookup.message-filter

## Submission Checklist

- [x] App runs on latest iOS (17.x)
- [x] No crashes in 72-hour test period
- [x] All URLs functional
- [x] Privacy policy updated
- [x] Screenshots accurate
- [x] TestFlight tested with 25+ users
- [x] Accessibility tested
- [x] IPv6 network tested
- [x] No deprecated APIs used
- [x] Export compliance documented