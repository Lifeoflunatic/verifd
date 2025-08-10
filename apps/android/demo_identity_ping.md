# Identity Ping Demo - Step by Step

## Demo Scenario
**Situation**: Unknown number +1-555-123-4567 just called you  
**Goal**: Send them an Identity Ping with verification link

## Demo Flow

### 1. Post-Call Sheet Appears
```
┌─────────────────────────────────────┐
│            Unknown Caller           │
├─────────────────────────────────────┤
│          (555) 123-4567            │
├─────────────────────────────────────┤
│ Choose SIM: ○ SIM 1  ○ SIM 2       │ (if dual-SIM)
├─────────────────────────────────────┤
│  Verification                       │
│  [Send Identity Ping]               │ ← Demo button
├─────────────────────────────────────┤
│  Grant vPass (Local Allowlist)      │
│  [24h vPass] [30d vPass]           │
├─────────────────────────────────────┤
│  [Block]          [Dismiss]        │
└─────────────────────────────────────┘
```

### 2. User Taps "Send Identity Ping"
Dialog appears:
```
┌─────────────────────────────────────┐
│        Send Identity Ping           │
├─────────────────────────────────────┤
│ Send verification request to        │
│ (555) 123-4567?                    │
│                                     │
│ This will open your SMS app with    │
│ a pre-filled message.               │
├─────────────────────────────────────┤
│           [Open SMS] [Cancel]       │
└─────────────────────────────────────┘
```

### 3. Backend API Call (Behind the Scenes)
```
POST http://10.0.2.2:3000/api/verify/start
Content-Type: application/json

{
  "phoneNumber": "+15551234567",
  "name": "Unknown",
  "reason": "call verification"
}

Response:
{
  "success": true,
  "token": "kJ8sN2mP9xR4tL6vQ3yZ1wE5cG7bH0",
  "verifyUrl": "http://localhost:3001/verify/kJ8sN2mP9xR4tL6vQ3yZ1wE5cG7bH0",
  "expiresIn": 900
}
```

### 4. SMS Composer Opens
Default SMS app opens with pre-filled message:

**To**: (555) 123-4567  
**Message**: "Hey—it's Unknown. I screen unknown calls. Reply with Name + Reason or tap to verify: http://localhost:3001/verify/kJ8sN2mP9xR4tL6vQ3yZ1wE5cG7bH0"

### 5. User Sends Manually
User reviews message and taps **Send** in their SMS app

### 6. Recipient Experience
Unknown caller receives:
```
From: Your Number
Hey—it's Unknown. I screen unknown calls. 
Reply with Name + Reason or tap to verify: 
http://localhost:3001/verify/kJ8sN2mP...
```

They can either:
- **Reply with text**: "John from ABC Company regarding your inquiry"
- **Tap link**: Opens web form to enter name/reason

## Technical Implementation

### SmsUtils.kt - Core Logic
```kotlin
// 1. Call backend to get verification link
val response = SmsUtils.launchIdentityPingComposer(
    context = this@PostCallActivity,
    phoneNumber = "+15551234567",
    yourName = "Unknown",
    reason = "call verification",
    subscription = selectedSim  // null = system picker
)

// 2. Creates ACTION_SENDTO intent
val smsUri = Uri.parse("sms:+15551234567")
val intent = Intent(Intent.ACTION_SENDTO, smsUri).apply {
    putExtra("sms_body", formattedMessage)
    subscription?.let {
        putExtra("subscription_id", it.subscriptionId)
        putExtra("slot_id", it.simSlotIndex) 
    }
}

// 3. Launch SMS app
context.startActivity(intent)
```

### PostCallActivity.kt - UI Integration
```kotlin
private fun sendIdentityPing() {
    lifecycleScope.launch {
        val response = SmsUtils.launchIdentityPingComposer(...)
        
        if (response.success) {
            Toast.makeText(this, "SMS composer opened", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "Error: ${response.error}", Toast.LENGTH_LONG).show()
        }
    }
}
```

## Dual-SIM Behavior

### Single SIM Device
- Button works immediately
- Uses default SMS app settings

### Dual-SIM Device  
- User selects SIM 1 or SIM 2
- Intent includes subscription extras:
```kotlin
putExtra("subscription_id", subscription.subscriptionId)
putExtra("slot_id", subscription.simSlotIndex)
```
- SMS app honors SIM selection (most modern apps do)
- Falls back to system picker if app doesn't support extras

## Error Handling

### Network Issues
```
Toast: "Failed to create Identity Ping: Network error: Unable to connect"
```

### No SMS App
```
Toast: "Failed to create Identity Ping: No SMS app available"
```

### Backend Error
```
Toast: "Failed to create Identity Ping: Server error: 500"
```

## Demo Success Criteria ✅

- [x] Demo button in post-call sheet opens composer with body
- [x] Handles dual-SIM gracefully (with fallback)  
- [x] Uses ACTION_SENDTO (no SEND_SMS permission)
- [x] Dynamic links from backend /verify/start
- [x] Store compliant - user sends manually
- [x] Proper error handling and user feedback

**Ready for live demo!** 🚀