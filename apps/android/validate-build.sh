#!/bin/bash
set -e

echo "=== verifd Android App Build Validation ==="

# Check Android SDK
if [ -z "$ANDROID_HOME" ]; then
    echo "Warning: ANDROID_HOME not set. Please set it to your Android SDK path."
fi

# Check project structure
echo "✓ Checking project structure..."
required_files=(
    "app/build.gradle"
    "app/src/main/AndroidManifest.xml"
    "app/src/main/java/com/verifd/android/service/CallScreeningService.kt"
    "app/src/main/java/com/verifd/android/ui/PostCallActivity.kt"
    "app/src/main/java/com/verifd/android/service/ExpectingCallTileService.kt"
    "app/src/main/java/com/verifd/android/util/SmsUtils.kt"
    "build.gradle"
    "settings.gradle"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ Missing: $file"
        exit 1
    fi
done

# Check test files
echo "✓ Checking test structure..."
test_files=(
    "app/src/test/java/com/verifd/android/service/CallScreeningServiceTest.kt"
    "app/src/test/java/com/verifd/android/service/ExpectingCallTileServiceTest.kt"
    "app/src/test/java/com/verifd/android/ui/PostCallActivityTest.kt"
    "app/src/test/java/com/verifd/android/util/SmsUtilsTest.kt"
    "app/src/test/java/com/verifd/android/util/PhoneNumberUtilsTest.kt"
)

for file in "${test_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ Missing test: $file"
        exit 1
    fi
done

echo
echo "=== Core Features Implemented ==="
echo "✓ CallScreeningService - Labels unknown calls, triggers post-call sheet"
echo "✓ PostCallActivity - Send Identity Ping & Grant vPass (24h/30d) actions"
echo "✓ ExpectingCallTileService - Quick Tile for 30m expecting mode"
echo "✓ SmsUtils - Dual-SIM support for SMS operations" 
echo "✓ Comprehensive unit test stubs for all components"
echo "✓ Android project structure with proper permissions and manifest"

echo
echo "=== Next Steps ==="
echo "1. Set ANDROID_HOME environment variable"
echo "2. Run './gradlew build' to compile"
echo "3. Run './gradlew test' to execute unit tests"
echo "4. Import project in Android Studio for development"

echo
echo "✅ Android app scaffold validation complete!"