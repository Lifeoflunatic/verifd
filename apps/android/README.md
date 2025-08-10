# verifd Android App

Store-safe Android implementation of verifd identity verification system.

## Privacy-First Design

This app prioritizes user privacy and store compliance by:

- **No dangerous SMS permissions**: Uses `ACTION_SENDTO` intent instead of direct SMS API
- **Minimal call permissions**: Only `READ_PHONE_STATE` and `ANSWER_PHONE_CALLS` 
- **User-controlled messaging**: All SMS sending goes through user's preferred SMS app
- **Graceful degradation**: Works even without call screening role

## Call Screening Role Management

**CRITICAL COMPLIANCE**: The app uses `CallScreeningService` API instead of requesting dangerous call log permissions.

### Android 10+ (API 29+) Role System

The app implements **graceful degradation** for the `ROLE_CALL_SCREENING` requirement:

1. **Role Detection**: `RoleManager.isRoleHeld(ROLE_CALL_SCREENING)`
2. **UX Flow**: Automatic role request on first launch 
3. **Graceful Degradation**: Basic functionality preserved without role
4. **User Choice**: Never forces role acceptance

### Implementation - CallScreeningService.kt

```kotlin
// GRACEFUL DEGRADATION: Check role availability
fun hasCallScreeningRole(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val roleManager = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager
        roleManager?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) == true
    } else {
        // Pre-Android 10: Permission-based system
        true 
    }
}

// UX PATH: Create role request intent
fun createCallScreeningRoleIntent(context: Context): Intent? {
    val roleManager = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager
    return roleManager?.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
}
```

### Pre-Android 10 
Call screening works with standard `ANSWER_PHONE_CALLS` permission.

### Store Compliance Benefits

- **NO** `READ_CALL_LOG` or `WRITE_CALL_LOG` permissions needed
- Uses system CallScreeningService API exclusively
- User retains full control over call screening role
- App functions without dangerous permissions

## Store-Safe SMS Implementation (Identity Ping)

**CRITICAL COMPLIANCE**: The app uses `ACTION_SENDTO` with `sms:` URI scheme instead of requesting dangerous `SEND_SMS` permission.

### Implementation Details

1. **Intent-Based SMS**: Uses `Intent.ACTION_SENDTO` with `sms:phonenumber` URI
   - **NO** `SEND_SMS` permission in manifest
   - **NO** `SmsManager` usage unless app is default SMS app  
   - Full user transparency - SMS app shows the message before sending

2. **Dual-SIM Support**: Subscription extras added only when available
   - Detects active subscriptions via `SubscriptionManager` 
   - Includes `subscription_id` and `slot_id` extras in SMS intents
   - **Fallback**: System SIM picker if no subscription specified
   - **NO** direct SIM card access or manipulation

3. **Store Policy Compliance**:
   - All SMS operations require explicit user interaction
   - User's SMS app handles actual sending (respects user choice)
   - No background SMS sending capability
   - Complete transparency about message content

### Code Example - SmsUtils.kt

```kotlin
// STORE COMPLIANT: Uses ACTION_SENDTO, not SEND_SMS permission
val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("sms:$phoneNumber")).apply {
    putExtra("sms_body", message)
    // Dual-SIM: Add subscription extra only when available
    subscription?.let { sub ->
        putExtra("subscription_id", sub.subscriptionId)
        putExtra("slot_id", sub.simSlotIndex)
    }
}
```

## Architecture

### Core Components

- **CallScreeningService**: Labels unknown calls, triggers post-call verification flow
- **PostCallActivity**: Shows verification options after unknown calls
- **SmsUtils**: Store-safe SMS intent creation with dual-SIM support
- **ContactRepository**: vPass storage and contact checking

### Key Features

1. **Call Screening**: Labels unknown callers, allows verified contacts
2. **Post-Call Verification**: Shows verification options after unknown calls
3. **vPass Management**: Temporary contact entries (30m/24h/30d validity)
4. **Dual-SIM Aware**: Works with multiple SIM configurations
5. **Privacy Focused**: No personal data stored beyond necessary vPass entries

## Permissions

### Required Permissions
- `READ_PHONE_STATE`: Read phone number for dual-SIM detection
- `ANSWER_PHONE_CALLS`: Enable call screening service
- `INTERNET`: Network access for verification API
- `ACCESS_NETWORK_STATE`: Check network connectivity

### Explicitly Avoided Permissions (Store Compliance)
- ❌ `SEND_SMS`: Use `ACTION_SENDTO` intent for Identity Ping instead
- ❌ `READ_SMS` / `WRITE_SMS`: No SMS reading/writing required  
- ❌ `READ_CALL_LOG` / `WRITE_CALL_LOG`: Use `CallScreeningService` API instead
- ❌ `CALL_PHONE`: No outbound calling functionality needed

**Note**: These dangerous permissions would trigger Play Store review and limit distribution

### Optional Role (Android 10+)
- `ROLE_CALL_SCREENING`: Enhanced call screening capabilities

## Development

### Testing
Run unit tests with:
```bash
./gradlew test
```

### Building
Build release APK:
```bash
./gradlew assembleRelease
```

## Store Compliance Summary

This implementation follows Android store policies and passes automated security scans by:

### Permission Compliance
1. **Minimal permissions**: Only essential permissions in manifest
2. **No dangerous permissions**: Zero `SEND_SMS`, `*CALL_LOG`, `READ_SMS` permissions
3. **Intent-based operations**: Uses system intents instead of direct API access
4. **User consent**: All SMS actions require explicit user interaction via SMS app

### Technical Compliance  
5. **CallScreeningService API**: Uses official Android API, not call log access
6. **ACTION_SENDTO SMS**: Store-approved SMS method with full transparency
7. **Graceful degradation**: App functions without optional roles/permissions
8. **Dual-SIM respect**: Fallback to system picker, no SIM manipulation

### User Privacy
9. **Transparent functionality**: Users see all outgoing messages before sending  
10. **Privacy preservation**: No sensitive data collection beyond necessary vPass entries
11. **User choice**: Never forces role acceptance or app defaults

## User Experience Notes

- First launch requests call screening role (Android 10+)
- SMS verification opens user's default SMS app with pre-filled message
- Call labels appear during incoming calls ("Unknown Caller" for unverified)
- Post-call verification sheet appears after unknown calls
- All verification choices respect user privacy and app store policies