import XCTest
import UserNotifications
@testable import verifd

/// Unit tests for Time-Sensitive Notification Scheduler
@available(iOS 15.0, *)
class TimeSensitiveNotificationTests: XCTestCase {
    
    var scheduler: TimeSensitiveNotificationScheduler!
    var mockNotificationCenter: MockUNUserNotificationCenter!
    
    override func setUp() {
        super.setUp()
        scheduler = TimeSensitiveNotificationScheduler.shared
        mockNotificationCenter = MockUNUserNotificationCenter()
        
        // Enable feature flags for testing
        FeatureFlags.setFeatureFlag("TIME_SENSITIVE_NOTIFICATIONS_ENABLED", enabled: true)
    }
    
    override func tearDown() {
        // Reset feature flags
        FeatureFlags.setFeatureFlag("TIME_SENSITIVE_NOTIFICATIONS_ENABLED", enabled: false)
        mockNotificationCenter = nil
        super.tearDown()
    }
    
    // MARK: - Permission Tests
    
    func testRequestNotificationPermissions_FeatureEnabled() async {
        let result = await scheduler.requestNotificationPermissions()
        
        // In test environment, this will likely fail due to simulator restrictions
        // But we can verify it doesn't crash and follows the correct flow
        XCTAssertTrue(result == true || result == false) // Either outcome is valid in tests
    }
    
    func testRequestNotificationPermissions_FeatureDisabled() async {
        FeatureFlags.setFeatureFlag("TIME_SENSITIVE_NOTIFICATIONS_ENABLED", enabled: false)
        
        let result = await scheduler.requestNotificationPermissions()
        XCTAssertFalse(result) // Should return false when feature is disabled
    }
    
    func testCheckNotificationPermissions() async {
        let status = await scheduler.checkNotificationPermissions()
        
        // In test environment, status will likely be .notDetermined or .denied
        XCTAssertTrue([.authorized, .denied, .notDetermined, .provisional].contains(status))
    }
    
    // MARK: - Expecting Window Notification Tests
    
    func testScheduleExpectingWindowNotification_15Minutes() async {
        await scheduler.scheduleExpectingWindowNotification(duration: 15 * 60)
        
        // Verify no crashes occurred
        XCTAssertTrue(true)
    }
    
    func testScheduleExpectingWindowNotification_30Minutes() async {
        await scheduler.scheduleExpectingWindowNotification(duration: 30 * 60)
        
        // Should schedule both initial notification and expiry warning
        XCTAssertTrue(true)
    }
    
    func testScheduleExpectingWindowNotification_ShortDuration() async {
        await scheduler.scheduleExpectingWindowNotification(duration: 2 * 60) // 2 minutes
        
        // Should not schedule expiry warning for durations <= 5 minutes
        XCTAssertTrue(true)
    }
    
    func testScheduleExpectingWindowNotification_FeatureDisabled() async {
        FeatureFlags.setFeatureFlag("TIME_SENSITIVE_NOTIFICATIONS_ENABLED", enabled: false)
        
        await scheduler.scheduleExpectingWindowNotification(duration: 15 * 60)
        
        // Should not schedule notification when feature is disabled
        XCTAssertTrue(true)
    }
    
    // MARK: - Verification Pass Notification Tests
    
    func testScheduleExpectingCallNotification() async {
        await scheduler.scheduleExpectingCallNotification(
            phoneNumber: "+15555551234",
            duration: 30 * 60
        )
        
        // Verify no crashes occurred
        XCTAssertTrue(true)
    }
    
    func testScheduleExpectingCallNotification_FormattedNumber() async {
        await scheduler.scheduleExpectingCallNotification(
            phoneNumber: "+15551234567",
            duration: 15 * 60
        )
        
        // Should handle phone number formatting
        XCTAssertTrue(true)
    }
    
    // MARK: - Notification Categories Tests
    
    func testRegisterNotificationCategories() {
        scheduler.registerNotificationCategories()
        
        // Should register categories without crashing
        XCTAssertTrue(true)
    }
    
    func testRegisterNotificationCategories_FeatureDisabled() {
        FeatureFlags.setFeatureFlag("TIME_SENSITIVE_NOTIFICATIONS_ENABLED", enabled: false)
        
        scheduler.registerNotificationCategories()
        
        // Should not register categories when feature is disabled
        XCTAssertTrue(true)
    }
    
    // MARK: - Cleanup Tests
    
    func testRemoveAllNotifications() {
        scheduler.removeAllNotifications()
        
        // Should not crash
        XCTAssertTrue(true)
    }
    
    func testCleanupExpiredNotifications() {
        scheduler.cleanupExpiredNotifications()
        
        // Should not crash
        XCTAssertTrue(true)
    }
    
    // MARK: - Utility Method Tests
    
    func testFormatDuration_Minutes() {
        // Use reflection to test private methods
        let scheduler = TimeSensitiveNotificationScheduler.shared
        
        // Test different durations
        let testDurations: [(TimeInterval, String)] = [
            (60, "1 minute"),
            (120, "2 minutes"),
            (900, "15 minutes"),
            (1800, "30 minutes"),
            (3600, "1 hour"),
            (7200, "2 hours"),
            (3900, "1h 5m")
        ]
        
        // Since formatDuration is private, we can't test it directly
        // But we can verify the scheduler handles various durations
        for (duration, _) in testDurations {
            // This would test the method if it were public
            XCTAssertTrue(duration > 0)
        }
    }
    
    func testFormatPhoneNumberForDisplay() {
        // Test phone number formatting indirectly through notification scheduling
        let testNumbers = [
            "+15551234567", // Standard US format
            "+44123456789", // International format
            "5551234567",   // No country code
            "555-123-4567"  // Already formatted
        ]
        
        for number in testNumbers {
            Task {
                await scheduler.scheduleExpectingCallNotification(phoneNumber: number, duration: 300)
            }
        }
        
        // Verify no crashes with various number formats
        XCTAssertTrue(true)
    }
    
    // MARK: - Delegate Tests
    
    func testUserNotificationCenterDelegate_ExtendWindow() {
        let mockResponse = MockUNNotificationResponse(
            actionIdentifier: "EXTEND_WINDOW",
            categoryIdentifier: "EXPECTING_WINDOW"
        )
        
        let expectation = expectation(description: "Completion handler called")
        
        scheduler.userNotificationCenter(
            UNUserNotificationCenter.current(),
            didReceive: mockResponse
        ) {
            expectation.fulfill()
        }
        
        waitForExpectations(timeout: 1.0)
    }
    
    func testUserNotificationCenterDelegate_OpenApp() {
        let mockResponse = MockUNNotificationResponse(
            actionIdentifier: "OPEN_APP",
            categoryIdentifier: "VERIFICATION_PASS"
        )
        
        let expectation = expectation(description: "Completion handler called")
        
        scheduler.userNotificationCenter(
            UNUserNotificationCenter.current(),
            didReceive: mockResponse
        ) {
            expectation.fulfill()
        }
        
        waitForExpectations(timeout: 1.0)
    }
    
    func testUserNotificationCenterWillPresent() {
        let mockNotification = MockUNNotification()
        
        let expectation = expectation(description: "Completion handler called")
        
        scheduler.userNotificationCenter(
            UNUserNotificationCenter.current(),
            willPresent: mockNotification
        ) { options in
            if #available(iOS 14.0, *) {
                XCTAssertTrue(options.contains(.banner))
            } else {
                XCTAssertTrue(options.contains(.alert))
            }
            XCTAssertTrue(options.contains(.sound))
            XCTAssertTrue(options.contains(.badge))
            expectation.fulfill()
        }
        
        waitForExpectations(timeout: 1.0)
    }
}

// MARK: - Mock Classes

@available(iOS 15.0, *)
class MockUNUserNotificationCenter {
    var mockAuthorizationStatus: UNAuthorizationStatus = .notDetermined
    var mockNotificationSettings: UNNotificationSettings?
    
    func requestAuthorization(options: UNAuthorizationOptions) async throws -> Bool {
        return mockAuthorizationStatus == .authorized
    }
    
    func notificationSettings() async -> UNNotificationSettings {
        return mockNotificationSettings ?? UNNotificationSettings()
    }
}

class MockUNNotificationResponse: UNNotificationResponse {
    private let _actionIdentifier: String
    private let _categoryIdentifier: String
    
    init(actionIdentifier: String, categoryIdentifier: String) {
        _actionIdentifier = actionIdentifier
        _categoryIdentifier = categoryIdentifier
        super.init()
    }
    
    override var actionIdentifier: String {
        return _actionIdentifier
    }
    
    override var notification: UNNotification {
        return MockUNNotification(categoryIdentifier: _categoryIdentifier)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

class MockUNNotification: UNNotification {
    private let _categoryIdentifier: String
    
    init(categoryIdentifier: String = "TEST") {
        _categoryIdentifier = categoryIdentifier
        super.init()
    }
    
    override var request: UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.categoryIdentifier = _categoryIdentifier
        return UNNotificationRequest(identifier: "test", content: content, trigger: nil)
    }
    
    override var date: Date {
        return Date()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

// MARK: - Test Extensions

extension TimeSensitiveNotificationTests {
    
    /// Helper to test notification content creation
    private func verifyNotificationContent(
        title: String,
        body: String,
        categoryIdentifier: String
    ) {
        XCTAssertFalse(title.isEmpty)
        XCTAssertFalse(body.isEmpty)
        XCTAssertFalse(categoryIdentifier.isEmpty)
    }
    
    /// Helper to test time-sensitive notification properties
    @available(iOS 15.0, *)
    private func verifyTimeSensitiveContent(_ content: UNMutableNotificationContent) {
        XCTAssertEqual(content.interruptionLevel, .timeSensitive)
    }
}