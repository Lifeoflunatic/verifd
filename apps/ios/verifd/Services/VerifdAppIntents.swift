import Foundation
import AppIntents
import CallKit

/// iOS 16+ App Intents for verifd shortcuts
/// STORE COMPLIANCE: Behind feature flag, user-initiated only
@available(iOS 16.0, *)
struct VerifdAppIntents {
    
    // MARK: - Grant 30m Pass to Last Missed Call
    
    struct Grant30mToLastMissedCallIntent: AppIntent {
        static var title: LocalizedStringResource = "Grant 30m to Last Missed Call"
        static var description = IntentDescription("Grant a 30-minute verification pass to the last missed call")
        
        static var openAppWhenRun: Bool = false
        
        func perform() async throws -> some IntentResult & ProvidesDialog {
            guard FeatureFlags.APP_SHORTCUTS_ENABLED else {
                throw VerifdIntentError.featureDisabled
            }
            
            // Get last missed call from CallKit
            guard let lastMissedNumber = await getLastMissedCall() else {
                return .result(dialog: "No recent missed calls found.")
            }
            
            // Grant 30-minute pass
            let result = await VerifdPassManager.shared.grantPassToNumber(
                phoneNumber: lastMissedNumber,
                passType: .thirtyMinutes,
                name: "Last Missed Call"
            )
            
            switch result {
            case .success:
                // Schedule time-sensitive notification if enabled
                if FeatureFlags.TIME_SENSITIVE_NOTIFICATIONS_ENABLED {
                    await TimeSensitiveNotificationScheduler.shared.scheduleExpectingCallNotification(
                        phoneNumber: lastMissedNumber,
                        duration: 30 * 60
                    )
                }
                
                let formattedNumber = formatPhoneNumber(lastMissedNumber)
                return .result(dialog: "✓ Granted 30-minute pass to \(formattedNumber). They can call back now.")
                
            case .failure(let error):
                return .result(dialog: "Failed to grant pass: \(error.localizedDescription)")
            }
        }
        
        private func getLastMissedCall() async -> String? {
            // Use CallKit to get recent calls
            // This is a simplified implementation - in practice you'd integrate with CallKit history
            // For now, return nil to indicate no missed calls
            return nil
        }
        
        private func formatPhoneNumber(_ number: String) -> String {
            // Format phone number for display
            if number.hasPrefix("+1") && number.count == 12 {
                let digits = String(number.dropFirst(2))
                return "(\(digits.prefix(3))) \(digits.dropFirst(3).prefix(3))-\(digits.suffix(4))"
            }
            return number
        }
    }
    
    // MARK: - Expect Call Window Intent
    
    struct ExpectCallWindowIntent: AppIntent {
        static var title: LocalizedStringResource = "Expect Call"
        static var description = IntentDescription("Enable expecting call window for 15 or 30 minutes")
        
        @Parameter(title: "Duration", optionsProvider: DurationOptionsProvider())
        var duration: String
        
        static var openAppWhenRun: Bool = false
        
        func perform() async throws -> some IntentResult & ProvidesDialog {
            guard FeatureFlags.APP_SHORTCUTS_ENABLED else {
                throw VerifdIntentError.featureDisabled
            }
            
            let windowDuration: TimeInterval
            let displayDuration: String
            
            switch duration {
            case "15m":
                windowDuration = 15 * 60
                displayDuration = "15 minutes"
            case "30m":
                windowDuration = 30 * 60
                displayDuration = "30 minutes"
            default:
                windowDuration = 15 * 60
                displayDuration = "15 minutes"
            }
            
            // Enable expecting window
            await ExpectingWindowManager.shared.enableExpectingWindow(duration: windowDuration)
            
            // Schedule time-sensitive notification if enabled
            if FeatureFlags.TIME_SENSITIVE_NOTIFICATIONS_ENABLED {
                await TimeSensitiveNotificationScheduler.shared.scheduleExpectingWindowNotification(
                    duration: windowDuration
                )
            }
            
            return .result(dialog: "✓ Expecting calls window active for \(displayDuration). Verified callers can reach you.")
        }
    }
    
    // MARK: - Block Last Call Intent
    
    struct BlockLastCallIntent: AppIntent {
        static var title: LocalizedStringResource = "Block Last Call"
        static var description = IntentDescription("Block the last incoming call number")
        
        static var openAppWhenRun: Bool = false
        
        func perform() async throws -> some IntentResult & ProvidesDialog {
            guard FeatureFlags.APP_SHORTCUTS_ENABLED else {
                throw VerifdIntentError.featureDisabled
            }
            
            // This would integrate with Call Directory Extension to block numbers
            // For now, return a placeholder response
            return .result(dialog: "Call blocking is not yet implemented. Use your phone's built-in blocking features.")
        }
    }
    
    // MARK: - Supporting Types
    
    struct DurationOptionsProvider: DynamicOptionsProvider {
        func results() async throws -> [String] {
            return ["15m", "30m"]
        }
        
        func defaultResult() async -> String? {
            return "15m"
        }
    }
}

// MARK: - VerifdPassManager Extension

extension VerifdPassManager {
    
    enum PassGrantResult {
        case success
        case failure(Error)
    }
    
    func grantPassToNumber(phoneNumber: String, passType: PassType, name: String) async -> PassGrantResult {
        return await withCheckedContinuation { continuation in
            createTempContact(phoneNumber: phoneNumber, name: name, passType: passType) { success in
                if success {
                    continuation.resume(returning: .success)
                } else {
                    continuation.resume(returning: .failure(VerifdIntentError.passGrantFailed))
                }
            }
        }
    }
}

// MARK: - Error Types

enum VerifdIntentError: Error, LocalizedError {
    case featureDisabled
    case passGrantFailed
    case noRecentCalls
    case networkError
    
    var errorDescription: String? {
        switch self {
        case .featureDisabled:
            return "This feature is currently disabled"
        case .passGrantFailed:
            return "Failed to grant verification pass"
        case .noRecentCalls:
            return "No recent calls found"
        case .networkError:
            return "Network error occurred"
        }
    }
}