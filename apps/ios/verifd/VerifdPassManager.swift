import Foundation
import Contacts
import CallKit
import UIKit

/// Manages verification passes and temporary contacts
/// Privacy-first, store-safe implementation
class VerifdPassManager {
    static let shared = VerifdPassManager()
    private let contactStore = CNContactStore()
    private let appGroupIdentifier = "group.com.verifd.app"
    
    private init() {}
    
    // MARK: - Temp Contact Management (30-day passes only)
    
    func createTempContact(phoneNumber: String, name: String, passType: PassType, completion: @escaping (Bool) -> Void) {
        // Only create temp contacts for 30-day passes
        guard passType == .thirtyDays else {
            // For shorter passes, just store in shared container for Call Directory
            storeVerifiedNumber(phoneNumber: phoneNumber, name: name, passType: passType)
            completion(true)
            return
        }
        
        // STORE COMPLIANCE: Use dedicated ContactService for permission management
        ContactService.shared.createTempContact(phoneNumber: phoneNumber, name: name) { result in
            switch result {
            case .success:
                // Also store in shared container for Call Directory
                self.storeVerifiedNumber(phoneNumber: phoneNumber, name: name, passType: passType)
                completion(true)
            case .permissionDenied:
                completion(false)
            case .failedOfferGroup:
                // Offer to create group as fallback
                self.offerGroupCreationFallback(phoneNumber: phoneNumber, name: name, completion: completion)
            case .failed:
                completion(false)
            }
        }
    }
    
    /// STORE COMPLIANCE: Offer group creation as fallback when contact creation fails
    private func offerGroupCreationFallback(phoneNumber: String, name: String, completion: @escaping (Bool) -> Void) {
        DispatchQueue.main.async {
            guard let topViewController = self.getTopViewController() else {
                completion(false)
                return
            }
            
            let alert = UIAlertController(
                title: "Contact Creation Failed",
                message: "Would you like to create a 'verifd Passes' group instead? You can manually add contacts to this group for 30-day verification.",
                preferredStyle: .alert
            )
            
            alert.addAction(UIAlertAction(title: "Create Group", style: .default) { _ in
                ContactService.shared.createVerifdGroup { success in
                    if success {
                        // Still store in shared container
                        self.storeVerifiedNumber(phoneNumber: phoneNumber, name: name, passType: .thirtyDays)
                    }
                    completion(success)
                }
            })
            
            alert.addAction(UIAlertAction(title: "Skip", style: .cancel) { _ in
                // Just store in shared container without contact
                self.storeVerifiedNumber(phoneNumber: phoneNumber, name: name, passType: .thirtyDays)
                completion(true)
            })
            
            topViewController.present(alert, animated: true)
        }
    }
    
    private func getTopViewController() -> UIViewController? {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = windowScene.windows.first else {
            return nil
        }
        
        var topViewController = window.rootViewController
        while let presentedViewController = topViewController?.presentedViewController {
            topViewController = presentedViewController
        }
        
        return topViewController
    }
    
    // Contact creation methods moved to ContactService for better separation of concerns
    // and store compliance. VerifdPassManager focuses on pass logic and shared storage.
    
    // MARK: - Shortcut Mode (15-30 minutes)
    
    func enableShortcutMode(duration: TimeInterval) {
        let expiryDate = Date().addingTimeInterval(duration)
        
        // Store shortcut mode state
        if let sharedContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) {
            let shortcutURL = sharedContainer.appendingPathComponent("shortcut_mode.json")
            let shortcutData = ShortcutMode(isActive: true, expiryDate: expiryDate)
            
            do {
                let data = try JSONEncoder().encode(shortcutData)
                try data.write(to: shortcutURL)
            } catch {
                NSLog("Failed to store shortcut mode: \(error)")
            }
        }
        
        // Schedule automatic deactivation
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            self.disableShortcutMode()
        }
    }
    
    private func disableShortcutMode() {
        guard let sharedContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else { return }
        
        let shortcutURL = sharedContainer.appendingPathComponent("shortcut_mode.json")
        try? FileManager.default.removeItem(at: shortcutURL)
    }
    
    // MARK: - Background Purge
    
    func purgeExpiredPasses() {
        // Remove expired temp contacts
        purgeExpiredTempContacts()
        
        // Clean up verified numbers storage
        cleanupVerifiedNumbers()
        
        // Reload Call Directory Extension
        CXCallDirectoryManager.sharedInstance.reloadExtension(withIdentifier: "com.verifd.app.CallDirectoryExtension") { error in
            if let error = error {
                NSLog("Failed to reload call directory: \(error)")
            }
        }
    }
    
    private func purgeExpiredTempContacts() {
        // STORE COMPLIANCE: Delegate to ContactService for contact cleanup
        ContactService.shared.cleanupExpiredContacts()
    }
    
    // Contact expiry checking moved to ContactService
    
    // MARK: - Shared Storage for Call Directory
    
    private func storeVerifiedNumber(phoneNumber: String, name: String, passType: PassType) {
        guard let sharedContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else { return }
        
        let verifiedNumbersURL = sharedContainer.appendingPathComponent("verified_numbers.json")
        
        do {
            var verifiedNumbers: [VerifiedNumber] = []
            
            // Load existing numbers
            if FileManager.default.fileExists(atPath: verifiedNumbersURL.path) {
                let data = try Data(contentsOf: verifiedNumbersURL)
                verifiedNumbers = try JSONDecoder().decode([VerifiedNumber].self, from: data)
            }
            
            // Calculate expiry based on pass type
            let expiryDate: Date
            switch passType {
            case .fifteenMinutes:
                expiryDate = Date().addingTimeInterval(15 * 60)
            case .thirtyMinutes:
                expiryDate = Date().addingTimeInterval(30 * 60)
            case .twentyFourHours:
                expiryDate = Date().addingTimeInterval(24 * 60 * 60)
            case .thirtyDays:
                expiryDate = Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date()
            }
            
            // Add new verified number
            let newNumber = VerifiedNumber(
                phoneNumber: phoneNumber,
                name: name,
                expiryDate: expiryDate,
                passType: passType
            )
            
            verifiedNumbers.append(newNumber)
            
            // Save updated list
            let data = try JSONEncoder().encode(verifiedNumbers)
            try data.write(to: verifiedNumbersURL)
            
        } catch {
            NSLog("Failed to store verified number: \(error)")
        }
    }
    
    private func cleanupVerifiedNumbers() {
        guard let sharedContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else { return }
        
        let verifiedNumbersURL = sharedContainer.appendingPathComponent("verified_numbers.json")
        
        do {
            guard FileManager.default.fileExists(atPath: verifiedNumbersURL.path) else { return }
            
            let data = try Data(contentsOf: verifiedNumbersURL)
            let verifiedNumbers = try JSONDecoder().decode([VerifiedNumber].self, from: data)
            
            // Filter out expired numbers
            let activeNumbers = verifiedNumbers.filter { !$0.isExpired }
            
            // Save cleaned list
            let cleanData = try JSONEncoder().encode(activeNumbers)
            try cleanData.write(to: verifiedNumbersURL)
            
        } catch {
            NSLog("Failed to cleanup verified numbers: \(error)")
        }
    }
    
    // MARK: - Permissions
    // Permission management moved to ContactService for better store compliance
}

// MARK: - Supporting Types

struct ShortcutMode: Codable {
    let isActive: Bool
    let expiryDate: Date
}

enum VerifdError: Error {
    case shortcutModeFailed
    case sharedContainerUnavailable
}