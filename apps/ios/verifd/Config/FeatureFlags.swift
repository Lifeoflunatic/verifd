import Foundation

/// Feature flags for verifd iOS app
/// STORE COMPLIANCE: All features behind flags for gradual rollout and A/B testing
enum FeatureFlags {
    
    // MARK: - App Shortcuts
    static var APP_SHORTCUTS_ENABLED: Bool {
        #if DEBUG
        return UserDefaults.standard.object(forKey: "APP_SHORTCUTS_ENABLED") as? Bool ?? true
        #else
        return UserDefaults.standard.object(forKey: "APP_SHORTCUTS_ENABLED") as? Bool ?? false
        #endif
    }
    
    // MARK: - Time-Sensitive Notifications
    static var TIME_SENSITIVE_NOTIFICATIONS_ENABLED: Bool {
        #if DEBUG
        return UserDefaults.standard.object(forKey: "TIME_SENSITIVE_NOTIFICATIONS_ENABLED") as? Bool ?? true
        #else
        return UserDefaults.standard.object(forKey: "TIME_SENSITIVE_NOTIFICATIONS_ENABLED") as? Bool ?? false
        #endif
    }
    
    // MARK: - Siri Integration
    static var SIRI_INTEGRATION_ENABLED: Bool {
        #if DEBUG
        return UserDefaults.standard.object(forKey: "SIRI_INTEGRATION_ENABLED") as? Bool ?? true
        #else
        return UserDefaults.standard.object(forKey: "SIRI_INTEGRATION_ENABLED") as? Bool ?? false
        #endif
    }
    
    // MARK: - IdentityLookup Message Filtering
    static var IDENTITY_LOOKUP_ENABLED: Bool {
        #if DEBUG
        return UserDefaults.standard.object(forKey: "IDENTITY_LOOKUP_ENABLED") as? Bool ?? true
        #else
        return UserDefaults.standard.object(forKey: "IDENTITY_LOOKUP_ENABLED") as? Bool ?? false
        #endif
    }
    
    // MARK: - Administrative Methods
    
    /// Set feature flag for testing/admin purposes
    static func setFeatureFlag(_ key: String, enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: key)
    }
    
    /// Get all feature flags status
    static func getAllFlags() -> [String: Bool] {
        return [
            "APP_SHORTCUTS_ENABLED": APP_SHORTCUTS_ENABLED,
            "TIME_SENSITIVE_NOTIFICATIONS_ENABLED": TIME_SENSITIVE_NOTIFICATIONS_ENABLED,
            "SIRI_INTEGRATION_ENABLED": SIRI_INTEGRATION_ENABLED,
            "IDENTITY_LOOKUP_ENABLED": IDENTITY_LOOKUP_ENABLED
        ]
    }
}