# Android Bootstrap Fixes

## Build Configuration Fixes Applied

### 1. Dependencies Added (build.gradle)
- `androidx.security:security-crypto:1.1.0-alpha06` - Required for EncryptedSharedPreferences in BackendClient
- `androidx.recyclerview:recyclerview:1.3.2` - Required for RecyclerView in VPassAdapter

### 2. BuildConfig Feature Enabled
- Added `buildFeatures { buildConfig true }` to enable custom BuildConfig fields
- Added `IS_STAGING` boolean field to staging buildType for runtime variant detection

### 3. Kotlin Code Fixes

#### BackendClient.kt
- Already had try-catch fallback for EncryptedSharedPreferences
- Falls back to regular SharedPreferences on any encryption failure
- No additional changes needed

#### PostCallActivity.kt
- Added missing `RateLimited` case to when expression for GrantPassResult
- Shows toast "Rate limited, try later" and returns early

#### VPassAdapter.kt  
- Changed `bindingAdapterPosition` to `absoluteAdapterPosition`
- This is the correct API for RecyclerView adapter position in newer versions

#### RiskAssessment.kt
- Changed `const val BURST_WINDOW_MS` to `val` (const requires compile-time constant)
- Added `import android.os.Build` for API level checks
- Wrapped all CALLER_NUMBER_VERIFICATION_* references with API level check:
  ```kotlin
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      // Use CALLER_NUMBER_VERIFICATION_* constants
  } else {
      // Fallback for API < 30
  }
  ```
- Returns medium risk (0.4f) when STIR/SHAKEN not available on older APIs

### 4. Workflow Updates (android-staging-apk.yml)
- Changed to explicitly build staging variant: `./gradlew clean :app:assembleStaging`
- Updated APK search paths to look in `app/build/outputs/apk/staging/`
- Removed fallback to debug variant - now fails fast if staging can't build

## Why These Fixes Were Needed

1. **EncryptedSharedPreferences**: Android Security library wasn't included in dependencies, causing unresolved reference errors

2. **BuildConfig**: Android Gradle Plugin 8.x requires explicitly enabling buildConfig feature when using buildConfigField

3. **RecyclerView API**: `bindingAdapterPosition` was incorrect; should use `absoluteAdapterPosition` or `adapterPosition`

4. **Const with non-literal**: Kotlin const vals must be compile-time constants, but TimeUnit.toMillis() is evaluated at runtime

5. **API Level Compatibility**: CALLER_NUMBER_VERIFICATION_* constants require API 30 (Android R) but minSdk is 26. Added runtime checks to prevent crashes on older devices.

## Build Requirements
- JDK 17 (configured in GitHub Actions)
- Android SDK with compileSdk 34
- Gradle 8.x with Kotlin support

## Additional Fixes Applied (Round 2)

### 1. Fixed Compilation Errors
- Fixed CALLER_NUMBER_VERIFICATION constants to use fully qualified names (android.telecom.Call.Details.*)
- Fixed Manifest.permission.CALL_LOG to READ_CALL_LOG
- Created missing ApiService.kt for network requests
- Created missing ic_block.xml drawable resource
- Fixed CallScreeningService to use insertVPass instead of addVPass
- Fixed VPassEntry constructor parameters
- Removed invalid setCallScreeningAppName method call
- Added proper coroutine scope and imports

## Testing the Build
```bash
cd apps/android
./gradlew :app:assembleStaging
# APK output: app/build/outputs/apk/staging/app-staging.apk
```