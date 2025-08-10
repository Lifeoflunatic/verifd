import UIKit
import Contacts
import CallKit
import MessageUI

class ViewController: UIViewController, MFMessageComposeViewControllerDelegate {
    
    @IBOutlet weak var statusLabel: UILabel!
    @IBOutlet weak var approveButton: UIButton!
    @IBOutlet weak var shortcutButton: UIButton!
    @IBOutlet weak var identityPingButton: UIButton!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        checkPermissions()
    }
    
    private func setupUI() {
        title = "verifd"
        statusLabel.text = "Ready to verify calls"
        
        approveButton.setTitle("Approve Pending Call", for: .normal)
        approveButton.addTarget(self, action: #selector(approveCall), for: .touchUpInside)
        
        shortcutButton.setTitle("Expecting Call (15-30m)", for: .normal)
        shortcutButton.addTarget(self, action: #selector(enableShortcut), for: .touchUpInside)
        
        identityPingButton.setTitle("Send Identity Ping", for: .normal)
        identityPingButton.addTarget(self, action: #selector(sendIdentityPing), for: .touchUpInside)
    }
    
    private func checkPermissions() {
        // STORE COMPLIANCE: Use ContactService for permission status checking
        let authStatus = ContactService.shared.contactsPermissionStatus()
        
        switch authStatus {
        case .authorized:
            statusLabel.text = "Contacts permission granted"
        case .denied, .restricted:
            statusLabel.text = "Contacts permission denied"
            // Don't auto-show alert on startup - user should initiate
        case .notDetermined:
            statusLabel.text = "Ready to request contacts permission when needed"
        @unknown default:
            statusLabel.text = "Unknown contacts permission status"
        }
    }
    
    @objc private func approveCall() {
        // This would be triggered by notification/deep link from web verification
        showApprovalDialog()
    }
    
    @objc private func enableShortcut() {
        // Enable 15-30 minute temporary verification window
        VerifdPassManager.shared.enableShortcutMode(duration: 1800) // 30 minutes
        statusLabel.text = "Shortcut mode active for 30 minutes"
        
        // Update UI
        shortcutButton.setTitle("Shortcut Active", for: .normal)
        shortcutButton.isEnabled = false
        
        // Re-enable after timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 1800) {
            self.shortcutButton.setTitle("Expecting Call (15-30m)", for: .normal)
            self.shortcutButton.isEnabled = true
            self.statusLabel.text = "Shortcut mode expired"
        }
    }
    
    @objc private func sendIdentityPing() {
        // Demo button to send Identity Ping via MFMessageComposeViewController
        guard MFMessageComposeViewController.canSendText() else {
            statusLabel.text = "SMS not available on this device"
            return
        }
        
        // Start verification process with backend
        startVerificationProcess()
    }
    
    private func startVerificationProcess() {
        // Create verification request
        let verificationRequest = VerificationRequest(
            phoneNumber: "+1234567890", // Demo number - would be input by user
            name: "Demo User",
            reason: "Identity verification for incoming call"
        )
        
        IdentityPingService.shared.startVerification(verificationRequest) { [weak self] result in
            DispatchQueue.main.async {
                guard let self = self else { return }
                
                switch result {
                case .success(let response):
                    self.presentMessageComposer(with: response)
                case .failure(let error):
                    self.statusLabel.text = "Verification start failed: \(error.localizedDescription)"
                }
            }
        }
    }
    
    private func presentMessageComposer(with verificationResponse: VerificationStartResponse) {
        let messageComposer = MFMessageComposeViewController()
        messageComposer.messageComposeDelegate = self
        
        // Prefill recipient (demo - would be actual caller's number)
        messageComposer.recipients = ["+1234567890"]
        
        // Prefill message body with verify link
        let messageBody = """
        Hi! I'm using verifd to verify callers. Please verify your identity:
        
        \(verificationResponse.verifyUrl)
        
        This link expires in 15 minutes.
        """
        
        messageComposer.body = messageBody
        
        present(messageComposer, animated: true) {
            self.statusLabel.text = "Message composer presented"
        }
    }
    
    private func showApprovalDialog() {
        let alert = UIAlertController(title: "Approve Caller", message: "Create 30-day pass for this verified caller?", preferredStyle: .alert)
        
        alert.addAction(UIAlertAction(title: "Approve", style: .default) { _ in
            // Explicit user-initiated contact creation
            self.createTempContactWithPermissionCheck()
        })
        
        alert.addAction(UIAlertAction(title: "Deny", style: .cancel))
        
        present(alert, animated: true)
    }
    
    private func createTempContactWithPermissionCheck() {
        // STORE COMPLIANCE: Use dedicated ContactService for permission management
        ContactService.shared.createTempContact(
            phoneNumber: "+1234567890", // Would come from verification
            name: "Verified Caller" // Would come from verification
        ) { [weak self] result in
            DispatchQueue.main.async {
                guard let self = self else { return }
                
                switch result {
                case .success:
                    self.statusLabel.text = "30-day pass created successfully"
                    self.showSuccessToast()
                case .permissionDenied:
                    self.showContactsPermissionDeniedAlert()
                    self.statusLabel.text = "Contact creation requires permission"
                case .failedOfferGroup:
                    self.statusLabel.text = "Contact creation failed, group offered"
                    // VerifdPassManager will handle group creation dialog
                case .failed:
                    self.statusLabel.text = "Failed to create 30-day pass"
                    self.showErrorToast()
                }
            }
        }
    }
    
    // This method is now redundant as createTempContactWithPermissionCheck handles everything
    // Kept for backward compatibility but delegates to the proper service
    private func createTempContact() {
        // Delegate to the store-safe contact service
        createTempContactWithPermissionCheck()
    }
    
    // MARK: - Alerts & Toasts
    
    private func showContactsPermissionDeniedAlert() {
        let alert = UIAlertController(
            title: "Contacts Permission Required",
            message: "verifd needs contacts access to create temporary 30-day passes. You can enable this in Settings > Privacy & Security > Contacts.",
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(title: "Settings", style: .default) { _ in
            if let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(settingsURL)
            }
        })
        
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        
        present(alert, animated: true)
    }
    
    private func showSuccessToast() {
        // Simple toast notification
        let alert = UIAlertController(title: "Success", message: "30-day verification pass created", preferredStyle: .alert)
        present(alert, animated: true)
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            alert.dismiss(animated: true)
        }
    }
    
    private func showErrorToast() {
        let alert = UIAlertController(title: "Error", message: "Unable to create verification pass", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
    
    // MARK: - MFMessageComposeViewControllerDelegate
    
    func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {
        controller.dismiss(animated: true) { [weak self] in
            guard let self = self else { return }
            
            switch result {
            case .sent:
                self.statusLabel.text = "Identity ping sent successfully"
                // Start polling for verification response
                self.pollForVerificationStatus()
            case .cancelled:
                self.statusLabel.text = "Message cancelled"
            case .failed:
                self.statusLabel.text = "Failed to send identity ping"
            @unknown default:
                self.statusLabel.text = "Unknown message result"
            }
        }
    }
    
    private func pollForVerificationStatus() {
        // In real implementation, would poll /verify/status/:token
        // For demo, simulate with timer
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            self.statusLabel.text = "Checking verification status..."
            
            // Simulate successful verification after 5 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                self.showApprovalPreview()
            }
        }
    }
    
    private func showApprovalPreview() {
        let alert = UIAlertController(
            title: "Verification Complete", 
            message: "Demo User verified their identity. Grant access?", 
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(title: "Approve +24h (temp)", style: .default) { _ in
            // Short-term pass: label only, no contact creation
            self.createTempPass(duration: .twentyFourHours)
        })
        
        alert.addAction(UIAlertAction(title: "Approve +30d (contact)", style: .default) { _ in
            // 30-day pass: create temp contact in "verifd Passes"
            self.createTempPass(duration: .thirtyDays)
        })
        
        alert.addAction(UIAlertAction(title: "Deny", style: .cancel) { _ in
            self.statusLabel.text = "Verification denied"
        })
        
        present(alert, animated: true)
    }
    
    private func showVerificationSuccessDialog(name: String, duration: PassType) {
        let alert: UIAlertController
        
        if duration == .twentyFourHours {
            alert = UIAlertController(
                title: "Verified",
                message: "24-hour pass created (label-only). If Silence Unknown Callers is ON, add a 30-day temp contact to ring.",
                preferredStyle: .alert
            )
            
            alert.addAction(UIAlertAction(title: "Add 30-day temp contact", style: .default) { _ in
                // User-initiated 30-day contact creation
                self.createTempContactFor30Days(name: name)
            })
            
            alert.addAction(UIAlertAction(title: "OK", style: .default))
        } else {
            alert = UIAlertController(
                title: "Verified",
                message: "30-day temp contact created. This caller will ring through even with Silence Unknown Callers ON.",
                preferredStyle: .alert
            )
            
            alert.addAction(UIAlertAction(title: "OK", style: .default))
        }
        
        present(alert, animated: true)
    }
    
    private func createTempContactFor30Days(name: String) {
        // Create 30-day temp contact when user explicitly requests it
        VerifdPassManager.shared.createTempContact(
            phoneNumber: "+1234567890", // Would come from verification
            name: name,
            passType: .thirtyDays
        ) { [weak self] success in
            DispatchQueue.main.async {
                guard let self = self else { return }
                
                if success {
                    self.statusLabel.text = "30-day temp contact created"
                    self.showSuccessToast()
                } else {
                    self.statusLabel.text = "Failed to create 30-day contact"
                    self.showErrorToast()
                }
            }
        }
    }
    
    private func createTempPass(duration: PassType) {
        VerifdPassManager.shared.createTempContact(
            phoneNumber: "+1234567890",
            name: "Demo User",
            passType: duration
        ) { [weak self] success in
            DispatchQueue.main.async {
                guard let self = self else { return }
                
                if success {
                    let durationText = duration == .thirtyDays ? "30-day contact" : "24-hour label"
                    self.statusLabel.text = "Created \(durationText) pass"
                    // Show the new success dialog with proper UX messaging
                    self.showVerificationSuccessDialog(name: "Demo User", duration: duration)
                } else {
                    self.statusLabel.text = "Failed to create pass"
                    self.showErrorToast()
                }
            }
        }
    }
}