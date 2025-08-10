# verifd v0.1.1 — Build Requirements

## Quick Setup for Local Demo Builds

### Android Debug Builds

**Prerequisites:**
```bash
# macOS (Homebrew)
brew install --cask temurin@17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# Install Android SDK + build tools
brew install --cask android-commandlinetools
sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools" --licenses
```

**Build Commands:**
```bash
cd apps/android
./gradlew :app:assembleDebug    # → APK at app/build/outputs/apk/debug/
./gradlew :app:bundleDebug      # → AAB at app/build/outputs/bundle/debug/
```

### iOS Debug Archive

**Prerequisites:**
```bash
# Install full Xcode (not just command line tools)
# Available from Mac App Store or Apple Developer portal
sudo xcode-select -s /Applications/Xcode.app
```

**Build Commands:**
```bash
# Set Development Team and unique bundle IDs in Xcode first
open apps/ios/verifd.xcodeproj

# Command line build
xcodebuild -project apps/ios/verifd.xcodeproj \
  -scheme verifd -configuration Debug \
  -destination 'generic/platform=iOS' \
  -archivePath build/verifd.xcarchive archive
```

## CI/CD Integration (Optional)

### GitHub Actions - Android
```yaml
# Add to .github/workflows/ci.yml
android-build:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-java@v4
      with: { distribution: 'temurin', java-version: '17' }
    - uses: android-actions/setup-android@v3
    - run: sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools" --licenses
    - run: ./gradlew :app:assembleDebug :app:bundleDebug
      working-directory: apps/android
    - uses: actions/upload-artifact@v4
      with:
        name: android-debug-builds
        path: |
          apps/android/app/build/outputs/apk/debug/*.apk
          apps/android/app/build/outputs/bundle/debug/*.aab
```

### Environment Variables

**Backend (`apps/backend/.env`):**
```bash
LOG_SALT=your-secure-salt-here
API_RATE_LIMIT_IP=10
API_RATE_LIMIT_PHONE=5
CORS_ORIGIN=http://localhost:3000
```

**Web-verify (`apps/web-verify/.env.local`):**
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

## Health Check Endpoints

- `GET /healthz` - Backend health check
- `POST /verify/start` - Token generation
- `GET /v/<token>` - Vanity URL redirect
- `GET /pass/check` - vPass verification

## Current Status

✅ **Git Repository**: https://github.com/Lifeoflunatic/verifd.git  
✅ **Version**: v0.1.1-alpha pushed to main  
✅ **Tests**: 18 passed, 1 skipped - all green  
✅ **CHANGELOG**: Complete release documentation  
✅ **Artifacts**: Screenshots and test reports in `/handoff/artifacts/`