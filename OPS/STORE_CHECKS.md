# Store Compliance Checks - verifd

## Overview

verifd must maintain strict compliance with both Google Play Store and Apple App Store policies. This document consolidates all compliance requirements and CI automation to prevent dangerous permissions from reaching production.

**CRITICAL**: Any violation of these requirements will result in immediate build failure to prevent store rejection.

## Android Store Compliance

### Forbidden Permissions

The following permissions are **STRICTLY FORBIDDEN** for Google Play Store compliance:

- `SEND_SMS` - Direct SMS sending without user interaction
- `READ_SMS` - Reading SMS messages from other apps  
- `READ_CALL_LOG` - Accessing call history
- `WRITE_CALL_LOG` - Modifying call history

### Required Approach: Privacy-First SMS

Instead of `SEND_SMS` permission, we use:
- `ACTION_SENDTO` intent with `sms:` scheme
- This launches user's SMS app with pre-filled message
- User must manually tap "Send" - ensures consent
- No direct API access to SMS functions

Example implementation:
```kotlin
val smsIntent = Intent(Intent.ACTION_SENDTO).apply {
    data = Uri.parse("sms:+1234567890")
    putExtra("sms_body", "Verification message")
}
startActivity(smsIntent)
```

### Call Screening Requirements

#### Allowed Permissions
- `READ_PHONE_STATE` - Required for call screening
- `ANSWER_PHONE_CALLS` - For CallScreeningService functionality

#### CallScreeningService Implementation
- Must extend `CallScreeningService`
- Can only screen incoming calls, not outgoing
- Cannot make calls or access call history
- Must use `android.permission.BIND_SCREENING_SERVICE`

### Android Privacy-First Constraints

1. **No Background SMS**: Never send SMS without explicit user action
2. **No Call Log Access**: Never read or write call history
3. **Minimal Permissions**: Only request permissions actually needed
4. **Temporary Data**: All vPass data expires (30m/24h/30d)
5. **User Consent**: All actions require explicit user interaction

## iOS Store Compliance

### Core Requirements

#### No Auto-Messaging Requirement
- **NEVER** send SMS/iMessage automatically
- All messaging must be user-initiated via share sheet or Messages app
- Use `MFMessageComposeViewController` for SMS composition
- User must manually tap "Send" - no programmatic sending

### Call Directory Extension Constraints

#### API Restrictions
- Call Directory extensions run in **sandboxed environment**
- **NO network requests allowed** during directory building
- **NO API calls** to external services
- **NO real-time data fetching**

#### Implementation Requirements
```swift
// Correct: Static data only
func addIdentificationEntries() {
    // Use pre-downloaded, cached data only
    let entries = loadCachedVerifiedNumbers()
    // ... add entries
}

// FORBIDDEN: Network calls
func addIdentificationEntries() {
    // This will cause App Store rejection
    URLSession.shared.dataTask(...) // ❌ NOT ALLOWED
}
```

### Contact Management Constraints

#### User-Initiated Only
- Contact creation must be **explicitly requested by user**
- Cannot create contacts automatically/silently
- Use `CNContactStore` with proper permission prompts
- Must show clear UI for contact creation action

#### Temporary Contacts for 30-Day vPass
- Contacts created only when user explicitly approves 30-day verification
- Must include expiration metadata in contact notes
- Background cleanup removes expired contacts
- Group creation as fallback strategy

### iOS Privacy-First Implementation

#### Data Minimization
- Store only essential data for functionality
- Automatic expiry for all verification data
- Clear user control over data retention
- Transparent privacy policy

#### Permission Requests
- Request permissions only when needed
- Provide clear explanation for each permission
- Allow app functionality without optional permissions
- Graceful degradation when permissions denied

### Background Processing & Cleanup

#### Allowed Background Tasks
- `BGTaskScheduler` for expired data cleanup
- Background refresh for verified number updates
- Call Directory extension refresh

#### Forbidden Background Actions
- Sending messages without user interaction
- Making calls without user initiation  
- Accessing contacts without permission
- Network requests from Call Directory extension

## CI Automated Compliance Checks

Our CI pipeline automatically enforces store compliance through multiple checks:

### Android Permission Scanning

1. **Forbidden Permissions Detection**
   - Scans `AndroidManifest.xml` for prohibited permissions
   - Fails build immediately if violations detected
   - Provides clear error messages with compliant alternatives

2. **Permission Justification Verification**
   - Each permission must have inline comment explaining necessity
   - Comments must reference store compliance requirements

3. **Intent Usage Verification**
   - Ensures SMS functionality uses `ACTION_SENDTO` pattern
   - Verifies no direct SMS API calls in codebase

### iOS Compliance Validation

1. **Info.plist Privacy Description Checks**
   - Validates all permission requests have user-facing descriptions
   - Ensures descriptions are clear and specific to verifd's use case
   - Checks for required privacy strings

2. **Call Directory Network Usage Scan**
   - Scans Call Directory extension code for network calls
   - Fails if any URLSession, Alamofire, or HTTP calls detected
   - Ensures only cached/static data usage

3. **Background Task Compliance**
   - Validates only allowed background task types are used
   - Checks for proper task expiration handling
   - Ensures no background messaging/calling capabilities

### Build Failure Triggers

CI will immediately fail and block deployment if:

- **Android**: Any forbidden permissions detected in AndroidManifest.xml
- **iOS**: Missing required privacy descriptions in Info.plist
- **iOS**: Network calls detected in Call Directory extension
- **Either**: Background messaging/calling capabilities detected
- **Either**: Automatic contact creation without user consent flows

### Emergency Override

For critical releases only, CI checks can be bypassed by:
- Adding `[skip-store-check]` to commit message
- Must include justification in commit body
- Requires manual store compliance review before release

## Store Review Preparation

### Documentation Required for Submission

#### Android (Google Play)
- Clear explanation of call screening functionality
- Privacy policy covering minimal data collection
- Screenshots showing user consent for SMS composition
- Justification for each requested permission

#### iOS (App Store)
- Clear explanation of Call Directory usage
- Privacy policy covering all data types
- Screenshots showing user consent flows
- Description of temporary contact creation
- Background task usage justification

### Common Rejection Reasons

#### Android
- Apps requesting SMS permissions without clear need
- Call log access without telephony primary function
- Background SMS sending capabilities
- Overly broad permission requests

#### iOS
- Automatic contact creation without consent
- Network requests in Call Directory extension
- Background messaging capabilities
- Unclear permission usage descriptions
- Missing privacy policy sections

## Testing Checklists

### Pre-Submission Android Testing

- [ ] App works without any forbidden permissions
- [ ] SMS verification uses system SMS app (ACTION_SENDTO)
- [ ] Call screening functions correctly with minimal permissions
- [ ] No background SMS sending capability
- [ ] All permissions have clear user-facing justification
- [ ] Privacy policy covers all data collection
- [ ] App respects user consent for all actions

### Pre-Submission iOS Testing

- [ ] No automatic SMS/iMessage sending
- [ ] Call Directory works offline with cached data only
- [ ] Contact creation shows clear permission requests
- [ ] Shortcuts respect user consent requirements
- [ ] Background tasks only for cleanup/refresh
- [ ] Privacy policy matches actual app behavior
- [ ] All user-facing strings are clear and accurate
- [ ] App works gracefully with denied permissions

## Violation Response Protocol

If compliance violations are detected:

1. **Immediate**: Build fails with clear error message
2. **Investigation**: Review why violation was introduced
3. **Remediation**: Remove violation or implement compliant alternative
4. **Documentation**: Update compliance guides if new patterns emerge
5. **Re-validation**: Run full compliance check suite
6. **Approval**: Security team sign-off before proceeding

## Store-Specific Considerations

### Google Play Store
- Focuses heavily on permission minimization
- Strict enforcement of SMS/call log restrictions
- Requires clear user benefit for each permission
- Manual review for call screening apps

### Apple App Store
- Emphasizes user privacy and consent
- Strict sandbox enforcement for extensions
- No automatic actions without user approval
- Detailed privacy policy requirements

## Version-Specific Updates

### Android API Level Considerations
- Target SDK compliance requirements
- Runtime permission handling
- Background execution limits
- Notification policy changes

### iOS Version Considerations
- iOS 17+ enhanced Call Directory features
- New privacy prompts and requirements
- Updated background task limitations
- Established permission patterns for iOS 16+

## Compliance Monitoring

### Ongoing Monitoring
- Weekly compliance scans of main branch
- Monthly review of store policy changes
- Quarterly validation of CI check effectiveness
- Annual full compliance audit

### Policy Update Response
- Monitor Google Play and App Store policy announcements
- Update CI checks within 48 hours of policy changes
- Communicate changes to development team
- Update documentation and testing procedures

---

**CRITICAL REMINDER**: Store rejection can result in weeks of delay and potential revenue loss. These compliance checks are non-negotiable and must be maintained religiously.

For questions about compliance requirements, consult:
- `OPS/STORE_CHECKS_ANDROID.md` for Android-specific details
- `OPS/STORE_CHECKS_IOS.md` for iOS-specific details
- Development team lead for clarification on implementation approaches