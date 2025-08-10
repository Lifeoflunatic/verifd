import UIKit
import CallKit

/// View controller for managing expected calls and temporary allowlists
/// Documents Shortcuts integration for 15-30m vPass handling
class ExpectingCallViewController: UIViewController {
    
    @IBOutlet weak var statusLabel: UILabel!
    @IBOutlet weak var shortcutButton: UIButton!
    @IBOutlet weak var liveVoicemailButton: UIButton!
    @IBOutlet weak var instructionsTextView: UITextView!
    
    private var shortcutModeTimer: Timer?
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        setupShortcutDocumentation()
    }
    
    private func setupUI() {
        title = "Expecting Call"
        navigationController?.navigationBar.prefersLargeTitles = true
        
        statusLabel.text = "Ready for temporary verification"
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0
        
        shortcutButton.setTitle("Enable 30-minute Window", for: .normal)
        shortcutButton.addTarget(self, action: #selector(enableShortcutMode), for: .touchUpInside)
        
        liveVoicemailButton.setTitle("Use Live Voicemail (15m)", for: .normal)
        liveVoicemailButton.addTarget(self, action: #selector(showLiveVoicemailInstructions), for: .touchUpInside)
        
        // Style buttons
        [shortcutButton, liveVoicemailButton].forEach { button in
            button?.layer.cornerRadius = 8
            button?.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .medium)
        }
    }
    
    // MARK: - Shortcut Integration Documentation
    
    private func setupShortcutDocumentation() {
        instructionsTextView.text = """
        📱 SHORTCUTS INTEGRATION FOR 15-30m vPass
        
        STORE COMPLIANCE: Shortcuts can handle temporary allowlist without automatic expiry in Call Directory Extension.
        
        🔄 Shortcut Workflow:
        1. User manually runs "verifd Expecting Call" shortcut
        2. Shortcut updates shared container with temporary allowlist
        3. Call Directory reads from container (no network calls)
        4. User must manually disable or let shortcut auto-expire
        
        ⚠️ IMPORTANT LIMITATIONS:
        • Call Directory Extension has NO automatic expiry
        • Requires user action to disable temporary allowlist
        • Shortcuts provide UI automation, not system-level auto-expiry
        
        🛡️ PRIVACY PROTECTION:
        • No persistent contacts created for short-term passes
        • All data stored in shared app group container
        • User maintains full control over allowlist
        
        📋 RECOMMENDED SHORTCUTS:
        • "verifd Expecting Call (30m)" - 30-minute window
        • "verifd Live Voicemail Mode" - 15-minute focused mode
        • "verifd Disable Temporary" - Manual disable
        
        💡 TECHNICAL NOTES:
        • Shortcuts can read/write to shared container
        • Call Directory reloads automatically when container changes
        • Background refresh updates Call Directory labeling
        • Manual shortcut execution required for activation
        """
        
        instructionsTextView.font = UIFont.systemFont(ofSize: 14)
        instructionsTextView.isEditable = false
        instructionsTextView.backgroundColor = UIColor.systemGray6
        instructionsTextView.layer.cornerRadius = 8
    }
    
    // MARK: - User Actions
    
    @objc private func enableShortcutMode() {
        // 30-minute temporary allowlist via Shortcuts integration
        let alert = UIAlertController(
            title: "Enable 30-Minute Window",
            message: "This will create a temporary allowlist for 30 minutes. Use Shortcuts app for automation.",
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(title: "Enable", style: .default) { _ in
            self.activateShortcutMode(duration: 1800) // 30 minutes
        })
        
        alert.addAction(UIAlertAction(title: "Open Shortcuts App", style: .default) { _ in
            self.openShortcutsApp()
        })
        
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        
        present(alert, animated: true)
    }
    
    @objc private func showLiveVoicemailInstructions() {
        let alert = UIAlertController(
            title: "Live Voicemail Mode",
            message: """
            For 15-minute focused windows:
            
            1. Enable Live Voicemail in Phone settings
            2. Use "verifd Live Voicemail" shortcut
            3. Unknown callers go to Live Voicemail
            4. Verified callers ring through normally
            
            This provides better control for short verification windows.
            """,
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(title: "Open Phone Settings", style: .default) { _ in
            if let phoneSettingsURL = URL(string: "App-prefs:Phone") {
                UIApplication.shared.open(phoneSettingsURL)
            }
        })
        
        alert.addAction(UIAlertAction(title: "Activate 15m Mode", style: .default) { _ in
            self.activateShortcutMode(duration: 900) // 15 minutes
        })
        
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        
        present(alert, animated: true)
    }
    
    // MARK: - Shortcut Mode Management
    
    private func activateShortcutMode(duration: TimeInterval) {
        // Store shortcut mode state for Call Directory Extension
        VerifdPassManager.shared.enableShortcutMode(duration: duration)
        
        let minutes = Int(duration / 60)
        statusLabel.text = "Temporary allowlist active for \(minutes) minutes"
        
        // Update UI
        shortcutButton.setTitle("Mode Active (\(minutes)m)", for: .normal)
        shortcutButton.isEnabled = false
        liveVoicemailButton.isEnabled = false
        
        // Schedule UI update when expired
        shortcutModeTimer = Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { _ in
            DispatchQueue.main.async {
                self.deactivateShortcutMode()
            }
        }
        
        // Show success feedback
        showSuccessToast(message: "\(minutes)-minute verification window active")
        
        // Provide shortcut automation hint
        showShortcutAutomationHint()
    }
    
    private func deactivateShortcutMode() {
        statusLabel.text = "Temporary allowlist expired"
        
        shortcutButton.setTitle("Enable 30-minute Window", for: .normal)
        shortcutButton.isEnabled = true
        liveVoicemailButton.isEnabled = true
        
        shortcutModeTimer?.invalidate()
        shortcutModeTimer = nil
        
        // Reload Call Directory to remove temporary entries
        CXCallDirectoryManager.sharedInstance.reloadExtension(
            withIdentifier: "com.verifd.app.CallDirectoryExtension"
        ) { error in
            if let error = error {
                NSLog("Failed to reload Call Directory after shortcut mode: \(error)")
            }
        }
    }
    
    private func showShortcutAutomationHint() {
        let alert = UIAlertController(
            title: "💡 Automation Tip",
            message: """
            For easier automation, add "verifd Expecting Call" to:
            
            • Control Center for quick access
            • Lock Screen widget
            • Back Tap automation
            • Time-based automation
            
            Shortcuts provide flexible control while maintaining store compliance.
            """,
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(title: "Open Shortcuts", style: .default) { _ in
            self.openShortcutsApp()
        })
        
        alert.addAction(UIAlertAction(title: "Later", style: .cancel))
        
        // Show after delay to not overwhelm user
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            self.present(alert, animated: true)
        }
    }
    
    // MARK: - Shortcuts App Integration
    
    private func openShortcutsApp() {
        // Try to open Shortcuts app
        if let shortcutsURL = URL(string: "shortcuts://") {
            UIApplication.shared.open(shortcutsURL) { success in
                if !success {
                    // Fallback to App Store if Shortcuts not installed
                    if let appStoreURL = URL(string: "https://apps.apple.com/app/shortcuts/id915249334") {
                        UIApplication.shared.open(appStoreURL)
                    }
                }
            }
        }
    }
    
    // MARK: - UI Feedback
    
    private func showSuccessToast(message: String) {
        let alert = UIAlertController(title: "✓ Active", message: message, preferredStyle: .alert)
        present(alert, animated: true)
        
        // Auto-dismiss after 2 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            alert.dismiss(animated: true)
        }
    }
    
    // MARK: - Cleanup
    
    deinit {
        shortcutModeTimer?.invalidate()
    }
}