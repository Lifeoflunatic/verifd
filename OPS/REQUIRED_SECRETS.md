# Required GitHub Secrets Configuration

## Android Secrets (for Play Store deployment)

These are currently NOT required since we're only building staging APKs with debug signing.
When ready for production, add these:

- `ANDROID_KEYSTORE_BASE64` - Base64 encoded keystore file
- `ANDROID_KEY_ALIAS` - Key alias in the keystore
- `ANDROID_KEY_PASSWORD` - Password for the key
- `ANDROID_STORE_PASSWORD` - Password for the keystore

To generate for testing:

```bash
# Create a keystore (DO NOT use for production)
keytool -genkey -v -keystore verifd.keystore -alias verifd -keyalg RSA -keysize 2048 -validity 10000

# Convert to base64
base64 verifd.keystore > keystore.base64
```

## iOS Secrets (for TestFlight deployment)

Currently the iOS workflow is disabled. When ready, add:

- `APPLE_TEAM_ID` - Your Apple Developer Team ID
- `APP_STORE_CONNECT_API_KEY_ID` - App Store Connect API Key ID
- `APP_STORE_CONNECT_API_KEY_ISSUER_ID` - API Key Issuer ID
- `APP_STORE_CONNECT_API_KEY_BASE64` - Base64 encoded .p8 key file
- `MATCH_PASSWORD` - Password for Match certificates
- `IOS_EXPORT_OPTIONS_BASE64` - Base64 encoded ExportOptions.plist

## Notification Secrets (optional)

- `SLACK_WEBHOOK_URL` - For build notifications (optional)
- `RELEASE_SLACK_WEBHOOK` - For release notifications (optional)

## How to Add Secrets

1. Go to https://github.com/Lifeoflunatic/verifd/settings/secrets/actions
2. Click "New repository secret"
3. Add name and value
4. Click "Add secret"

## Current Status

- ✅ Android staging builds work without secrets (debug signing)
- ⚠️ iOS builds are disabled (workflow exists but won't run)
- ⚠️ Slack notifications are disabled (workflows skip if webhook missing)

## Recommendation

For now, these secrets are NOT urgently needed because:

1. Android staging APKs use debug signing (working fine)
2. iOS workflow is effectively disabled
3. Slack notifications gracefully skip when webhook is missing

Add these secrets only when you're ready for:

- Production Android releases to Play Store
- iOS TestFlight distributions
- Slack notifications for builds
