import Foundation
import Contacts

/// Store-safe contact management service for verifd
/// Ensures CNContactStore.requestAccess is called before ANY contact creation
/// Provides fallback to contact groups when contact creation fails
class ContactService {
    static let shared = ContactService()
    private let contactStore = CNContactStore()
    
    private init() {}
    
    // MARK: - Store-Safe Contact Permission Management
    
    /// Explicitly request contacts permission with user flow
    /// STORE COMPLIANCE: Always call this before ANY contact operations
    func requestContactsAccess(completion: @escaping (Bool) -> Void) {
        let authStatus = CNContactStore.authorizationStatus(for: .contacts)
        
        switch authStatus {
        case .authorized:
            completion(true)
        case .denied, .restricted:
            completion(false)
        case .notDetermined:
            // STORE COMPLIANCE: Explicit user permission request
            contactStore.requestAccess(for: .contacts) { granted, error in
                DispatchQueue.main.async {
                    completion(granted)
                }
            }
        @unknown default:
            completion(false)
        }
    }
    
    /// Check current contacts permission status without requesting
    func contactsPermissionStatus() -> CNAuthorizationStatus {
        return CNContactStore.authorizationStatus(for: .contacts)
    }
    
    // MARK: - 30-Day vPass Contact Creation
    
    /// Create temporary contact for 30-day vPass (user-initiated only)
    /// STORE COMPLIANCE: Requires explicit user permission and action
    func createTempContact(phoneNumber: String, name: String, completion: @escaping (ContactCreationResult) -> Void) {
        // STORE COMPLIANCE: Always check permission before contact creation
        requestContactsAccess { [weak self] granted in
            guard let self = self, granted else {
                completion(.permissionDenied)
                return
            }
            
            self.performContactCreation(phoneNumber: phoneNumber, name: name, completion: completion)
        }
    }
    
    private func performContactCreation(phoneNumber: String, name: String, completion: @escaping (ContactCreationResult) -> Void) {
        do {
            // Create new contact
            let contact = CNMutableContact()
            contact.givenName = name
            contact.organizationName = "verifd Pass"
            
            // Add phone number
            let phoneNumberValue = CNLabeledValue(
                label: CNLabelPhoneNumberMain, 
                value: CNPhoneNumber(stringValue: phoneNumber)
            )
            contact.phoneNumbers = [phoneNumberValue]
            
            // Add expiry note for user visibility
            let expiryDate = Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date()
            let dateFormatter = DateFormatter()
            dateFormatter.dateStyle = .short
            contact.note = "verifd 30-day pass - expires \(dateFormatter.string(from: expiryDate))"
            
            let saveRequest = CNSaveRequest()
            
            // Try to create in verifd group first, fallback to ungrouped
            if let group = try? findOrCreateVerifdGroup() {
                saveRequest.add(contact, toContainerWithIdentifier: group.identifier)
            } else {
                // FALLBACK: Create contact with clear tagging when group fails
                contact.organizationName = "verifd Pass (Verified Caller)"
                contact.jobTitle = "30-day verification pass"
                saveRequest.add(contact, toContainerWithIdentifier: nil)
            }
            
            try contactStore.execute(saveRequest)
            completion(.success)
            
        } catch {
            NSLog("ContactService: Failed to create temp contact: \(error)")
            // Offer group creation as fallback
            completion(.failedOfferGroup)
        }
    }
    
    // MARK: - Group Creation Fallback for 30-Day vPass
    
    /// Create contact group as fallback when contact creation fails
    /// STORE COMPLIANCE: User-initiated group creation only
    func createVerifdGroup(completion: @escaping (Bool) -> Void) {
        requestContactsAccess { [weak self] granted in
            guard let self = self, granted else {
                completion(false)
                return
            }
            
            do {
                let _ = try self.findOrCreateVerifdGroup()
                completion(true)
            } catch {
                NSLog("ContactService: Failed to create verifd group: \(error)")
                completion(false)
            }
        }
    }
    
    private func findOrCreateVerifdGroup() throws -> CNGroup {
        do {
            // Check for existing group first
            let groups = try contactStore.groups(matching: nil)
            if let existingGroup = groups.first(where: { $0.name == "verifd Passes" }) {
                return existingGroup
            }
            
            // Create new group - may fail on some devices/configurations
            let newGroup = CNMutableGroup()
            newGroup.name = "verifd Passes"
            
            let saveRequest = CNSaveRequest()
            saveRequest.add(newGroup, toContainerWithIdentifier: nil)
            try contactStore.execute(saveRequest)
            
            // Re-fetch to get identifier
            let updatedGroups = try contactStore.groups(matching: nil)
            if let createdGroup = updatedGroups.first(where: { $0.name == "verifd Passes" }) {
                return createdGroup
            }
            
            throw ContactServiceError.groupCreationFailed
            
        } catch {
            NSLog("ContactService: Group operation failed: \(error)")
            throw ContactServiceError.groupCreationFailed
        }
    }
    
    // MARK: - Cleanup Operations
    
    /// Clean up expired 30-day contacts (background task only)
    func cleanupExpiredContacts() {
        guard contactsPermissionStatus() == .authorized else { return }
        
        do {
            let groups = try contactStore.groups(matching: nil)
            guard let verifdGroup = groups.first(where: { $0.name == "verifd Passes" }) else { return }
            
            let predicate = CNContact.predicateForContactsInGroup(withIdentifier: verifdGroup.identifier)
            let contacts = try contactStore.unifiedContacts(
                matching: predicate, 
                keysToFetch: [CNContactIdentifierKey, CNContactNoteKey, CNContactCreationDateKey]
            )
            
            let deleteRequest = CNSaveRequest()
            let thirtyDaysAgo = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
            
            for contact in contacts {
                // Check if contact is older than 30 days
                if let creationDate = contact.creationDate, creationDate < thirtyDaysAgo {
                    deleteRequest.delete(contact.mutableCopy() as! CNMutableContact)
                }
            }
            
            if deleteRequest.transactionAuthors.count > 0 {
                try contactStore.execute(deleteRequest)
                NSLog("ContactService: Cleaned up \(deleteRequest.transactionAuthors.count) expired contacts")
            }
            
        } catch {
            NSLog("ContactService: Failed to cleanup expired contacts: \(error)")
        }
    }
    
    /// Show permission denied alert with Settings navigation
    func showPermissionDeniedAlert(from viewController: UIViewController) {
        let alert = UIAlertController(
            title: "Contacts Permission Required",
            message: "verifd needs contacts access to create 30-day verification passes. You can enable this in Settings > Privacy & Security > Contacts.",
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(title: "Settings", style: .default) { _ in
            if let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(settingsURL)
            }
        })
        
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        
        viewController.present(alert, animated: true)
    }
}

// MARK: - Supporting Types

enum ContactCreationResult {
    case success
    case permissionDenied
    case failedOfferGroup
    case failed
}

enum ContactServiceError: Error {
    case groupCreationFailed
    case permissionDenied
    case contactCreationFailed
}

// MARK: - UIViewController Extension for Convenience

extension UIViewController {
    /// Show contacts permission alert with Settings navigation
    func showContactsPermissionAlert() {
        ContactService.shared.showPermissionDeniedAlert(from: self)
    }
}