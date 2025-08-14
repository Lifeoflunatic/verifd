#!/bin/bash
# Build staging APK and prepare iOS for TestFlight

set -e

echo "========================================="
echo "Building Staging Apps for QA Testing"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Build timestamp
BUILD_TIME=$(date +"%Y%m%d_%H%M%S")
BUILD_DIR="builds/staging_${BUILD_TIME}"

echo -e "${YELLOW}Creating build directory: ${BUILD_DIR}${NC}"
mkdir -p "$BUILD_DIR"

# =====================
# Android APK Build
# =====================
echo ""
echo -e "${GREEN}Building Android Staging APK...${NC}"
echo "--------------------------------"

cd apps/android

# Clean previous builds
./gradlew clean

# Build staging APK
echo "Running: ./gradlew assembleStaging"
./gradlew assembleStaging

# Find the APK
APK_PATH=$(find app/build/outputs/apk/staging -name "*.apk" | head -1)

if [ -z "$APK_PATH" ]; then
    echo -e "${RED}Error: APK not found!${NC}"
    exit 1
fi

# Copy APK to build directory
APK_NAME="verifd-staging-${BUILD_TIME}.apk"
cp "$APK_PATH" "../../${BUILD_DIR}/${APK_NAME}"

echo -e "${GREEN}✓ APK built successfully${NC}"
echo "  Location: ${BUILD_DIR}/${APK_NAME}"
echo "  Size: $(du -h ../../${BUILD_DIR}/${APK_NAME} | cut -f1)"

cd ../..

# =====================
# iOS TestFlight Build
# =====================
echo ""
echo -e "${GREEN}Preparing iOS for TestFlight...${NC}"
echo "--------------------------------"

cd apps/ios

# Create staging configuration
cat > verifd/Config/Staging.xcconfig << 'EOF'
// Staging Configuration
API_BASE_URL = https://staging.api.verifd.com
ENVIRONMENT = staging
PRODUCT_BUNDLE_IDENTIFIER = com.verifd.ios.staging
APP_DISPLAY_NAME = verifd Staging
EOF

# Update Info.plist for staging
echo "Updating Info.plist for staging environment..."
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'verifd Staging'" verifd/Info.plist || true
/usr/libexec/PlistBuddy -c "Add :API_BASE_URL string https://staging.api.verifd.com" verifd/Info.plist || true
/usr/libexec/PlistBuddy -c "Add :ENVIRONMENT string staging" verifd/Info.plist || true

# Create export options for TestFlight
cat > ExportOptions.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>YOUR_TEAM_ID</string>
    <key>uploadSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
    <key>thinning</key>
    <string>&lt;none&gt;</string>
</dict>
</plist>
EOF

echo -e "${YELLOW}iOS TestFlight preparation complete.${NC}"
echo "Next steps for iOS:"
echo "1. Open verifd.xcworkspace in Xcode"
echo "2. Select 'verifd Staging' scheme"
echo "3. Archive (Product > Archive)"
echo "4. Upload to TestFlight"

cd ../..

# =====================
# Generate QR Codes
# =====================
echo ""
echo -e "${GREEN}Generating distribution info...${NC}"
echo "--------------------------------"

# Create distribution README
cat > "${BUILD_DIR}/README.md" << EOF
# verifd Staging Builds
Built: $(date +"%Y-%m-%d %H:%M:%S")

## Android APK
- File: ${APK_NAME}
- Install: Enable "Unknown sources" and install APK
- API: https://staging.api.verifd.com

## iOS TestFlight
- Scheme: verifd Staging
- Bundle ID: com.verifd.ios.staging
- API: https://staging.api.verifd.com

## Test Accounts (Override Users)
1. +919233600392 - Primary Tester
2. +917575854485 - Secondary Tester

These numbers receive 100% feature enablement regardless of cohort.

## Configuration Verification
\`\`\`bash
curl https://staging.api.verifd.com/config/staging-overrides
\`\`\`

Expected KID: staging-2025-001
EOF

# =====================
# Upload preparation
# =====================
echo ""
echo -e "${GREEN}Preparing for distribution...${NC}"
echo "--------------------------------"

# Create a simple HTTP server script for APK distribution
cat > "${BUILD_DIR}/serve.py" << 'EOF'
#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
    print(f"Serving APK at http://localhost:{PORT}")
    print(f"APK URL: http://localhost:{PORT}/$(ls *.apk)")
    print("Press Ctrl+C to stop")
    httpd.serve_forever()
EOF

chmod +x "${BUILD_DIR}/serve.py"

# =====================
# Summary
# =====================
echo ""
echo "========================================="
echo -e "${GREEN}Build Complete!${NC}"
echo "========================================="
echo ""
echo "Android APK:"
echo "  ${BUILD_DIR}/${APK_NAME}"
echo ""
echo "To serve APK locally:"
echo "  cd ${BUILD_DIR} && python3 serve.py"
echo ""
echo "iOS TestFlight:"
echo "  1. Open apps/ios/verifd.xcworkspace"
echo "  2. Archive and upload to TestFlight"
echo ""
echo "Configuration:"
echo "  API: https://staging.api.verifd.com"
echo "  KID: staging-2025-001"
echo ""
echo "Test with:"
echo "  ./scripts/test-staging-config.sh https://staging.api.verifd.com"
echo ""