import Foundation
import UIKit

/// Manages expecting call windows for 15-30 minute durations
/// STORE COMPLIANCE: Privacy-first, local storage only
class ExpectingWindowManager {
    static let shared = ExpectingWindowManager()
    
    private let appGroupIdentifier = "group.com.verifd.app"
    private var windowTimer: Timer?
    private var notificationTimer: Timer?
    
    private init() {}
    
    // MARK: - Window Management
    
    /// Enable expecting call window for specified duration
    func enableExpectingWindow(duration: TimeInterval) async {
        await MainActor.run {
            self.storeExpectingWindow(duration: duration)
            self.scheduleWindowExpiry(duration: duration)
            self.updateAppState(isExpecting: true)
        }
    }
    
    /// Disable expecting call window
    func disableExpectingWindow() async {
        await MainActor.run {
            self.clearExpectingWindow()
            self.cancelTimers()
            self.updateAppState(isExpecting: false)
        }
    }
    
    /// Check if currently in expecting window
    func isExpectingWindowActive() -> Bool {
        guard let sharedContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else {
            return false
        }
        
        let windowURL = sharedContainer.appendingPathComponent("expecting_window.json")
        
        guard FileManager.default.fileExists(atPath: windowURL.path) else {
            return false
        }
        
        do {
            let data = try Data(contentsOf: windowURL)
            let windowData = try JSONDecoder().decode(ExpectingWindow.self, from: data)
            return windowData.isActive && !windowData.isExpired
        } catch {
            NSLog("ExpectingWindowManager: Failed to read window data: \(error)")
            return false
        }
    }
    
    /// Get current expecting window info
    func getCurrentWindow() -> ExpectingWindow? {
        guard let sharedContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else {
            return nil
        }
        
        let windowURL = sharedContainer.appendingPathComponent("expecting_window.json")
        
        guard FileManager.default.fileExists(atPath: windowURL.path) else {
            return nil
        }
        
        do {
            let data = try Data(contentsOf: windowURL)
            let windowData = try JSONDecoder().decode(ExpectingWindow.self, from: data)
            return windowData.isExpired ? nil : windowData
        } catch {
            NSLog("ExpectingWindowManager: Failed to read window data: \(error)")
            return nil
        }
    }
    
    // MARK: - Private Methods
    
    private func storeExpectingWindow(duration: TimeInterval) {
        guard let sharedContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else {
            return
        }
        
        let windowURL = sharedContainer.appendingPathComponent("expecting_window.json")
        let expiryDate = Date().addingTimeInterval(duration)
        
        let windowData = ExpectingWindow(
            isActive: true,
            startDate: Date(),
            expiryDate: expiryDate,
            duration: duration
        )
        
        do {
            let data = try JSONEncoder().encode(windowData)
            try data.write(to: windowURL)
            NSLog("ExpectingWindowManager: Window enabled for \(Int(duration/60)) minutes")
        } catch {
            NSLog("ExpectingWindowManager: Failed to store window data: \(error)")
        }
    }
    
    private func clearExpectingWindow() {
        guard let sharedContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else {
            return
        }
        
        let windowURL = sharedContainer.appendingPathComponent("expecting_window.json")
        
        do {
            try FileManager.default.removeItem(at: windowURL)
            NSLog("ExpectingWindowManager: Window cleared")
        } catch {
            NSLog("ExpectingWindowManager: Failed to clear window: \(error)")
        }
    }
    
    private func scheduleWindowExpiry(duration: TimeInterval) {
        // Cancel existing timer
        windowTimer?.invalidate()
        
        // Schedule new timer
        windowTimer = Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { [weak self] _ in
            Task {
                await self?.disableExpectingWindow()
            }
        }
        
        // Schedule notification 5 minutes before expiry (if duration > 5 minutes)
        if duration > 300 { // 5 minutes
            let notificationTime = duration - 300
            notificationTimer = Timer.scheduledTimer(withTimeInterval: notificationTime, repeats: false) { [weak self] _ in
                self?.scheduleExpiryReminder()
            }
        }
    }
    
    private func cancelTimers() {
        windowTimer?.invalidate()
        windowTimer = nil
        notificationTimer?.invalidate()
        notificationTimer = nil
    }
    
    private func updateAppState(isExpecting: Bool) {
        // Update app badge or other UI indicators
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = isExpecting ? 1 : 0
        }
        
        // Post notification for app to update UI
        NotificationCenter.default.post(
            name: .expectingWindowStateChanged,
            object: nil,
            userInfo: ["isExpecting": isExpecting]
        )
    }
    
    private func scheduleExpiryReminder() {
        // Schedule local notification for window expiry reminder
        let content = UNMutableNotificationContent()
        content.title = "Expecting Window Expiring"
        content.body = "Your verification window expires in 5 minutes"
        content.sound = .default
        
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: "expecting-window-expiry",
            content: content,
            trigger: trigger
        )
        
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                NSLog("ExpectingWindowManager: Failed to schedule expiry reminder: \(error)")
            }
        }
    }
    
    // MARK: - Call Directory Integration
    
    /// Update Call Directory Extension with expecting window state
    func updateCallDirectoryState() {
        guard let sharedContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else {
            return
        }
        
        // Store state for Call Directory Extension to read
        let stateURL = sharedContainer.appendingPathComponent("expecting_state.json")
        let state = ExpectingState(
            isExpectingCalls: isExpectingWindowActive(),
            lastUpdated: Date()
        )
        
        do {
            let data = try JSONEncoder().encode(state)
            try data.write(to: stateURL)
        } catch {
            NSLog("ExpectingWindowManager: Failed to update call directory state: \(error)")
        }
    }
}

// MARK: - Supporting Types

struct ExpectingWindow: Codable {
    let isActive: Bool
    let startDate: Date
    let expiryDate: Date
    let duration: TimeInterval
    
    var isExpired: Bool {
        return Date() > expiryDate
    }
    
    var remainingTime: TimeInterval {
        return max(0, expiryDate.timeIntervalSinceNow)
    }
    
    var formattedRemainingTime: String {
        let remaining = Int(remainingTime)
        let minutes = remaining / 60
        let seconds = remaining % 60
        
        if minutes > 0 {
            return "\(minutes)m \(seconds)s"
        } else {
            return "\(seconds)s"
        }
    }
}

struct ExpectingState: Codable {
    let isExpectingCalls: Bool
    let lastUpdated: Date
}

// MARK: - Notification Names

extension Notification.Name {
    static let expectingWindowStateChanged = Notification.Name("expectingWindowStateChanged")
}