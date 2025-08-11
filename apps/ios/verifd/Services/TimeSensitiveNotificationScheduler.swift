import Foundation
import UserNotifications
import UIKit

/// Schedules time-sensitive notifications for verifd expecting windows
/// STORE COMPLIANCE: User permission required, only during active windows
@available(iOS 15.0, *)
class TimeSensitiveNotificationScheduler {
    static let shared = TimeSensitiveNotificationScheduler()
    
    private init() {}
    
    // MARK: - Permission Management
    
    /// Request notification permissions with time-sensitive capability
    func requestNotificationPermissions() async -> Bool {
        guard FeatureFlags.TIME_SENSITIVE_NOTIFICATIONS_ENABLED else {
            return false
        }
        
        let center = UNUserNotificationCenter.current()
        
        do {
            // Request standard permissions first
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            
            if granted {
                // Request time-sensitive permission (iOS 15+)
                let settings = await center.notificationSettings()
                return settings.authorizationStatus == .authorized
            }
            
            return false
        } catch {
            NSLog("TimeSensitiveNotificationScheduler: Permission request failed: \(error)")
            return false
        }
    }
    
    /// Check current notification permission status
    func checkNotificationPermissions() async -> UNAuthorizationStatus {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        return settings.authorizationStatus
    }
    
    // MARK: - Expecting Window Notifications
    
    /// Schedule notification for expecting window activation
    func scheduleExpectingWindowNotification(duration: TimeInterval) async {
        guard FeatureFlags.TIME_SENSITIVE_NOTIFICATIONS_ENABLED else { return }
        
        let permissionStatus = await checkNotificationPermissions()
        guard permissionStatus == .authorized else {
            NSLog("TimeSensitiveNotificationScheduler: Notifications not authorized")
            return
        }
        
        let content = UNMutableNotificationContent()
        content.title = "Expecting Calls Active"
        content.body = "Verified callers can reach you for the next \(formatDuration(duration))"
        content.sound = .default
        content.categoryIdentifier = "EXPECTING_WINDOW"
        
        // Time-sensitive notification (iOS 15+)
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .timeSensitive
        }
        
        // Schedule immediate notification
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: "expecting-window-active-\(Date().timeIntervalSince1970)",
            content: content,
            trigger: trigger
        )
        
        do {
            try await UNUserNotificationCenter.current().add(request)
            NSLog("TimeSensitiveNotificationScheduler: Scheduled expecting window notification")
            
            // Schedule expiry warning if duration > 5 minutes
            if duration > 300 {
                await scheduleExpiryWarning(duration: duration)
            }
        } catch {
            NSLog("TimeSensitiveNotificationScheduler: Failed to schedule notification: \(error)")
        }
    }
    
    /// Schedule notification when expecting a call from specific number
    func scheduleExpectingCallNotification(phoneNumber: String, duration: TimeInterval) async {
        guard FeatureFlags.TIME_SENSITIVE_NOTIFICATIONS_ENABLED else { return }
        
        let permissionStatus = await checkNotificationPermissions()
        guard permissionStatus == .authorized else { return }
        
        let formattedNumber = formatPhoneNumberForDisplay(phoneNumber)
        
        let content = UNMutableNotificationContent()
        content.title = "Verification Pass Granted"
        content.body = "\(formattedNumber) can call you back for the next \(formatDuration(duration))"
        content.sound = .default
        content.categoryIdentifier = "VERIFICATION_PASS"
        
        // Time-sensitive notification
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .timeSensitive
        }
        
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        let request = UNNotificationRequest(
            identifier: "verification-pass-\(phoneNumber)-\(Date().timeIntervalSince1970)",
            content: content,
            trigger: trigger
        )
        
        do {
            try await UNUserNotificationCenter.current().add(request)
            NSLog("TimeSensitiveNotificationScheduler: Scheduled verification pass notification")
        } catch {
            NSLog("TimeSensitiveNotificationScheduler: Failed to schedule pass notification: \(error)")
        }
    }
    
    // MARK: - Expiry Warnings
    
    private func scheduleExpiryWarning(duration: TimeInterval) async {
        let warningTime = duration - 300 // 5 minutes before expiry
        guard warningTime > 0 else { return }
        
        let content = UNMutableNotificationContent()
        content.title = "Expecting Window Expiring"
        content.body = "Your verification window expires in 5 minutes"
        content.sound = .default
        content.categoryIdentifier = "EXPECTING_EXPIRY"
        
        // Standard notification for warning
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .active
        }
        
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: warningTime, repeats: false)
        let request = UNNotificationRequest(
            identifier: "expecting-window-expiry-\(Date().timeIntervalSince1970)",
            content: content,
            trigger: trigger
        )
        
        do {
            try await UNUserNotificationCenter.current().add(request)
            NSLog("TimeSensitiveNotificationScheduler: Scheduled expiry warning")
        } catch {
            NSLog("TimeSensitiveNotificationScheduler: Failed to schedule expiry warning: \(error)")
        }
    }
    
    // MARK: - Notification Categories
    
    /// Register notification categories for interactive notifications
    func registerNotificationCategories() {
        guard FeatureFlags.TIME_SENSITIVE_NOTIFICATIONS_ENABLED else { return }
        
        let center = UNUserNotificationCenter.current()
        
        // Expecting Window category
        let extendAction = UNNotificationAction(
            identifier: "EXTEND_WINDOW",
            title: "Extend 15m",
            options: [.foreground]
        )
        
        let expectingCategory = UNNotificationCategory(
            identifier: "EXPECTING_WINDOW",
            actions: [extendAction],
            intentIdentifiers: [],
            options: []
        )
        
        // Verification Pass category
        let openAppAction = UNNotificationAction(
            identifier: "OPEN_APP",
            title: "Open App",
            options: [.foreground]
        )
        
        let passCategory = UNNotificationCategory(
            identifier: "VERIFICATION_PASS",
            actions: [openAppAction],
            intentIdentifiers: [],
            options: []
        )
        
        // Expiry Warning category
        let extendMoreAction = UNNotificationAction(
            identifier: "EXTEND_MORE",
            title: "Extend",
            options: [.foreground]
        )
        
        let expiryCategory = UNNotificationCategory(
            identifier: "EXPECTING_EXPIRY",
            actions: [extendMoreAction],
            intentIdentifiers: [],
            options: []
        )
        
        center.setNotificationCategories([expectingCategory, passCategory, expiryCategory])
    }
    
    // MARK: - Cleanup
    
    /// Remove all verifd notifications
    func removeAllNotifications() {
        let center = UNUserNotificationCenter.current()
        
        center.getPendingNotificationRequests { requests in
            let verifdRequests = requests.filter { request in
                request.identifier.contains("expecting-window") ||
                request.identifier.contains("verification-pass") ||
                request.identifier.contains("expecting-expiry")
            }
            
            let identifiers = verifdRequests.map { $0.identifier }
            center.removePendingNotificationRequests(withIdentifiers: identifiers)
            
            NSLog("TimeSensitiveNotificationScheduler: Removed \(identifiers.count) notifications")
        }
    }
    
    /// Remove expired notifications
    func cleanupExpiredNotifications() {
        let center = UNUserNotificationCenter.current()
        
        center.getDeliveredNotifications { notifications in
            let expiredNotifications = notifications.filter { notification in
                // Remove notifications older than 1 hour
                let deliveryDate = notification.date
                let oneHourAgo = Date().addingTimeInterval(-3600)
                return deliveryDate < oneHourAgo && (
                    notification.request.identifier.contains("expecting-window") ||
                    notification.request.identifier.contains("verification-pass")
                )
            }
            
            let identifiers = expiredNotifications.map { $0.request.identifier }
            center.removeDeliveredNotifications(withIdentifiers: identifiers)
        }
    }
    
    // MARK: - Utility Methods
    
    private func formatDuration(_ duration: TimeInterval) -> String {
        let minutes = Int(duration / 60)
        if minutes >= 60 {
            let hours = minutes / 60
            let remainingMinutes = minutes % 60
            if remainingMinutes == 0 {
                return "\(hours) hour\(hours == 1 ? "" : "s")"
            } else {
                return "\(hours)h \(remainingMinutes)m"
            }
        } else {
            return "\(minutes) minute\(minutes == 1 ? "" : "s")"
        }
    }
    
    private func formatPhoneNumberForDisplay(_ number: String) -> String {
        // Format phone number for display in notifications
        if number.hasPrefix("+1") && number.count == 12 {
            let digits = String(number.dropFirst(2))
            return "(\(digits.prefix(3))) \(digits.dropFirst(3).prefix(3))-\(digits.suffix(4))"
        }
        return number
    }
}

// MARK: - Notification Handling

extension TimeSensitiveNotificationScheduler: UNUserNotificationCenterDelegate {
    
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        
        let actionIdentifier = response.actionIdentifier
        let categoryIdentifier = response.notification.request.content.categoryIdentifier
        
        switch (categoryIdentifier, actionIdentifier) {
        case ("EXPECTING_WINDOW", "EXTEND_WINDOW"):
            // Extend expecting window by 15 minutes
            Task {
                await ExpectingWindowManager.shared.enableExpectingWindow(duration: 15 * 60)
            }
            
        case ("VERIFICATION_PASS", "OPEN_APP"), ("EXPECTING_EXPIRY", "EXTEND_MORE"):
            // Open app
            if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let window = scene.windows.first {
                window.makeKeyAndVisible()
            }
            
        default:
            break
        }
        
        completionHandler()
    }
    
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        
        // Show time-sensitive notifications even when app is in foreground
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound, .badge])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }
}