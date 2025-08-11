//
//  IdentityLookupHandler.swift
//  IdentityLookupExtension
//
//  Handles caller identification for verifd vPass holders
//

import Foundation
import IdentityLookup

class IdentityLookupHandler: ILClassificationController {
    
    // Staging override numbers
    private let stagingOverrides = [
        "+919233600392",  // Primary tester
        "+917575854485"   // Secondary tester
    ]
    
    override init() {
        super.init()
        
        // Register for reload notifications
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            nil,
            { _, _, name, _, _ in
                NotificationCenter.default.post(name: Notification.Name("ReloadData"), object: nil)
            },
            "com.verifd.identity.reload" as CFString,
            nil,
            .deliverImmediately
        )
    }
    
    // MARK: - Classification Request
    
    override func classificationResponse(for request: ILClassificationRequest) -> ILClassificationResponse {
        let response = ILClassificationResponse(action: .none)
        
        // Get phone numbers from request
        for phoneNumber in request.phoneNumbers ?? [] {
            let classification = classifyNumber(phoneNumber)
            
            switch classification {
            case .identified(let label):
                response.action = .report
                response.userInfo = [
                    "label": label,
                    "verified": true
                ]
                
            case .stagingOverride:
                response.action = .report
                response.userInfo = [
                    "label": "✓ verifd QA Tester",
                    "staging": true
                ]
                
            case .unknown:
                // Don't modify for unknown numbers
                response.action = .none
            }
            
            // Only process first number
            break
        }
        
        return response
    }
    
    // MARK: - Private Methods
    
    private enum Classification {
        case identified(label: String)
        case stagingOverride
        case unknown
    }
    
    private func classifyNumber(_ phoneNumber: String) -> Classification {
        let normalized = normalizePhoneNumber(phoneNumber)
        
        // Check staging overrides first
        if isStaging() && stagingOverrides.contains(normalized) {
            logClassification(normalized, result: "staging_override")
            return .stagingOverride
        }
        
        // Check vPass cache
        if let label = getVPassLabel(for: normalized) {
            logClassification(normalized, result: "vpass_active")
            return .identified(label: label)
        }
        
        logClassification(normalized, result: "unknown")
        return .unknown
    }
    
    private func getVPassLabel(for phoneNumber: String) -> String? {
        // Access shared UserDefaults
        guard let sharedDefaults = UserDefaults(suiteName: "group.com.verifd.shared"),
              let data = sharedDefaults.data(forKey: "vPassCache"),
              let vPassCache = try? JSONDecoder().decode([String: VPassInfo].self, from: data) else {
            return nil
        }
        
        // Check if number has active vPass
        if let vPass = vPassCache[phoneNumber], !vPass.isExpired {
            let timeLeft = vPass.timeRemaining
            if timeLeft > 0 {
                return "✓ verifd (\(formatDuration(timeLeft)))"
            }
        }
        
        return nil
    }
    
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
        // Check Info.plist for environment
        if let environment = Bundle.main.infoDictionary?["ENVIRONMENT"] as? String {
            return environment == "staging"
        }
        return false
        #endif
    }
    
    private func logClassification(_ phoneNumber: String, result: String) {
        // Log to shared container for debugging
        let masked = phoneNumber.suffix(4)
        NSLog("[IdentityLookup] Classified ***\(masked): \(result)")
    }
}

// MARK: - VPass Info Model (Duplicated for extension)
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