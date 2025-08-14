import XCTest
@testable import verifd

class BuildVariantURLTests: XCTestCase {
    
    // MARK: - URL Configuration Tests
    
    func testDebugSchemeUsesLocalURL() {
        #if DEBUG
        let expectedURL = "http://localhost:3000"
        XCTAssertEqual(
            Config.backendURL,
            expectedURL,
            "Debug scheme should use local backend URL"
        )
        #endif
    }
    
    func testReleaseSchemeUsesProductionURL() {
        #if RELEASE
        let expectedURL = "https://api.verifd.com"
        XCTAssertEqual(
            Config.backendURL,
            expectedURL,
            "Release scheme should use production backend URL"
        )
        #endif
    }
    
    func testStagingSchemeUsesStagingURL() {
        #if STAGING
        let expectedURL = "https://staging-api.verifd.com"
        XCTAssertEqual(
            Config.backendURL,
            expectedURL,
            "Staging scheme should use staging backend URL"
        )
        #endif
    }
    
    func testBackendURLIsNotEmpty() {
        XCTAssertFalse(
            Config.backendURL.isEmpty,
            "Backend URL must not be empty"
        )
    }
    
    func testBackendURLIsValidFormat() {
        let url = Config.backendURL
        
        // Must start with http:// or https://
        XCTAssertTrue(
            url.hasPrefix("http://") || url.hasPrefix("https://"),
            "Backend URL must start with http:// or https://"
        )
        
        // Must be a valid URL
        XCTAssertNotNil(
            URL(string: url),
            "Backend URL must be a valid URL format: \(url)"
        )
    }
    
    // MARK: - Build Configuration Tests
    
    func testBuildConfigurationMatchesExpected() {
        #if DEBUG
        XCTAssertTrue(
            Config.isDebugBuild,
            "Debug flag should be true in debug builds"
        )
        #elseif RELEASE
        XCTAssertFalse(
            Config.isDebugBuild,
            "Debug flag should be false in release builds"
        )
        #endif
    }
    
    func testAPIKeysAreConfigured() {
        // Ensure API keys are set (but don't expose actual values in tests)
        #if !DEBUG
        XCTAssertFalse(
            Config.apiKey?.isEmpty ?? true,
            "API key must be configured for non-debug builds"
        )
        #endif
    }
    
    // MARK: - Environment-Specific Features
    
    func testLoggingLevelMatchesBuildType() {
        #if DEBUG
        XCTAssertEqual(
            Config.logLevel,
            .verbose,
            "Debug builds should have verbose logging"
        )
        #elseif RELEASE
        XCTAssertEqual(
            Config.logLevel,
            .error,
            "Release builds should only log errors"
        )
        #elseif STAGING
        XCTAssertEqual(
            Config.logLevel,
            .info,
            "Staging builds should have info-level logging"
        )
        #endif
    }
    
    func testCrashReportingConfiguration() {
        #if RELEASE
        XCTAssertTrue(
            Config.isCrashReportingEnabled,
            "Crash reporting should be enabled in release builds"
        )
        #else
        XCTAssertFalse(
            Config.isCrashReportingEnabled,
            "Crash reporting should be disabled in non-release builds"
        )
        #endif
    }
    
    // MARK: - Bundle Identifier Tests
    
    func testBundleIdentifierMatchesBuildType() {
        let bundleId = Bundle.main.bundleIdentifier ?? ""
        
        #if DEBUG
        XCTAssertTrue(
            bundleId.hasSuffix(".debug"),
            "Debug builds should have .debug suffix in bundle ID"
        )
        #elseif STAGING
        XCTAssertTrue(
            bundleId.hasSuffix(".staging"),
            "Staging builds should have .staging suffix in bundle ID"
        )
        #elseif RELEASE
        XCTAssertFalse(
            bundleId.contains(".debug") || bundleId.contains(".staging"),
            "Release builds should not have debug/staging suffix"
        )
        #endif
    }
    
    // MARK: - Runtime Override Tests
    
    func testRuntimeURLOverrideCapability() {
        // Verify that debug builds can override the URL at runtime
        #if DEBUG
        let originalURL = Config.backendURL
        
        // Simulate runtime override
        Config.overrideBackendURL("http://192.168.1.100:3000")
        XCTAssertEqual(
            Config.backendURL,
            "http://192.168.1.100:3000",
            "Debug builds should allow runtime URL override"
        )
        
        // Reset
        Config.resetBackendURL()
        XCTAssertEqual(
            Config.backendURL,
            originalURL,
            "URL should reset to original value"
        )
        #endif
    }
    
    func testProductionBuildsCannotOverrideURL() {
        #if RELEASE
        let originalURL = Config.backendURL
        
        // Attempt override (should fail silently in production)
        Config.overrideBackendURL("http://malicious.com")
        XCTAssertEqual(
            Config.backendURL,
            originalURL,
            "Production builds must not allow URL override"
        )
        #endif
    }
}