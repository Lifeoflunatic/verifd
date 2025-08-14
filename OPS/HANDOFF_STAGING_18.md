# HANDOFF - Staging 18 Release

## Build Status: ✅ SUCCESS

### Release Details

- **Tag**: v1.3.0-rc1-staging.18
- **Build**: #45 (Run 16949333284)
- **Release URL**: https://github.com/Lifeoflunatic/verifd/releases/tag/v1.3.0-rc1-staging.18
- **APK Download**: https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging.18/verifd-staging.apk
- **SHA256**: 1e969137dcd6e9949c6089fd16e2ed813fef08a24cde8517e440e9065fe4dca0

### What's New in v1.3.0-rc1-staging.18

#### First-Run Setup Fixed (Tasks 1-6)

1. **Purely Runtime-Driven**: Setup card now checks `!hasCallScreeningRole() || !areNotificationsEnabled()` at runtime only
2. **No Preference Saving**: Removed all preference checks and saving - card is purely based on current state
3. **Live Updates**: Card refreshes on `onResume()` so changes take effect immediately after Settings return
4. **Backup Excluded**: Preferences already excluded from backup via `backup_rules.xml`
5. **QA Panel Status**: Added "SETUP STATUS" section showing runtime gate state
6. **Visual Injection**: Card appears at top of PassList when setup needed

### Implementation Details

#### MainActivity Changes

- Added `checkAndShowFirstRunSetup()` method that runs on `onCreate()` and `onResume()`
- Purely runtime check: `val needsSetup = !hasCallScreeningRole() || !areNotificationsEnabled()`
- Card visibility controlled dynamically based on runtime state
- No preference reading or writing for setup state

#### FirstRunSetupCard Changes

- Removed preference-based `shouldShow()` logic
- Dismiss button no longer saves preferences - purely visual
- `updateStatus()` refreshes UI based on current permissions

#### QAPanelV2Activity Changes

- Added "SETUP STATUS" section with:
  - Call Screening Role: ✅/❌
  - Notifications: ✅/❌
  - Setup Card Should Show: YES/NO
  - Runtime Gate Active: BLOCKING/PASSED

### Testing Instructions

1. **Install Fresh APK**
   - Uninstall any previous version
   - Install v1.3.0-rc1-staging.18
   - Open app - should see orange setup card

2. **Test Runtime Behavior**
   - Tap "SET" to grant call screening role
   - Tap "ENABLE" to grant notifications
   - Both buttons should disappear when granted
   - Card should auto-hide when both are granted

3. **Test Resume Behavior**
   - Grant one permission, leave one disabled
   - Navigate to Settings, revoke the granted permission
   - Return to app - setup card should reappear

4. **Verify in QA Panel**
   - Open QA Panel V2 (button or FAB)
   - Check "SETUP STATUS" section
   - Should show current permission states
   - "Runtime Gate Active" should match card visibility

### Known Behavior

- Setup card appears EVERY time app opens if permissions missing
- No way to permanently dismiss card without granting permissions
- This is intentional for staging builds to ensure proper setup

### Git Info

- Branch: release/staging-17
- HEAD: a6854f2 (fix QAPanelV2Activity string syntax errors)
- Parent: 27575d0 (make First-Run setup purely runtime-driven)

---

Generated: 2025-08-13T21:15:00Z
