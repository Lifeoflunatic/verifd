import Foundation

/// Pattern matcher for detecting verifd verification messages
/// PRIVACY: This class performs all matching locally and never transmits message content
class VerificationPatternMatcher {
    
    // MARK: - Pattern Constants
    
    /// Known verifd domains for verification links
    private static let verifdDomains = [
        "verifd.com",
        "verify.verifd.com",
        "v.verifd.com",
        "vfd.link"
    ]
    
    /// Verification token patterns (alphanumeric tokens of specific lengths)
    private static let tokenPatterns = [
        "\\b[A-Za-z0-9]{8}\\b",     // 8-char tokens
        "\\b[A-Za-z0-9]{12}\\b",    // 12-char tokens
        "\\b[A-Za-z0-9]{16}\\b"     // 16-char tokens
    ]
    
    /// Keywords that indicate verification content
    private static let verificationKeywords = [
        "verify",
        "verification",
        "identity",
        "verifd",
        "expires",
        "confirm"
    ]
    
    // MARK: - Pattern Matching
    
    /// Determines if a message appears to be a verifd verification message
    /// - Parameter messageBody: The SMS message content to analyze
    /// - Returns: true if the message appears to be a verification message
    static func isVerificationMessage(_ messageBody: String) -> Bool {
        let lowercased = messageBody.lowercased()
        
        // Check for verifd domains
        if containsVerifdDomain(lowercased) {
            return true
        }
        
        // Check for verification tokens with context
        if containsVerificationToken(lowercased) && containsVerificationContext(lowercased) {
            return true
        }
        
        return false
    }
    
    /// Checks if the message contains known verifd domains
    private static func containsVerifdDomain(_ messageBody: String) -> Bool {
        return verifdDomains.contains { domain in
            messageBody.contains(domain.lowercased())
        }
    }
    
    /// Checks if the message contains verification token patterns
    private static func containsVerificationToken(_ messageBody: String) -> Bool {
        return tokenPatterns.contains { pattern in
            let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive)
            let range = NSRange(location: 0, length: messageBody.utf16.count)
            return regex?.firstMatch(in: messageBody, options: [], range: range) != nil
        }
    }
    
    /// Checks if the message contains verification context keywords
    private static func containsVerificationContext(_ messageBody: String) -> Bool {
        return verificationKeywords.contains { keyword in
            messageBody.contains(keyword)
        }
    }
    
    // MARK: - Testing Support
    
    /// Returns all configured domains (for testing)
    static func getConfiguredDomains() -> [String] {
        return verifdDomains
    }
    
    /// Returns all token patterns (for testing)
    static func getTokenPatterns() -> [String] {
        return tokenPatterns
    }
    
    /// Returns all verification keywords (for testing)
    static func getVerificationKeywords() -> [String] {
        return verificationKeywords
    }
}

// MARK: - Pattern Matcher Extension for URL Extraction

extension VerificationPatternMatcher {
    
    /// Extracts verification URLs from message content
    /// - Parameter messageBody: The message content to analyze
    /// - Returns: Array of detected verification URLs
    static func extractVerificationURLs(_ messageBody: String) -> [URL] {
        var urls: [URL] = []
        
        // Use NSDataDetector to find URLs
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(location: 0, length: messageBody.utf16.count)
        
        detector?.enumerateMatches(in: messageBody, options: [], range: range) { match, _, _ in
            if let match = match,
               let url = match.url,
               isVerifdURL(url) {
                urls.append(url)
            }
        }
        
        return urls
    }
    
    /// Checks if a URL belongs to verifd verification system
    private static func isVerifdURL(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return verifdDomains.contains { domain in
            host == domain || host.hasSuffix("." + domain)
        }
    }
}