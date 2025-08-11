//
//  IdentityLookupHelper.swift
//  verifd
//
//  Helper for IdentityLookup extension integration
//

import Foundation
import IdentityLookup

/// Helper class for managing IdentityLookup functionality
class IdentityLookupHelper {
    
    static let shared = IdentityLookupHelper()
    
    // Configuration
    private let stagingOverrideNumbers = [
        "+919233600392",  // Primary tester
        "+917575854485"   // Secondary tester
    ]
    
    // Cache for vPass data
    private var vPassCache: [String: VPassInfo] = [:]
    
    private init() {
        // Load cached vPass data
        loadVPassCache()
    }
    
    // MARK: - Public Methods
    
    /// Check if a phone number has an active vPass
    func hasActiveVPass(_ phoneNumber: String) -> Bool {
        let normalized = normalizePhoneNumber(phoneNumber)
        
        // Check staging overrides first
        if isStaging() && stagingOverrideNumbers.contains(normalized) {
            print("[IdentityLookup] Override user detected: \(masked(normalized))")
            return true
        }
        
        // Check vPass cache
        if let vPass = vPassCache[normalized] {
            return !vPass.isExpired
        }
        
        return false
    }
    
    /// Get label for a phone number
    func getLabel(for phoneNumber: String) -> String? {
        let normalized = normalizePhoneNumber(phoneNumber)
        
        // Staging overrides get special label
        if isStaging() && stagingOverrideNumbers.contains(normalized) {
            return "✓ verifd QA Tester"
        }
        
        // Check vPass cache
        if let vPass = vPassCache[normalized], !vPass.isExpired {
            let timeLeft = vPass.timeRemaining
            if timeLeft > 0 {
                return "✓ verifd (\(formatDuration(timeLeft)))"
            }
        }
        
        return nil
    }
    
    /// Update vPass cache with new data
    func updateVPass(_ phoneNumber: String, info: VPassInfo) {
        let normalized = normalizePhoneNumber(phoneNumber)
        vPassCache[normalized] = info
        saveVPassCache()
        
        // Notify extension to reload
        notifyExtensionToReload()
    }
    
    /// Remove expired vPasses from cache
    func cleanupExpiredPasses() {
        let now = Date()
        var removed = 0
        
        for (number, vPass) in vPassCache {
            if vPass.expiresAt < now {
                vPassCache.removeValue(forKey: number)
                removed += 1
            }
        }
        
        if removed > 0 {
            print("[IdentityLookup] Removed \(removed) expired vPasses")
            saveVPassCache()
            notifyExtensionToReload()
        }
    }
    
    // MARK: - Helper Methods for Extension
    
    /// Get all active vPass numbers for extension
    func getActiveNumbersForExtension() -> [String: String] {
        var result: [String: String] = [:]
        
        // Add staging overrides if in staging
        if isStaging() {
            for number in stagingOverrideNumbers {
                result[number] = "✓ verifd QA Tester"
            }
        }
        
        // Add active vPasses
        let now = Date()
        for (number, vPass) in vPassCache {
            if vPass.expiresAt > now {
                let timeLeft = vPass.timeRemaining
                result[number] = "✓ verifd (\(formatDuration(timeLeft)))"
            }
        }
        
        return result
    }
    
    // MARK: - Private Methods
    
    private func normalizePhoneNumber(_ number: String) -> String {
        // Remove all non-digits
        let digits = number.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()
        
        // Add country code if missing
        if digits.hasPrefix("1") && digits.count == 11 {
            return "+\(digits)"
        } else if digits.hasPrefix("91") && digits.count == 12 {
            return "+\(digits)"
        } else if digits.count == 10 {
            // Assume US number
            return "+1\(digits)"
        }
        
        return "+\(digits)"
    }
    
    private func masked(_ phoneNumber: String) -> String {
        // Show last 4 digits only
        if phoneNumber.count > 4 {
            let lastFour = String(phoneNumber.suffix(4))
            return "***\(lastFour)"
        }
        return "****"
    }
    
    private func formatDuration(_ seconds: Int) -> String {
        if seconds < 60 {
            return "\(seconds)s"
        } else if seconds < 3600 {
            return "\(seconds / 60)m"
        } else if seconds < 86400 {
            return "\(seconds / 3600)h"
        } else {
            return "\(seconds / 86400)d"
        }
    }
    
    private func isStaging() -> Bool {
        #if STAGING
        return true
        #else
        return ProcessInfo.processInfo.environment["ENVIRONMENT"] == "staging"
        #endif
    }
    
    // MARK: - Cache Management
    
    private func loadVPassCache() {
        guard let data = UserDefaults.shared.data(forKey: "vPassCache"),
              let decoded = try? JSONDecoder().decode([String: VPassInfo].self, from: data) else {
            return
        }
        vPassCache = decoded
    }
    
    private func saveVPassCache() {
        guard let encoded = try? JSONEncoder().encode(vPassCache) else { return }
        UserDefaults.shared.set(encoded, forKey: "vPassCache")
    }
    
    private func notifyExtensionToReload() {
        // Use Darwin notifications to notify extension
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName("com.verifd.identity.reload" as CFString),
            nil,
            nil,
            true
        )
    }
}

// MARK: - Shared UserDefaults
extension UserDefaults {
    static let shared = UserDefaults(suiteName: "group.com.verifd.shared")!
}

// MARK: - VPass Info Model
struct VPassInfo: Codable {
    let phoneNumber: String
    let callerName: String
    let expiresAt: Date
    let duration: VPassDuration
    
    var isExpired: Bool {
        return Date() > expiresAt
    }
    
    var timeRemaining: Int {
        let seconds = Int(expiresAt.timeIntervalSinceNow)
        return max(0, seconds)
    }
    
    enum VPassDuration: String, Codable {
        case minutes30 = "30m"
        case hours24 = "24h"
        case days30 = "30d"
    }
}

// MARK: - Extension Helper Methods
extension IdentityLookupHelper {
    
    /// Called by the extension to get blocking/identification data
    func getIdentificationData() -> IdentificationData {
        let activeNumbers = getActiveNumbersForExtension()
        
        return IdentificationData(
            identifiedNumbers: activeNumbers,
            blockedNumbers: [],  // We don't block, only identify
            lastUpdated: Date()
        )
    }
    
    struct IdentificationData {
        let identifiedNumbers: [String: String]  // number -> label
        let blockedNumbers: Set<String>
        let lastUpdated: Date
    }
}