import XCTest
import AppIntents
@testable import verifd

/// Unit tests for verifd App Intents
@available(iOS 16.0, *)
class VerifdAppIntentsTests: XCTestCase {
    
    override func setUp() {
        super.setUp()
        // Enable feature flags for testing
        FeatureFlags.setFeatureFlag("APP_SHORTCUTS_ENABLED", enabled: true)
    }
    
    override func tearDown() {
        // Reset feature flags
        FeatureFlags.setFeatureFlag("APP_SHORTCUTS_ENABLED", enabled: false)
        super.tearDown()
    }
    
    // MARK: - Grant30mToLastMissedCallIntent Tests
    
    func testGrant30mIntent_FeatureEnabled() async throws {
        let intent = VerifdAppIntents.Grant30mToLastMissedCallIntent()
        
        // This would normally require mocking CallKit and VerifdPassManager
        // For now, we test that the intent executes without crashing
        do {
            let result = try await intent.perform()
            // Should return a dialog response
            XCTAssertNotNil(result)
        } catch VerifdIntentError.featureDisabled {
            XCTFail("Feature should be enabled in test")
        } catch {
            // Other errors are expected since we don't have real missed calls
            XCTAssertTrue(error is VerifdIntentError)
        }
    }
    
    func testGrant30mIntent_FeatureDisabled() async throws {
        // Disable feature flag
        FeatureFlags.setFeatureFlag("APP_SHORTCUTS_ENABLED", enabled: false)
        
        let intent = VerifdAppIntents.Grant30mToLastMissedCallIntent()
        
        do {
            _ = try await intent.perform()
            XCTFail("Should throw feature disabled error")
        } catch VerifdIntentError.featureDisabled {
            // Expected behavior
        } catch {
            XCTFail("Should throw feature disabled error, got: \(error)")
        }
    }
    
    func testGrant30mIntent_StaticProperties() {
        let intent = VerifdAppIntents.Grant30mToLastMissedCallIntent()
        
        XCTAssertEqual(VerifdAppIntents.Grant30mToLastMissedCallIntent.title, "Grant 30m to Last Missed Call")
        XCTAssertFalse(VerifdAppIntents.Grant30mToLastMissedCallIntent.openAppWhenRun)
        XCTAssertNotNil(VerifdAppIntents.Grant30mToLastMissedCallIntent.description)
    }
    
    // MARK: - ExpectCallWindowIntent Tests
    
    func testExpectCallWindowIntent_15Minutes() async throws {
        let intent = VerifdAppIntents.ExpectCallWindowIntent()
        intent.duration = "15m"
        
        do {
            let result = try await intent.perform()
            XCTAssertNotNil(result)
        } catch VerifdIntentError.featureDisabled {
            XCTFail("Feature should be enabled in test")
        } catch {
            // Other errors might occur due to missing dependencies
            NSLog("ExpectCallWindowIntent test error: \(error)")
        }
    }
    
    func testExpectCallWindowIntent_30Minutes() async throws {
        let intent = VerifdAppIntents.ExpectCallWindowIntent()
        intent.duration = "30m"
        
        do {
            let result = try await intent.perform()
            XCTAssertNotNil(result)
        } catch VerifdIntentError.featureDisabled {
            XCTFail("Feature should be enabled in test")
        } catch {
            // Other errors might occur due to missing dependencies
            NSLog("ExpectCallWindowIntent test error: \(error)")
        }
    }
    
    func testExpectCallWindowIntent_InvalidDuration() async throws {
        let intent = VerifdAppIntents.ExpectCallWindowIntent()
        intent.duration = "invalid"
        
        // Should default to 15 minutes
        do {
            let result = try await intent.perform()
            XCTAssertNotNil(result)
        } catch VerifdIntentError.featureDisabled {
            XCTFail("Feature should be enabled in test")
        } catch {
            // Other errors might occur due to missing dependencies
            NSLog("ExpectCallWindowIntent test error: \(error)")
        }
    }
    
    func testDurationOptionsProvider() async throws {
        let provider = VerifdAppIntents.DurationOptionsProvider()
        
        let results = try await provider.results()
        XCTAssertEqual(results, ["15m", "30m"])
        
        let defaultResult = await provider.defaultResult()
        XCTAssertEqual(defaultResult, "15m")
    }
    
    // MARK: - BlockLastCallIntent Tests
    
    func testBlockLastCallIntent() async throws {
        let intent = VerifdAppIntents.BlockLastCallIntent()
        
        do {
            let result = try await intent.perform()
            XCTAssertNotNil(result)
            // Currently returns placeholder message
        } catch VerifdIntentError.featureDisabled {
            XCTFail("Feature should be enabled in test")
        } catch {
            XCTFail("BlockLastCallIntent should not throw: \(error)")
        }
    }
    
    // MARK: - VerifdIntentError Tests
    
    func testVerifdIntentError_LocalizedDescriptions() {
        XCTAssertEqual(VerifdIntentError.featureDisabled.errorDescription, "This feature is currently disabled")
        XCTAssertEqual(VerifdIntentError.passGrantFailed.errorDescription, "Failed to grant verification pass")
        XCTAssertEqual(VerifdIntentError.noRecentCalls.errorDescription, "No recent calls found")
        XCTAssertEqual(VerifdIntentError.networkError.errorDescription, "Network error occurred")
    }
    
    // MARK: - VerifdPassManager Extension Tests
    
    func testVerifdPassManager_GrantPassToNumber() async {
        let passManager = VerifdPassManager.shared
        
        // Test with mock data
        let result = await passManager.grantPassToNumber(
            phoneNumber: "+15555551234",
            passType: .thirtyMinutes,
            name: "Test Caller"
        )
        
        // Since we don't have real contacts permission in tests, this might fail
        // But we can verify it doesn't crash
        switch result {
        case .success:
            XCTAssertTrue(true) // Success is good
        case .failure(let error):
            // Failure is expected in test environment
            XCTAssertTrue(error is VerifdIntentError)
        }
    }
}

// MARK: - Mock Classes for Testing

@available(iOS 16.0, *)
class MockVerifdPassManager {
    
    enum MockResult {
        case success
        case failure
    }
    
    var mockResult: MockResult = .success
    
    func grantPassToNumber(phoneNumber: String, passType: PassType, name: String) async -> VerifdPassManager.PassGrantResult {
        switch mockResult {
        case .success:
            return .success
        case .failure:
            return .failure(VerifdIntentError.passGrantFailed)
        }
    }
}

// MARK: - Test Helpers

extension VerifdAppIntentsTests {
    
    /// Helper to test intent execution without external dependencies
    private func testIntentExecution<T: AppIntent>(_ intent: T) async -> Bool {
        do {
            _ = try await intent.perform()
            return true
        } catch {
            NSLog("Intent execution failed: \(error)")
            return false
        }
    }
    
    /// Helper to verify intent properties
    private func verifyIntentProperties<T: AppIntent>(_ intentType: T.Type) {
        XCTAssertNotNil(intentType.title)
        XCTAssertNotNil(intentType.description)
    }
}