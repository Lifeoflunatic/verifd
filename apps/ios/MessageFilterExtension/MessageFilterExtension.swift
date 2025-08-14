import IdentityLookup
import Foundation

/// MessageFilterExtension for filtering verifd verification messages
/// PRIVACY FIRST: This extension performs all filtering locally and never transmits message content
/// APP REVIEW COMPLIANCE: Only allows verification messages through, never blocks normal SMS
final class MessageFilterExtension: ILMessageFilterExtension {
    
    // MARK: - ILMessageFilterExtension Protocol
    
    override func handle(_ queryRequest: ILMessageFilterQueryRequest, context: ILMessageFilterExtensionContext, completion: @escaping (ILMessageFilterQueryResponse) -> Void) {
        
        // FEATURE FLAG: Check if Identity Lookup is enabled
        let userDefaults = UserDefaults(suiteName: "group.com.verifd.app")
        let isEnabled = userDefaults?.bool(forKey: "IDENTITY_LOOKUP_ENABLED") ?? false
        
        guard isEnabled else {
            // If disabled, allow all messages through (no filtering)
            let response = ILMessageFilterQueryResponse()
            response.action = .allow
            completion(response)
            return
        }
        
        // Extract message details
        let sender = queryRequest.sender ?? ""
        let messageBody = queryRequest.messageBody ?? ""
        
        // Create response object
        let response = ILMessageFilterQueryResponse()
        
        // PRIVACY: All analysis happens locally, no data leaves device
        let isVerificationMessage = VerificationPatternMatcher.isVerificationMessage(messageBody)
        
        if isVerificationMessage {
            // Allow verification messages through to ensure delivery
            response.action = .allow
            
            // Optional: Add sub-action for organization (iOS will handle appropriately)
            response.subAction = .none
            
            NSLog("MessageFilterExtension: Allowing verification message from \(sender)")
        } else {
            // For non-verification messages, take no action (system default behavior)
            // This ensures we never accidentally block legitimate messages
            response.action = .none
            
            NSLog("MessageFilterExtension: No action on regular message from \(sender)")
        }
        
        // Complete the filtering request
        completion(response)
    }
    
    override func handle(_ capabilitiesQueryRequest: ILMessageFilterCapabilitiesQueryRequest, context: ILMessageFilterExtensionContext, completion: @escaping (ILMessageFilterCapabilitiesQueryResponse) -> Void) {
        
        // Define our filtering capabilities
        let response = ILMessageFilterCapabilitiesQueryResponse()
        
        // We only support transactional filtering (not promotional)
        // This is appropriate for verification messages
        response.transactionalSubActions = [.none]
        response.promotionalSubActions = []
        
        NSLog("MessageFilterExtension: Reporting capabilities")
        completion(response)
    }
}

// MARK: - Local Pattern Matching (Privacy-First Implementation)

extension MessageFilterExtension {
    
    /// Simple pattern matcher embedded in extension for maximum privacy
    /// This is a lightweight version of VerificationPatternMatcher for the extension context
    private static func isVerificationMessage(_ messageBody: String) -> Bool {
        let lowercased = messageBody.lowercased()
        
        // Check for verifd domains
        let verifdDomains = ["verifd.com", "verify.verifd.com", "v.verifd.com", "vfd.link"]
        for domain in verifdDomains {
            if lowercased.contains(domain) {
                return true
            }
        }
        
        // Check for verification context + tokens
        let verificationKeywords = ["verify", "verification", "verifd", "expires"]
        let hasVerificationContext = verificationKeywords.contains { lowercased.contains($0) }
        
        if hasVerificationContext {
            // Look for token-like patterns (simple alphanumeric sequences)
            let tokenPattern = "\\b[A-Za-z0-9]{8,16}\\b"
            let regex = try? NSRegularExpression(pattern: tokenPattern, options: .caseInsensitive)
            let range = NSRange(location: 0, length: messageBody.utf16.count)
            
            if regex?.firstMatch(in: messageBody, options: [], range: range) != nil {
                return true
            }
        }
        
        return false
    }
}