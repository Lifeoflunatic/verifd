# Android Store Compliance - verifd

## Why This Matters for Review

Google Play Store has **strict policies** around SMS and call log permissions. Apps requesting these permissions undergo **manual review** and face high rejection rates. Since 2019, Google has restricted SMS/CALL_LOG permissions to **default handler apps only** (e.g., default SMS app, default phone app).

**verifd's approach**: We achieve full functionality WITHOUT dangerous permissions by using:
- `ACTION_SENDTO` intents for SMS (user controls sending)
- `CallScreeningService` API for call management (no call log access)
- User-initiated actions only (no background operations)

This ensures **immediate approval** without manual review delays.

## Forbidden Permissions

The following permissions are **STRICTLY FORBIDDEN** and will trigger CI failure:

### ❌ SEND_SMS
- **Why forbidden**: Only default SMS apps can have this permission
- **Store policy**: Triggers manual review with >90% rejection rate
- **Our alternative**: `ACTION_SENDTO` intent - user's SMS app handles sending
- **Implementation**:
  ```kotlin
  // COMPLIANT: User controls sending
  val intent = Intent(Intent.ACTION_SENDTO).apply {
      data = Uri.parse("sms:$phoneNumber")
      putExtra("sms_body", message)
  }
  startActivity(intent)
  ```

### ❌ READ_SMS / WRITE_SMS  
- **Why forbidden**: Privacy violation, only default SMS apps allowed
- **Store policy**: Automatic rejection for non-SMS apps
- **Our approach**: We never need to read SMS - verification happens via web link

### ❌ READ_CALL_LOG / WRITE_CALL_LOG
- **Why forbidden**: Only default dialer apps can access call history
- **Store policy**: Immediate rejection for call screening apps
- **Our alternative**: `CallScreeningService` API provides everything needed
- **Implementation**:
  ```kotlin
  class CallScreeningService : CallScreeningService() {
      // Receives call details without log access
      override fun onScreenCall(callDetails: Call.Details) {
          // Process call in real-time
      }
  }
  ```

## Required Approach

### Privacy-First SMS (Identity Ping)
```kotlin
// Store-compliant SMS implementation
object SmsUtils {
    fun createSmsIntent(
        phoneNumber: String, 
        message: String,
        subscription: SubscriptionInfo? = null
    ): Intent {
        return Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("sms:$phoneNumber")
            putExtra("sms_body", message)
            
            // Dual-SIM support (optional extras)
            subscription?.let {
                putExtra("subscription_id", it.subscriptionId)
                putExtra("slot_id", it.simSlotIndex)
            }
        }
    }
}
```

### Call Screening (Android 10+)
```kotlin
// Role-based call screening with graceful degradation
fun requestCallScreeningRole(activity: Activity) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val roleManager = activity.getSystemService(RoleManager::class.java)
        val intent = roleManager.createRequestRoleIntent(
            RoleManager.ROLE_CALL_SCREENING
        )
        activity.startActivityForResult(intent, REQUEST_ROLE)
    }
}
```

## Allowed Permissions

### ✅ READ_PHONE_STATE
- **Purpose**: Detect incoming calls for screening
- **Justification**: Core functionality - label unknown callers
- **Store compliance**: Allowed for call-related apps

### ✅ ANSWER_PHONE_CALLS  
- **Purpose**: Enable CallScreeningService functionality
- **Justification**: Required for call screening role
- **Store compliance**: Standard permission for call apps

### ✅ INTERNET & ACCESS_NETWORK_STATE
- **Purpose**: Backend API communication
- **Justification**: Verify identity and manage vPass
- **Store compliance**: Standard permissions

## Dual-SIM Support

### Implementation Without Permissions
```kotlin
// Get SIM info WITHOUT dangerous permissions
@SuppressLint("MissingPermission") // Only needs READ_PHONE_STATE
fun getActiveSubscriptions(context: Context): List<SubscriptionInfo> {
    val subscriptionManager = context.getSystemService(
        SubscriptionManager::class.java
    )
    return if (ActivityCompat.checkSelfPermission(
        context, 
        Manifest.permission.READ_PHONE_STATE
    ) == PackageManager.PERMISSION_GRANTED) {
        subscriptionManager.activeSubscriptionInfoList ?: emptyList()
    } else {
        emptyList() // Graceful fallback
    }
}
```

### User SIM Selection
- System shows SIM picker if no subscription specified
- User chooses which SIM for Identity Ping
- No direct SIM manipulation by app

## CI Enforcement

### Manifest Scanning
```yaml
# .github/workflows/ci.yml
- name: Check Android Permissions
  run: |
    MANIFEST="apps/android/app/src/main/AndroidManifest.xml"
    
    # These will fail the build
    FORBIDDEN=("SEND_SMS" "READ_SMS" "READ_CALL_LOG" "WRITE_CALL_LOG")
    
    for perm in "${FORBIDDEN[@]}"; do
      if grep -q "android.permission.$perm" "$MANIFEST"; then
        echo "❌ VIOLATION: $perm detected!"
        exit 1
      fi
    done
```

### Code Pattern Detection
```bash
# Detect dangerous API usage
if grep -r "SmsManager.getDefault()" apps/android/; then
    echo "❌ Direct SMS API usage detected!"
    exit 1
fi
```

## Testing Checklist

### Pre-Submission Validation
- [ ] No SEND_SMS permission in manifest
- [ ] No READ/WRITE_CALL_LOG permissions
- [ ] SMS uses ACTION_SENDTO exclusively
- [ ] CallScreeningService implementation tested
- [ ] Dual-SIM support via system picker
- [ ] Graceful degradation without permissions
- [ ] User consent for all actions

### Store Listing Requirements
- [ ] Clear description of verification purpose
- [ ] Privacy policy link included
- [ ] Screenshots show user consent flows
- [ ] No mention of automatic SMS sending
- [ ] Call screening purpose explained

## Common Rejection Scenarios

### Scenario 1: SMS Permission Request
**Rejection**: "Your app requests SMS permissions but doesn't appear to be a default SMS handler"
**Fix**: Remove SEND_SMS, use ACTION_SENDTO intent

### Scenario 2: Call Log Access
**Rejection**: "Apps using call log permissions must be a default dialer"
**Fix**: Use CallScreeningService API instead

### Scenario 3: Background SMS
**Rejection**: "Your app sends SMS without user interaction"
**Fix**: All SMS must go through user's SMS app

## Emergency Override

If you absolutely must bypass CI checks (NOT RECOMMENDED):
```bash
git commit -m "fix: critical bug [skip-store-check]

Justification: Emergency hotfix for production issue.
Manual compliance review completed by: [Name]
Risk assessment: [Details]"
```

## Resources

- [Google Play SMS/Call Log Policy](https://support.google.com/googleplay/android-developer/answer/9047303)
- [CallScreeningService Documentation](https://developer.android.com/reference/android/telecom/CallScreeningService)
- [Android Permissions Best Practices](https://developer.android.com/training/permissions/requesting)

---

**Remember**: Store compliance is not optional. These restrictions protect user privacy and ensure verifd can be distributed without delays or rejections.