#!/bin/bash
# Prepare iOS for TestFlight staging build

set -e

echo "================================================"
echo "Preparing iOS for TestFlight Staging Build"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

cd apps/ios

# Create Config directory if it doesn't exist
mkdir -p verifd/Config

# Create staging configuration file
echo -e "${YELLOW}Creating staging configuration...${NC}"

cat > verifd/Config/Staging.swift << 'EOF'
//
//  Staging.swift
//  verifd
//
//  Staging environment configuration
//

import Foundation

struct StagingConfig {
    static let apiBaseURL = "https://staging.api.verifd.com"
    static let environment = "staging"
    static let overrideUsers = [
        "+919233600392",  // Primary tester
        "+917575854485"   // Secondary tester
    ]
    static let expectedKID = "staging-2025-001"
}

// Override API configuration for staging
#if STAGING
extension APIConfig {
    static var baseURL: String {
        return StagingConfig.apiBaseURL
    }
    
    static var environment: String {
        return StagingConfig.environment
    }
}
#endif
EOF

# Create staging scheme
echo -e "${YELLOW}Creating Xcode staging scheme...${NC}"

cat > verifd.xcodeproj/xcshareddata/xcschemes/verifd-Staging.xcscheme << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1500"
   version = "1.3">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "YOUR_TARGET_ID"
               BuildableName = "verifd.app"
               BlueprintName = "verifd"
               ReferencedContainer = "container:verifd.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "YOUR_TARGET_ID"
            BuildableName = "verifd.app"
            BlueprintName = "verifd"
            ReferencedContainer = "container:verifd.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
      <EnvironmentVariables>
         <EnvironmentVariable
            key = "API_ENVIRONMENT"
            value = "staging"
            isEnabled = "YES">
         </EnvironmentVariable>
      </EnvironmentVariables>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      customArchiveName = "verifd-Staging"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
EOF

# Update Info.plist for staging
echo -e "${YELLOW}Updating Info.plist...${NC}"

# Backup original Info.plist
cp verifd/Info.plist verifd/Info.plist.backup

# Add staging configuration to Info.plist
/usr/libexec/PlistBuddy -c "Add :API_BASE_URL string https://staging.api.verifd.com" verifd/Info.plist 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :API_BASE_URL https://staging.api.verifd.com" verifd/Info.plist

/usr/libexec/PlistBuddy -c "Add :ENVIRONMENT string staging" verifd/Info.plist 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :ENVIRONMENT staging" verifd/Info.plist

# Create TestFlight export options
echo -e "${YELLOW}Creating TestFlight export options...${NC}"

cat > ExportOptions-Staging.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>REPLACE_WITH_TEAM_ID</string>
    <key>provisioningProfiles</key>
    <dict>
        <key>com.verifd.ios</key>
        <string>verifd Staging Distribution</string>
    </dict>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
    <key>stripSwiftSymbols</key>
    <true/>
    <key>thinning</key>
    <string>&lt;none&gt;</string>
    <key>signingStyle</key>
    <string>manual</string>
</dict>
</plist>
EOF

# Create build script for CI/CD
echo -e "${YELLOW}Creating build script...${NC}"

cat > build-testflight.sh << 'EOF'
#!/bin/bash
# Build and upload to TestFlight

set -e

# Configuration
SCHEME="verifd-Staging"
CONFIGURATION="Release"
ARCHIVE_PATH="build/verifd-staging.xcarchive"
EXPORT_PATH="build/verifd-staging-ipa"

# Clean
xcodebuild clean -scheme "$SCHEME"

# Archive
xcodebuild archive \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -archivePath "$ARCHIVE_PATH" \
    -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="REPLACE_WITH_TEAM_ID" \
    CODE_SIGN_STYLE="Manual" \
    OTHER_SWIFT_FLAGS="-DSTAGING"

# Export IPA
xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_PATH" \
    -exportOptionsPlist "ExportOptions-Staging.plist" \
    -allowProvisioningUpdates

# Upload to TestFlight
xcrun altool --upload-app \
    -f "${EXPORT_PATH}/verifd.ipa" \
    -t ios \
    -u "YOUR_APPLE_ID" \
    -p "YOUR_APP_SPECIFIC_PASSWORD"

echo "✓ Successfully uploaded to TestFlight!"
EOF

chmod +x build-testflight.sh

echo ""
echo "================================================"
echo -e "${GREEN}✓ iOS Staging Setup Complete!${NC}"
echo "================================================"
echo ""
echo "Next Steps:"
echo ""
echo "1. Update TEAM_ID in ExportOptions-Staging.plist"
echo "2. Open verifd.xcodeproj in Xcode"
echo "3. Select 'verifd-Staging' scheme"
echo "4. Update signing & capabilities:"
echo "   - Select your development team"
echo "   - Configure provisioning profile"
echo ""
echo "To build for TestFlight:"
echo "   Option A: Use Xcode"
echo "     - Product > Archive"
echo "     - Distribute App > App Store Connect"
echo ""
echo "   Option B: Use command line"
echo "     - Update build-testflight.sh with credentials"
echo "     - Run: ./build-testflight.sh"
echo ""
echo "Configuration:"
echo "   API: https://staging.api.verifd.com"
echo "   Environment: staging"
echo "   Override users: +919233600392, +917575854485"
echo ""