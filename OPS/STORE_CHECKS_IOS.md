# iOS Store Compliance - verifd

## Why This Matters for Review

Apple App Store has **zero tolerance** for apps that violate user privacy or attempt automatic operations without consent. The review process is particularly strict around:
- **Messaging**: Apps cannot send messages without explicit user action
- **Contacts**: Creating contacts requires clear user permission and intent
- **Call Directory**: Extensions must operate completely offline
- **Background Processing**: Limited to specific approved task types

**verifd's approach**: We ensure compliance through:
- User-initiated messaging via `MFMessageComposeViewController`
- Explicit permission requests for contact operations
- Offline-only Call Directory extension
- Transparent background cleanup tasks

This approach ensures **smooth approval** without back-and-forth rejections.

## Core Requirements

### ❌ No Auto-Messaging

**Store Policy**: Apps that send SMS/iMessage without user interaction face **immediate rejection**.

**Compliant Implementation**:
```swift
// User MUST tap Send button
let messageComposer = MFMessageComposeViewController()
messageComposer.recipients = [phoneNumber]
messageComposer.body = "Hey—it's \(userName). I screen unknown calls. " +
                       "Reply with Name + Reason or tap: \(verifyLink)"
present(messageComposer, animated: true)
```

**What NOT to do**:
- Never use private APIs to send messages
- Never automate message sending
- Never send messages in background

### ✅ User-Initiated Contact Creation

**Store Policy**: Contact creation must be **explicitly requested by user** with clear UI.

**Compliant Implementation**:
```swift
// ALWAYS request permission first
CNContactStore().requestAccess(for: .contacts) { granted, error in
    if granted {
        // Show UI for user to confirm contact creation
        self.showContactCreationConfirmation { userConfirmed in
            if userConfirmed {
                self.createTemporaryContact(vPass)
            }
        }
    } else {
        // Direct to Settings with explanation
        self.showPermissionDeniedAlert()
    }
}
```

### ⚠️ Call Directory Extension Constraints

**Critical Requirement**: Call Directory extensions run in a **sandboxed environment** with NO network access.

**FORBIDDEN in Extension**:
```swift
// ❌ These will cause REJECTION:
URLSession.shared.dataTask(...)  // Network calls
Alamofire.request(...)          // Third-party networking
UserDefaults(suiteName:).synchronize() // If triggers iCloud
```

**REQUIRED Approach**:
```swift
// ✅ Offline-only operation
class CallDirectoryHandler: CXCallDirectoryProvider {
    override func beginRequest(with context: CXCallDirectoryExtensionContext) {
        // STORE COMPLIANCE: NO network calls allowed
        guard let sharedContainer = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: "group.verifd") else {
            context.cancelRequest(withError: VerifdError.noSharedContainer)
            return
        }
        
        // Read ONLY from pre-cached data
        let dataPath = sharedContainer.appendingPathComponent("vpass_cache.json")
        guard let data = try? Data(contentsOf: dataPath) else {
            // No cached data = no entries (fail gracefully)
            context.completeRequest()
            return
        }
        
        // Process cached entries...
    }
}
```

## Privacy Requirements

### Info.plist Descriptions

**Required Keys** with meaningful descriptions:

```xml
<key>NSContactsUsageDescription</key>
<string>verifd creates temporary contact entries for verified callers (30-day passes only). You control which callers to verify, and entries auto-expire for your privacy.</string>

<key>NSCallDirectoryUsageDescription</key>
<string>verifd labels incoming calls from verified numbers so they ring like contacts. This helps you identify expected calls while screening unknowns.</string>

<key>NSUserActivityTypes</key>
<array>
    <string>com.verifd.expecting-call</string>
</array>
```

**CI Validation**:
```bash
# Check for required keys
REQUIRED_KEYS=("NSContactsUsageDescription" "NSCallDirectoryUsageDescription")
for key in "${REQUIRED_KEYS[@]}"; do
    if ! grep -q "<key>$key</key>" Info.plist; then
        echo "❌ Missing required privacy key: $key"
        exit 1
    fi
done
```

## Background Processing

### ✅ Allowed Background Tasks

```swift
// Cleanup expired vPasses
BGTaskScheduler.shared.register(
    forTaskWithIdentifier: "com.verifd.cleanup",
    using: nil
) { task in
    // Remove expired entries only
    self.cleanupExpiredPasses()
    task.setTaskCompleted(success: true)
}
```

### ❌ Forbidden Background Operations
- Sending messages
- Making network calls from extensions
- Creating contacts without user presence
- Modifying user data without consent

## Temporary Contact Strategy

### 30-Day vPass Implementation

```swift
// User-approved contact creation
func createThirtyDayPass(for number: String, name: String) {
    let contact = CNMutableContact()
    contact.givenName = name
    contact.organizationName = "verifd Pass"
    
    // Add expiry metadata
    contact.note = "Expires: \(expiryDate). Auto-created by verifd with your permission."
    
    // Phone number
    let phoneNumber = CNLabeledValue(
        label: "verifd",
        value: CNPhoneNumber(stringValue: number)
    )
    contact.phoneNumbers = [phoneNumber]
    
    // Save with user consent
    let saveRequest = CNSaveRequest()
    saveRequest.add(contact, toContainerWithIdentifier: nil)
    
    do {
        try CNContactStore().execute(saveRequest)
        scheduleExpiryCleanup(for: contact.identifier, at: expiryDate)
    } catch {
        // Fallback: Create contact group instead
        offerGroupCreationFallback()
    }
}
```

### Group Creation Fallback

When contact creation fails:
```swift
func offerGroupCreationFallback() {
    let alert = UIAlertController(
        title: "Contact Creation Failed",
        message: "Would you like to create a 'verifd Verified' group instead?",
        preferredStyle: .alert
    )
    
    alert.addAction(UIAlertAction(title: "Create Group", style: .default) { _ in
        self.createVerifiedGroup()
    })
    
    present(alert, animated: true)
}
```

## Shortcuts Integration

### 15-30 Minute Expecting Mode

```swift
// Document Shortcuts approach for temporary allowlist
/*
 * SHORTCUTS INTEGRATION (User-Controlled):
 * 
 * Users can create a Shortcut that:
 * 1. Accepts input: phone number + duration
 * 2. Writes to shared container
 * 3. Triggers Call Directory reload
 * 
 * Limitations:
 * - No automatic expiry in Call Directory
 * - User must run Shortcut again to remove
 * - Cannot be triggered programmatically
 */
```

## CI Enforcement

### Extension Network Check

```yaml
# Scan Call Directory for network usage
- name: Check Call Directory Extension
  run: |
    EXTENSION="apps/ios/CallDirectoryExtension/CallDirectoryHandler.swift"
    
    # Patterns that indicate network usage
    FORBIDDEN_PATTERNS=(
      "URLSession"
      "Alamofire"
      "AFNetworking"
      "dataTask"
      "downloadTask"
    )
    
    for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
      if grep -q "$pattern" "$EXTENSION" | grep -v "^//" ; then
        echo "❌ Network usage detected in Call Directory!"
        exit 1
      fi
    done
```

## Testing Checklist

### Pre-Submission Validation
- [ ] MFMessageComposeViewController for all SMS
- [ ] CNContactStore.requestAccess before contact operations
- [ ] Call Directory reads only from shared container
- [ ] No network calls in extensions
- [ ] Privacy descriptions > 20 characters
- [ ] Background tasks limited to cleanup
- [ ] Shortcuts documented but not automated
- [ ] All user actions require explicit consent

### App Review Preparation
- [ ] Screenshots show permission prompts
- [ ] Privacy policy covers all data usage
- [ ] TestFlight tested with real devices
- [ ] Call Directory tested offline
- [ ] Contact creation flow documented
- [ ] Background task purposes explained

## Common Rejection Scenarios

### Scenario 1: Automatic SMS
**Rejection**: "Your app appears to send messages without user interaction"
**Fix**: Always use MFMessageComposeViewController

### Scenario 2: Network Calls in Extension
**Rejection**: "Call Directory extension makes network requests"
**Fix**: Cache data in main app, read from shared container

### Scenario 3: Silent Contact Creation
**Rejection**: "Contacts are created without clear user consent"
**Fix**: Show explicit UI for contact creation approval

### Scenario 4: Generic Privacy Descriptions
**Rejection**: "Privacy descriptions don't explain actual usage"
**Fix**: Write specific descriptions for verifd's use case

## Emergency Override

For critical hotfixes only:
```bash
git commit -m "fix: critical security issue [skip-store-check]

Justification: CVE-2024-XXXX mitigation
Manual review: Confirmed no store violations
Risk owner: [Name]"
```

## Resources

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Call Directory Extension Guide](https://developer.apple.com/documentation/callkit/cxcalldirectoryprovider)
- [Contacts Framework Best Practices](https://developer.apple.com/documentation/contacts)
- [Background Tasks Documentation](https://developer.apple.com/documentation/backgroundtasks)

---

**Remember**: Apple reviewers test actual functionality, not just static analysis. Every user flow must respect privacy and require explicit consent. When in doubt, ask for permission.