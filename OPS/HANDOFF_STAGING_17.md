# HANDOFF - Staging 17 Release

## Build Status: ✅ SUCCESS

### Release Details
- **Tag**: v1.3.0-rc1-staging.17
- **Build**: #43 (Run 16948382749)
- **Release URL**: https://github.com/Lifeoflunatic/verifd/releases/tag/v1.3.0-rc1-staging.17
- **APK Download**: https://github.com/Lifeoflunatic/verifd/releases/download/v1.3.0-rc1-staging.17/verifd-staging.apk

### Completed Tasks

#### 1. Repository Guardrails ✅
- Created `.github/CODEOWNERS` with review requirements
- Added `.github/pull_request_template.md` requiring HANDOFF checks
- Created `OPS/BRANCH_TAG_POLICY.md` documenting branching strategy
- Created `OPS/BRANCH_PROTECTION_APPLIED.md` with protection details

#### 2. CI Guardrails ✅
- Made `release_tag` required for workflow_dispatch
- Added comprehensive APK stamp verification:
  - Verifies versionName matches release_tag
  - Checks for [STAGING] marker in app name
  - Validates BuildConfig values (IS_STAGING, API URL)
  - Creates BUILD_ENV.txt audit trail
  - Fails with `APK_STAMP_MISMATCH` on discrepancies

#### 3. Branch Protection ✅
- Applied to `main` branch:
  - Required check: "Build Staging APK"
  - PR reviews required with code owner approval
  - Linear history enforced
- Applied to `release/staging-17` branch:
  - Required checks: "Build Staging APK", "APK Stamp Verification"
  - Same review requirements as main

#### 4. Build Issues & Fixes ✅

**Root Causes of Build Failures:**
1. **Gradle Parameter Issue**: Workflow was passing `-PreleaseTag` but Gradle property checker was case-sensitive
2. **Kotlin String Syntax Errors**: Multi-line strings in QAPanelV2Activity had unescaped newlines breaking compilation
3. **Missing Variable Definition**: vPassCache was referenced but never declared in ContactRepository
4. **Context Scope Error**: CallScreeningService was passing wrong `this` context (StringBuilder instead of Service)
5. **Class Name Mismatch**: Code referenced `VPass` but actual class was `VPassEntry`

**How We Fixed Each Issue:**
1. **Gradle**: Changed `-PreleaseTag` to properly quoted parameter in workflow
2. **Strings**: Replaced multi-line strings with `\n` escape sequences
3. **Cache**: Added `private val vPassCache = mutableMapOf<String, VPassEntry>()`
4. **Context**: Changed `hasCallScreeningRole(this)` to `hasCallScreeningRole(this@CallScreeningService)`
5. **Class**: Changed `VPass` references to `VPassEntry` to match actual model class

**Prevention Strategies for Future Builds:**
1. **Local Testing**: Always run `./gradlew assembleStaging` locally before pushing
2. **IDE Validation**: Ensure Android Studio shows no red errors before committing
3. **String Literals**: Use `\n` for newlines, never actual line breaks in strings
4. **Type Safety**: Use explicit type declarations for caches and collections
5. **Context References**: Use labeled `this@ClassName` in nested scopes
6. **Import Verification**: Verify all imports resolve to actual classes

#### 5. Stamped Build v1.3.0-rc1-staging.17 ✅
- Build completed successfully
- APK stamp verification passed
- GitHub release created with 4 assets:
  - verifd-staging.apk
  - apk.sha256
  - apk-metadata.json
  - INSTALL_STAGING_APK.md

### Acceptance Criteria for QA

Install the APK and verify:

1. **QA Panel Sync Status**
   - Open app → Settings → QA Panel V2
   - Check "BUILD INFO" section shows:
     - SHA: 11a64b6 (matches git commit)
     - Tag: v1.3.0-rc1-staging.17
     - Version: 1.3.0-rc1-staging.17
     - Status: "IN SYNC ✓"

2. **Unknown Call Screening**
   - Receive call from unknown number
   - Should see verifd card only
   - Debug line should include:
     - mode=REJECT_HIDE
     - suppressUi_result=success
     - sha=11a64b6...

3. **30-Minute Pass Test**
   - Approve a 30m pass for a number
   - Second call from same number should ring like a contact
   - No verifd screening UI should appear

### Known Issues

#### Cache Service Warnings (Non-Critical)
The build shows cache service warnings. These are GitHub Actions infrastructure issues, not code problems:
- "Our services aren't available right now" errors
- HTTP 400 responses from cache service
- Does NOT affect build success or APK integrity

### Next Steps

1. Download APK from release
2. Install on test devices
3. Run acceptance tests
4. Report any issues found
5. If all tests pass, merge to main

### Git Info
- Branch: release/staging-17
- HEAD: 11a64b6
- Parents: 9e6402f (fix compilation errors)

---
Generated: 2025-08-13T20:26:00Z