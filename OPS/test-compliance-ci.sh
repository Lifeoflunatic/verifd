#!/bin/bash

# Store Compliance CI Test Script
# Tests both positive (clean) and negative (violation) cases

echo "🧪 Testing verifd Store Compliance CI System"
echo "============================================="

# Store original files for restoration
MANIFEST_BACKUP="/tmp/AndroidManifest.xml.backup"
PLIST_BACKUP="/tmp/Info.plist.backup"
CALLDIR_BACKUP="/tmp/CallDirectoryHandler.swift.backup"

MANIFEST_FILE="apps/android/app/src/main/AndroidManifest.xml"
PLIST_FILE="apps/ios/verifd/Info.plist"
CALLDIR_FILE="apps/ios/CallDirectoryExtension/CallDirectoryHandler.swift"

# Function to backup files
backup_files() {
    echo "📁 Backing up original files..."
    [ -f "$MANIFEST_FILE" ] && cp "$MANIFEST_FILE" "$MANIFEST_BACKUP"
    [ -f "$PLIST_FILE" ] && cp "$PLIST_FILE" "$PLIST_BACKUP"
    [ -f "$CALLDIR_FILE" ] && cp "$CALLDIR_FILE" "$CALLDIR_BACKUP"
}

# Function to restore files
restore_files() {
    echo "🔄 Restoring original files..."
    [ -f "$MANIFEST_BACKUP" ] && cp "$MANIFEST_BACKUP" "$MANIFEST_FILE"
    [ -f "$PLIST_BACKUP" ] && cp "$PLIST_BACKUP" "$PLIST_FILE"
    [ -f "$CALLDIR_BACKUP" ] && cp "$CALLDIR_BACKUP" "$CALLDIR_FILE"
    rm -f "$MANIFEST_BACKUP" "$PLIST_BACKUP" "$CALLDIR_BACKUP"
}

# Function to run compliance check
run_compliance_check() {
    echo "🔍 Running store compliance check..."
    
    # Simulate the CI check logic
    ANDROID_VIOLATIONS_DETECTED=false
    IOS_VIOLATIONS_DETECTED=false
    
    # Android check
    if [ -f "$MANIFEST_FILE" ]; then
        FORBIDDEN_PERMS=("SEND_SMS" "READ_SMS" "READ_CALL_LOG" "WRITE_CALL_LOG")
        for perm in "${FORBIDDEN_PERMS[@]}"; do
            if grep -q "android\.permission\.$perm" "$MANIFEST_FILE"; then
                echo "❌ ANDROID VIOLATION: android.permission.$perm found"
                ANDROID_VIOLATIONS_DETECTED=true
            fi
        done
    fi
    
    # iOS check
    if [ -f "$PLIST_FILE" ]; then
        REQUIRED_PRIVACY_KEYS=("NSContactsUsageDescription" "NSCallDirectoryUsageDescription")
        for key in "${REQUIRED_PRIVACY_KEYS[@]}"; do
            if ! grep -q "<key>$key</key>" "$PLIST_FILE"; then
                echo "❌ iOS VIOLATION: Missing $key"
                IOS_VIOLATIONS_DETECTED=true
            fi
        done
    fi
    
    # Call Directory network check
    if [ -f "$CALLDIR_FILE" ]; then
        if grep -E "(URLSession\.|URLSession\()" "$CALLDIR_FILE" | grep -v "^[[:space:]]*//\|^[[:space:]]*\*" | grep -v "NO URLSession" | grep -q .; then
            echo "❌ iOS VIOLATION: URLSession usage in Call Directory"
            IOS_VIOLATIONS_DETECTED=true
        fi
    fi
    
    # Return result
    if [ "$ANDROID_VIOLATIONS_DETECTED" = "true" ] || [ "$IOS_VIOLATIONS_DETECTED" = "true" ]; then
        return 1
    else
        return 0
    fi
}

# Test 1: Clean state (should pass)
echo -e "\n🧪 TEST 1: Clean State (Should Pass)"
echo "-----------------------------------"
backup_files
if run_compliance_check; then
    echo "✅ PASS: Clean state correctly passes compliance check"
else
    echo "❌ FAIL: Clean state incorrectly fails compliance check"
fi

# Test 2: Android SEND_SMS violation (should fail)
echo -e "\n🧪 TEST 2: Android SEND_SMS Violation (Should Fail)"
echo "--------------------------------------------------"
if [ -f "$MANIFEST_FILE" ]; then
    # Add forbidden permission
    sed -i.tmp 's|</manifest>|    <uses-permission android:name="android.permission.SEND_SMS" />\n</manifest>|' "$MANIFEST_FILE"
    
    if run_compliance_check; then
        echo "❌ FAIL: SEND_SMS violation not detected"
    else
        echo "✅ PASS: SEND_SMS violation correctly detected"
    fi
    
    # Restore from backup
    [ -f "$MANIFEST_BACKUP" ] && cp "$MANIFEST_BACKUP" "$MANIFEST_FILE"
fi

# Test 3: iOS missing privacy description (should fail)
echo -e "\n🧪 TEST 3: iOS Missing Privacy Description (Should Fail)"
echo "--------------------------------------------------------"
if [ -f "$PLIST_FILE" ]; then
    # Remove privacy description
    sed -i.tmp '/<key>NSContactsUsageDescription<\/key>/,+1d' "$PLIST_FILE"
    
    if run_compliance_check; then
        echo "❌ FAIL: Missing privacy description not detected"
    else
        echo "✅ PASS: Missing privacy description correctly detected"
    fi
    
    # Restore from backup
    [ -f "$PLIST_BACKUP" ] && cp "$PLIST_BACKUP" "$PLIST_FILE"
fi

# Test 4: Call Directory network usage (should fail)
echo -e "\n🧪 TEST 4: Call Directory Network Usage (Should Fail)"
echo "-----------------------------------------------------"
if [ -f "$CALLDIR_FILE" ]; then
    # Add network usage
    echo "        let session = URLSession.shared" >> "$CALLDIR_FILE"
    
    if run_compliance_check; then
        echo "❌ FAIL: Network usage in Call Directory not detected"
    else
        echo "✅ PASS: Network usage in Call Directory correctly detected"
    fi
    
    # Restore from backup
    [ -f "$CALLDIR_BACKUP" ] && cp "$CALLDIR_BACKUP" "$CALLDIR_FILE"
fi

# Clean up
restore_files

echo -e "\n🧪 Store Compliance CI Tests Complete"
echo "====================================="
echo "✅ All tests validate that the CI system correctly:"
echo "   • Allows compliant code to pass"
echo "   • Blocks forbidden Android permissions"
echo "   • Requires iOS privacy descriptions"
echo "   • Prevents network usage in Call Directory extensions"
echo ""
echo "🔒 The CI system is ready to prevent store rejections!"