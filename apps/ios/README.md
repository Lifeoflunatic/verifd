# verifd iOS App

Out-of-band call verification for iOS with privacy-first, store-safe implementation.

## Overview

verifd allows users to create temporary verification passes for legitimate callers through out-of-band verification (SMS/WhatsApp link or voice ping). The iOS app uses **temporary contacts** and **Call Directory Extension** to enable verified callers to ring through like known contacts.

## Features

### Core Verification Types
- **15-30 minute passes**: Shortcut mode using iOS Shortcuts integration
- **24-hour passes**: Stored in shared container, labeled via Call Directory
  - ⚠️ **Important**: 24-hour passes only provide caller ID labels. If "Silence Unknown Callers" is enabled in iOS Settings, these calls will still be silenced. Use 30-day passes for guaranteed ring-through.
- **30-day passes**: Creates temporary contact in "verifd Passes" group
  - ✅ **Guaranteed ring**: Works even with "Silence Unknown Callers" enabled

### Privacy-First Design
- **No background contact creation** - all contact operations require explicit user confirmation
- **Explicit permissions** - requests contacts access only when user approves a caller
- **Automatic cleanup** - expired passes are purged via background tasks
- **Local data only** - Call Directory extension reads exclusively from app container

## Setup Instructions

### 1. Import "Expecting a Call" Shortcut

The app integrates with iOS Shortcuts for 15-30 minute verification windows:

1. Open the verifd app
2. Tap "Expecting Call (15-30m)" button
3. This activates a 30-minute window where verified calls will be labeled
4. Alternatively, create a custom Shortcut:
   - Open Shortcuts app
   - Create new shortcut named "Expecting a Call"
   - Add action: Open App → verifd
   - Add to Siri or Control Center

### 2. Enable Call Directory Extension

To see verified caller labels in the Phone app:

1. Go to **Settings > Phone > Call Blocking & Identification**
2. Enable **verifd** under "Allow These Apps To Block Calls And Provide Caller ID"
3. The extension will now label verified callers with "✓ Name (verifd)"

### 3. Configure Contacts Permission

For 30-day verification passes (creates temporary contacts):

1. The app will request contacts permission when you first approve a caller
2. If denied, you can enable later in **Settings > Privacy & Security > Contacts > verifd**
3. Without contacts permission, the app can still create 15-30 minute and 24-hour passes

## Security & Privacy

### Short-Window Allow Security Implications

**15-30 minute "Expecting Call" mode:**
- ✅ **Safe**: Limited time window reduces risk
- ✅ **User-controlled**: Manually activated, auto-expires
- ⚠️ **Consideration**: During active window, any verified caller (from your verification history) can reach you
- 🛡️ **Mitigation**: Window automatically expires, user can disable anytime

**Best practices for short-window mode:**
- Only activate when you're actually expecting a specific call
- Be aware that any previously verified number can reach you during the window
- Use 24-hour or 30-day passes for trusted, recurring callers instead

### Data Storage
- **Temporary contacts**: Stored in device Contacts app with clear "verifd Pass" labeling
- **Verification data**: Stored in app group container, accessible only to main app and Call Directory extension
- **No cloud sync**: All verification data stays on-device

### Background Cleanup
- Expired temporary contacts are automatically removed
- Verification data is cleaned up every 4 hours via background app refresh
- No manual cleanup required

## App Store Compliance

This implementation follows strict iOS App Store guidelines:

### Contact Handling
- ✅ **Explicit user permission** required before any contact creation
- ✅ **User-initiated only** - no automatic or background contact insertion
- ✅ **Clear labeling** - all temporary contacts clearly marked as "verifd Pass"
- ✅ **Automatic cleanup** - expired contacts are automatically removed

### Call Directory Extension
- ✅ **Local data only** - no network calls within extension
- ✅ **Shared container access** - reads only from app group container
- ✅ **Robust error handling** - gracefully handles missing or corrupted data
- ✅ **Store compliance guards** - prevents any potential network operations

### Privacy Labels
When submitting to App Store, declare:
- **Contacts**: Used to create temporary 30-day verification passes (user permission required)
- **Phone Numbers**: Stored locally for call identification (not shared with third parties)

## Architecture

```
verifd iOS App
├── Main App
│   ├── ViewController - UI and user interactions
│   ├── VerifdPassManager - Core verification logic
│   ├── BackgroundTaskManager - Cleanup operations
│   └── DenyAfterExpiryFallback - Post-expiry handling
├── Call Directory Extension
│   └── CallDirectoryHandler - Labels verified calls
└── Shared Container
    ├── verified_numbers.json - Verification data
    └── shortcut_mode.json - Active shortcut status
```

## Development Notes

### Building & Testing
- Requires iOS 14.0+ (for Call Directory and background tasks)
- Test with both iPhone and iPad layouts
- Verify Call Directory extension works in Settings > Phone

### Key Implementation Details
- **Store-safe contact creation**: Always requests permission, handles group creation failures gracefully
- **Background task limits**: iOS allows limited background execution - cleanup tasks are designed to work within these constraints
- **Extension isolation**: Call Directory extension has no network access and reads only local data

## Important: Silence Unknown Callers Behavior

iOS "Silence Unknown Callers" setting affects verification passes differently:

### 24-Hour Passes (Label-Only)
- ❌ **Will NOT ring** if "Silence Unknown Callers" is enabled
- ✅ **Will show caller ID label** in Phone app and call log
- 💡 **Solution**: App offers "Add 30-day temp contact" button in success dialog

### 30-Day Passes (Temp Contacts) 
- ✅ **Will ring normally** regardless of "Silence Unknown Callers" setting
- ✅ **Shows in contacts** with clear "verifd Pass" labeling
- ✅ **Auto-cleanup** when expired

### User Control
The app clearly communicates this difference:
- Success message for 24-hour: *"24-hour pass created (label-only). If Silence Unknown Callers is ON, add a 30-day temp contact to ring."*
- Includes user-initiated button: *"Add 30-day temp contact"*
- No automatic contact creation - user must explicitly choose

## Troubleshooting

### Call Directory Not Working
1. Check **Settings > Phone > Call Blocking & Identification**
2. Ensure verifd is enabled
3. Try disabling and re-enabling the extension
4. Restart the Phone app

### Verified Calls Not Ringing (Silence Unknown Callers)
1. Check if **Settings > Phone > Silence Unknown Callers** is enabled
2. For 24-hour passes: Use "Add 30-day temp contact" in success dialog
3. For guaranteed ring-through: Always choose 30-day passes during verification

### Contacts Permission Issues
1. Check **Settings > Privacy & Security > Contacts**
2. Ensure verifd has permission
3. If still issues, try creating a test contact manually to verify contacts access

### Shortcut Mode Not Working
1. Verify the shortcut button shows "Shortcut Active" when pressed
2. Check if your verification data exists (approve at least one caller first)
3. Shortcut mode only affects previously verified numbers

## Files

- `ViewController.swift`: Main UI and user interaction handling
- `VerifdPassManager.swift`: Core pass management with store-safe contact creation
- `CallDirectoryHandler.swift`: Call labeling extension (store-compliant)
- `BackgroundTaskManager.swift`: Background purge system
- `DenyAfterExpiryFallback.swift`: Post-expiry handling

## Support

For technical issues or questions, refer to the main verifd documentation or contact support through the app.