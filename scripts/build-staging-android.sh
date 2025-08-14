#!/bin/bash
# Build staging Android APK with correct configuration

set -e

echo "================================================"
echo "Building verifd Staging APK for QA Testing"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Ensure we're in the Android directory
cd apps/android

# Check if gradlew exists
if [ ! -f "./gradlew" ]; then
    echo -e "${RED}Error: gradlew not found in apps/android${NC}"
    exit 1
fi

# Make gradlew executable
chmod +x ./gradlew

# Clean previous builds
echo -e "${YELLOW}Cleaning previous builds...${NC}"
./gradlew clean

# Update staging configuration in build.gradle
echo -e "${YELLOW}Verifying staging configuration...${NC}"

# Check that staging build type exists
if ! grep -q "staging {" app/build.gradle; then
    echo -e "${RED}Error: Staging build type not found in build.gradle${NC}"
    exit 1
fi

# Build staging APK
echo -e "${GREEN}Building staging APK...${NC}"
./gradlew assembleStaging

# Find the generated APK
APK_PATH=$(find app/build/outputs/apk/staging -name "*.apk" 2>/dev/null | head -1)

if [ -z "$APK_PATH" ]; then
    echo -e "${RED}Error: APK not found after build!${NC}"
    echo "Looking in: app/build/outputs/apk/staging/"
    ls -la app/build/outputs/apk/staging/ 2>/dev/null || echo "Directory not found"
    exit 1
fi

# Create distribution directory
DIST_DIR="../../dist/staging"
mkdir -p "$DIST_DIR"

# Copy APK with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
APK_NAME="verifd-staging-${TIMESTAMP}.apk"
cp "$APK_PATH" "${DIST_DIR}/${APK_NAME}"

# Also create a 'latest' symlink
cd "$DIST_DIR"
ln -sf "$APK_NAME" "verifd-staging-latest.apk"
cd - > /dev/null

# Generate build info
cat > "${DIST_DIR}/build-info.json" << EOF
{
  "build_time": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "apk_name": "${APK_NAME}",
  "api_endpoint": "https://staging.api.verifd.com",
  "environment": "staging",
  "override_users": [
    "+919233600392",
    "+917575854485"
  ],
  "kid": "staging-2025-001"
}
EOF

# Calculate APK size
APK_SIZE=$(du -h "${DIST_DIR}/${APK_NAME}" | cut -f1)

echo ""
echo "================================================"
echo -e "${GREEN}✓ Staging APK Built Successfully!${NC}"
echo "================================================"
echo ""
echo "APK Details:"
echo "  File: ${DIST_DIR}/${APK_NAME}"
echo "  Size: ${APK_SIZE}"
echo "  API: https://staging.api.verifd.com"
echo ""
echo "Override Test Users:"
echo "  +919233600392 (Primary)"
echo "  +917575854485 (Secondary)"
echo ""
echo "To install on device:"
echo "  1. Enable 'Unknown sources' in Settings"
echo "  2. Transfer APK to device"
echo "  3. Open APK file to install"
echo ""
echo "Or serve locally:"
echo "  cd ${DIST_DIR}"
echo "  python3 -m http.server 8080"
echo "  Visit: http://<your-ip>:8080/${APK_NAME}"
echo ""