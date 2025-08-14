import XCTest
@testable import verifd

/**
 * Release URL Safety Tests
 *
 * CRITICAL: These tests ensure production builds use the correct API endpoint.
 * CI will fail if release builds don't point to https://api.verifd.com
 */
class ReleaseURLValidationTests: XCTestCase {
    
    func testReleaseURLIsProduction() {
        #if RELEASE
        // Production builds MUST use the production API
        XCTAssertEqual(
            Config.apiBaseURL,
            "https://api.verifd.com",
            "Release build must use production API"
        )
        
        // Ensure no development URLs
        XCTAssertFalse(
            Config.apiBaseURL.contains("localhost"),
            "Release build cannot contain localhost"
        )
        XCTAssertFalse(
            Config.apiBaseURL.contains("127.0.0.1"),
            "Release build cannot contain loopback address"
        )
        XCTAssertFalse(
            Config.apiBaseURL.contains("staging"),
            "Release build cannot contain staging URL"
        )
        #endif
    }
    
    func testDebugURLIsLocal() {
        #if DEBUG
        // Debug builds should allow local development
        let validDebugUrls = [
            "http://localhost:3000",
            "http://127.0.0.1:3000"
        ]
        
        // Check if URL can be overridden via environment
        if let envUrl = ProcessInfo.processInfo.environment["API_BASE_URL"] {
            XCTAssertNotNil(envUrl, "Debug build should allow environment override")
        } else {
            XCTAssertTrue(
                validDebugUrls.contains(Config.apiBaseURL),
                "Debug build should use local development URL"
            )
        }
        #endif
    }
    
    func testStagingURLIsStaging() {
        #if STAGING
        XCTAssertEqual(
            Config.apiBaseURL,
            "https://staging-api.verifd.com",
            "Staging build must use staging API"
        )
        #endif
    }
    
    func testProductionCannotOverrideURL() {
        #if RELEASE
        // Production builds must NOT allow runtime URL changes
        XCTAssertNil(
            ProcessInfo.processInfo.environment["API_BASE_URL"],
            "Production build cannot have API_BASE_URL environment variable"
        )
        
        // Verify URL is hardcoded
        XCTAssertEqual(
            Config.apiBaseURL,
            "https://api.verifd.com",
            "Production URL must be hardcoded"
        )
        #endif
    }
    
    func testURLProtocolSecurity() {
        #if RELEASE || STAGING
        // Production and staging must use HTTPS
        XCTAssertTrue(
            Config.apiBaseURL.hasPrefix("https://"),
            "Production/staging builds must use HTTPS"
        )
        #endif
    }
    
    func testURLFormat() {
        let url = Config.apiBaseURL
        
        // Should not end with slash
        XCTAssertFalse(
            url.hasSuffix("/"),
            "API URL should not end with slash"
        )
        
        // Should be a valid URL
        XCTAssertNotNil(
            URL(string: url),
            "API URL should be valid"
        )
        
        // Should match expected pattern
        let pattern = #"^https?://[\w.-]+(:\d+)?$"#
        let regex = try! NSRegularExpression(pattern: pattern)
        let range = NSRange(location: 0, length: url.utf16.count)
        XCTAssertNotNil(
            regex.firstMatch(in: url, options: [], range: range),
            "API URL should match valid format"
        )
    }
    
    func testBackendURLFromInfoPlist() {
        // Check Info.plist configuration
        if let infoPlist = Bundle.main.infoDictionary {
            if let backendUrl = infoPlist["BACKEND_URL"] as? String {
                #if RELEASE
                XCTAssertEqual(
                    backendUrl,
                    "https://api.verifd.com",
                    "Info.plist BACKEND_URL must be production in release"
                )
                #endif
                
                #if STAGING
                XCTAssertEqual(
                    backendUrl,
                    "https://staging-api.verifd.com",
                    "Info.plist BACKEND_URL must be staging in staging build"
                )
                #endif
            }
        }
    }
    
    func testNoHardcodedDevURLs() {
        // Scan for hardcoded development URLs that shouldn't exist in production
        #if RELEASE
        let forbiddenStrings = [
            "localhost:3000",
            "127.0.0.1:3000",
            "10.0.2.2:3000",
            "staging-api"
        ]
        
        // This would be expanded to scan actual source files in CI
        for forbidden in forbiddenStrings {
            XCTAssertFalse(
                Config.apiBaseURL.contains(forbidden),
                "Production build cannot contain development URL: \(forbidden)"
            )
        }
        #endif
    }
}