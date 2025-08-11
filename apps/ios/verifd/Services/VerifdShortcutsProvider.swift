import Foundation
import AppIntents

/// Provides shortcuts for Siri and Spotlight integration
/// STORE COMPLIANCE: Behind feature flags, user-discoverable shortcuts only
@available(iOS 16.0, *)
struct VerifdShortcutsProvider: AppShortcutsProvider {
    
    static var appShortcuts: [AppShortcut] {
        guard FeatureFlags.APP_SHORTCUTS_ENABLED else {
            return []
        }
        
        var shortcuts: [AppShortcut] = []
        
        // Grant 30m to Last Missed Call
        shortcuts.append(
            AppShortcut(
                intent: VerifdAppIntents.Grant30mToLastMissedCallIntent(),
                phrases: [
                    "Grant pass to last missed call with \(.applicationName)",
                    "Let last caller call back with \(.applicationName)",
                    "Allow callback from \(.applicationName)"
                ],
                shortTitle: "Grant 30m Pass",
                systemImageName: "phone.arrow.down.left"
            )
        )
        
        // Expect 15m Window
        shortcuts.append(
            AppShortcut(
                intent: VerifdAppIntents.ExpectCallWindowIntent(),
                phrases: [
                    "I'm expecting a call with \(.applicationName)",
                    "Enable call window with \(.applicationName)",
                    "Expecting verified call with \(.applicationName)"
                ],
                shortTitle: "Expect Call",
                systemImageName: "phone.fill.arrow.up.right"
            )
        )
        
        // Block Last Call (when implemented)
        if FeatureFlags.SIRI_INTEGRATION_ENABLED {
            shortcuts.append(
                AppShortcut(
                    intent: VerifdAppIntents.BlockLastCallIntent(),
                    phrases: [
                        "Block last call with \(.applicationName)",
                        "Block that number with \(.applicationName)"
                    ],
                    shortTitle: "Block Call",
                    systemImageName: "phone.down.fill"
                )
            )
        }
        
        return shortcuts
    }
    
    static var shortcutTileColor: ShortcutTileColor {
        return .blue
    }
}

/// Extended shortcuts provider for additional Siri integration
@available(iOS 16.0, *)
extension VerifdShortcutsProvider {
    
    /// Provides contextual shortcuts based on app state
    static func getContextualShortcuts() -> [AppShortcut] {
        guard FeatureFlags.SIRI_INTEGRATION_ENABLED else {
            return []
        }
        
        var contextualShortcuts: [AppShortcut] = []
        
        // If expecting window is active, provide extend shortcut
        if ExpectingWindowManager.shared.isExpectingWindowActive() {
            let extendIntent = VerifdAppIntents.ExpectCallWindowIntent()
            
            contextualShortcuts.append(
                AppShortcut(
                    intent: extendIntent,
                    phrases: [
                        "Extend my call window with \(.applicationName)",
                        "Keep expecting calls with \(.applicationName)"
                    ],
                    shortTitle: "Extend Window",
                    systemImageName: "clock.arrow.clockwise"
                )
            )
        }
        
        return contextualShortcuts
    }
    
    /// Register shortcuts with system for better Siri recognition
    static func registerShortcuts() async {
        guard FeatureFlags.SIRI_INTEGRATION_ENABLED else {
            return
        }
        
        // This would be called during app launch to improve Siri recognition
        // The system learns from user interactions with shortcuts
        do {
            try await AppShortcutsProvider.updateAppShortcutParameters()
            NSLog("VerifdShortcutsProvider: Updated shortcut parameters")
        } catch {
            NSLog("VerifdShortcutsProvider: Failed to update shortcuts: \(error)")
        }
    }
}

/// Spotlight integration for shortcuts
@available(iOS 16.0, *)
extension VerifdShortcutsProvider {
    
    /// Configure shortcuts for Spotlight search
    static func configureSpotlightIntegration() {
        guard FeatureFlags.APP_SHORTCUTS_ENABLED else {
            return
        }
        
        // Create searchable items for shortcuts
        let searchableItems = createSearchableShortcutItems()
        
        // Index items for Spotlight
        CSSearchableIndex.default().indexSearchableItems(searchableItems) { error in
            if let error = error {
                NSLog("VerifdShortcutsProvider: Failed to index shortcuts: \(error)")
            } else {
                NSLog("VerifdShortcutsProvider: Indexed \(searchableItems.count) shortcuts for Spotlight")
            }
        }
    }
    
    private static func createSearchableShortcutItems() -> [CSSearchableItem] {
        var items: [CSSearchableItem] = []
        
        // Grant pass shortcut
        let grantPassItem = createSearchableItem(
            identifier: "grant-pass-shortcut",
            title: "Grant Pass to Last Missed Call",
            description: "Allow the last missed caller to call you back",
            keywords: ["grant", "pass", "callback", "missed", "call", "verify"]
        )
        items.append(grantPassItem)
        
        // Expect call shortcut
        let expectCallItem = createSearchableItem(
            identifier: "expect-call-shortcut",
            title: "Expect Verified Call",
            description: "Enable window for verified callers to reach you",
            keywords: ["expect", "call", "window", "verify", "verified"]
        )
        items.append(expectCallItem)
        
        return items
    }
    
    private static func createSearchableItem(
        identifier: String,
        title: String,
        description: String,
        keywords: [String]
    ) -> CSSearchableItem {
        let attributeSet = CSSearchableItemAttributeSet(contentType: .item)
        attributeSet.title = title
        attributeSet.contentDescription = description
        attributeSet.keywords = keywords
        attributeSet.contentType = "com.verifd.shortcut"
        
        return CSSearchableItem(
            uniqueIdentifier: identifier,
            domainIdentifier: "shortcuts",
            attributeSet: attributeSet
        )
    }
}

// MARK: - Import Required Frameworks

import CoreSpotlight
import MobileCoreServices

// MARK: - Shortcut Analytics

@available(iOS 16.0, *)
extension VerifdShortcutsProvider {
    
    /// Track shortcut usage for analytics (privacy-compliant)
    static func trackShortcutUsage(shortcutId: String, source: ShortcutSource) {
        // Only track basic usage statistics locally
        let usage = ShortcutUsage(
            shortcutId: shortcutId,
            source: source,
            timestamp: Date()
        )
        
        // Store locally for app improvement
        storeShortcutUsage(usage)
    }
    
    private static func storeShortcutUsage(_ usage: ShortcutUsage) {
        let defaults = UserDefaults.standard
        var usageHistory = defaults.array(forKey: "shortcut_usage") as? [Data] ?? []
        
        do {
            let data = try JSONEncoder().encode(usage)
            usageHistory.append(data)
            
            // Keep only last 100 usage events
            if usageHistory.count > 100 {
                usageHistory = Array(usageHistory.suffix(100))
            }
            
            defaults.set(usageHistory, forKey: "shortcut_usage")
        } catch {
            NSLog("VerifdShortcutsProvider: Failed to store usage: \(error)")
        }
    }
}

// MARK: - Supporting Types

enum ShortcutSource: String, Codable {
    case siri = "siri"
    case spotlight = "spotlight"
    case shortcuts_app = "shortcuts_app"
    case widget = "widget"
}

struct ShortcutUsage: Codable {
    let shortcutId: String
    let source: ShortcutSource
    let timestamp: Date
}