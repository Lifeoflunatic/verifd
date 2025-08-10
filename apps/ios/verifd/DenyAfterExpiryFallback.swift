import Foundation
import CallKit

/// Fallback mechanism for deny-after-expiry functionality
/// Note: iOS limitations prevent true call blocking without user interaction
/// This provides the framework for future implementation or workarounds
class DenyAfterExpiryFallback {
    static let shared = DenyAfterExpiryFallback()
    
    private init() {}
    
    /// Check if a number should be denied (expired pass attempting callback)
    func shouldDenyCall(phoneNumber: String) -> Bool {
        // Check if this number had a pass that's now expired
        // and is attempting to call back
        
        guard let sharedContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.verifd.app") else {
            return false
        }
        
        let expiredNumbersURL = sharedContainer.appendingPathComponent("expired_numbers.json")
        
        do {
            guard FileManager.default.fileExists(atPath: expiredNumbersURL.path) else { return false }
            
            let data = try Data(contentsOf: expiredNumbersURL)
            let expiredNumbers = try JSONDecoder().decode([ExpiredNumber].self, from: data)
            
            // Check if this number recently expired (within grace period)
            let gracePeriod: TimeInterval = 24 * 60 * 60 // 24 hours
            let cutoffDate = Date().addingTimeInterval(-gracePeriod)
            
            return expiredNumbers.contains { expired in
                expired.phoneNumber == phoneNumber &&
                expired.expiredDate > cutoffDate
            }
            
        } catch {
            NSLog("Failed to check expired numbers: \(error)")
            return false
        }
    }
    
    /// Record an expired number for potential deny-after-expiry logic
    func recordExpiredNumber(phoneNumber: String, name: String) {
        guard let sharedContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.verifd.app") else { return }
        
        let expiredNumbersURL = sharedContainer.appendingPathComponent("expired_numbers.json")
        
        do {
            var expiredNumbers: [ExpiredNumber] = []
            
            // Load existing expired numbers
            if FileManager.default.fileExists(atPath: expiredNumbersURL.path) {
                let data = try Data(contentsOf: expiredNumbersURL)
                expiredNumbers = try JSONDecoder().decode([ExpiredNumber].self, from: data)
            }
            
            // Add new expired number
            let expiredNumber = ExpiredNumber(
                phoneNumber: phoneNumber,
                name: name,
                expiredDate: Date()
            )
            
            expiredNumbers.append(expiredNumber)
            
            // Clean up old records (older than 30 days)
            let thirtyDaysAgo = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
            expiredNumbers = expiredNumbers.filter { $0.expiredDate > thirtyDaysAgo }
            
            // Save updated list
            let data = try JSONEncoder().encode(expiredNumbers)
            try data.write(to: expiredNumbersURL)
            
        } catch {
            NSLog("Failed to record expired number: \(error)")
        }
    }
    
    /// Provide user notification for potential spam (manual action required)
    func notifyPotentialSpam(phoneNumber: String, name: String) {
        // iOS doesn't allow automatic call rejection
        // Best we can do is notify the user
        
        let content = UNMutableNotificationContent()
        content.title = "Potential Spam Call"
        content.body = "\(name) (\(phoneNumber)) - expired verifd pass attempting callback"
        content.sound = .default
        
        let request = UNNotificationRequest(
            identifier: "expired-callback-\(phoneNumber)",
            content: content,
            trigger: nil
        )
        
        UNUserNotificationCenter.current().add(request)
    }
}

/// Model for tracking expired numbers
struct ExpiredNumber: Codable {
    let phoneNumber: String
    let name: String
    let expiredDate: Date
}