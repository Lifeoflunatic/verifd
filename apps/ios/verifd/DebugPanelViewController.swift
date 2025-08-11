//
//  DebugPanelViewController.swift
//  verifd
//
//  QA Debug Panel for configuration inspection
//

import UIKit

class DebugPanelViewController: UIViewController {
    
    // UI Elements
    @IBOutlet weak var environmentLabel: UILabel!
    @IBOutlet weak var kidLabel: UILabel!
    @IBOutlet weak var signatureLabel: UILabel!
    @IBOutlet weak var overrideLabel: UILabel!
    @IBOutlet weak var configTextView: UITextView!
    @IBOutlet weak var refreshButton: UIButton!
    
    // Configuration data
    private var configData: [String: Any]?
    private let apiBaseURL = ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "https://staging.api.verifd.com"
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        title = "QA Debug Panel"
        
        // Set environment info
        displayEnvironmentInfo()
        
        // Fetch configuration
        fetchConfiguration()
        
        // Add refresh action
        refreshButton.addTarget(self, action: #selector(refreshConfiguration), for: .touchUpInside)
    }
    
    private func displayEnvironmentInfo() {
        let environment = ProcessInfo.processInfo.environment["ENVIRONMENT"] ?? "staging"
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "Unknown"
        
        environmentLabel.text = """
        Environment: \(environment)
        API: \(apiBaseURL)
        Version: \(version) (\(build))
        """
    }
    
    @objc private func refreshConfiguration() {
        fetchConfiguration()
    }
    
    private func fetchConfiguration() {
        // Get user's phone number from UserDefaults
        let phoneNumber = UserDefaults.standard.string(forKey: "userPhoneNumber")
        
        // Build URL
        var urlString = "\(apiBaseURL)/config/features"
        if let phone = phoneNumber {
            urlString += "?phone=\(phone.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        }
        
        guard let url = URL(string: urlString) else {
            showError("Invalid URL")
            return
        }
        
        // Create request
        var request = URLRequest(url: url)
        request.setValue("iOS", forHTTPHeaderField: "x-device-type")
        request.setValue(Locale.current.regionCode ?? "US", forHTTPHeaderField: "x-geo-location")
        
        // Fetch configuration
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    self?.showError("Network error: \(error.localizedDescription)")
                    return
                }
                
                guard let data = data else {
                    self?.showError("No data received")
                    return
                }
                
                do {
                    if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        self?.configData = json
                        self?.displayConfiguration(json)
                    }
                } catch {
                    self?.showError("JSON parsing error: \(error.localizedDescription)")
                }
            }
        }.resume()
    }
    
    private func displayConfiguration(_ config: [String: Any]) {
        // Extract and display KID
        if let kid = config["kid"] as? String {
            kidLabel.text = "KID: \(kid)"
            kidLabel.textColor = (kid == "staging-2025-001") ? .systemGreen : .systemRed
        } else {
            kidLabel.text = "KID: none"
            kidLabel.textColor = .systemRed
        }
        
        // Display signature status
        if let signature = config["signature"] as? String {
            let truncated = String(signature.prefix(20))
            signatureLabel.text = "✓ Signature: \(truncated)..."
            signatureLabel.textColor = .systemGreen
        } else {
            signatureLabel.text = "✗ No signature"
            signatureLabel.textColor = .systemRed
        }
        
        // Display override status
        if let overrideActive = config["overrideActive"] as? Bool, overrideActive {
            overrideLabel.text = "✓ Override Active (Full Features)"
            overrideLabel.textColor = .systemBlue
        } else {
            overrideLabel.text = "Standard User (Cohort-based)"
            overrideLabel.textColor = .label
        }
        
        // Format and display full configuration
        var configText = "=== Feature Flags ===\n"
        
        // MISSED_CALL_ACTIONS
        if let missedCall = config["MISSED_CALL_ACTIONS"] as? [String: Any],
           let cohort = missedCall["cohort"] as? [String: Any],
           let percentage = cohort["percentage"] as? Int {
            configText += "MISSED_CALL_ACTIONS: \(percentage)%\n"
        }
        
        // APP_SHORTCUTS_ENABLED
        if let shortcuts = config["APP_SHORTCUTS_ENABLED"] as? [String: Any],
           let cohort = shortcuts["cohort"] as? [String: Any],
           let percentage = cohort["percentage"] as? Int {
            configText += "APP_SHORTCUTS: \(percentage)%\n"
        }
        
        // IDENTITY_LOOKUP_ENABLED
        if let identity = config["IDENTITY_LOOKUP_ENABLED"] as? [String: Any],
           let cohort = identity["cohort"] as? [String: Any],
           let percentage = cohort["percentage"] as? Int {
            configText += "IDENTITY_LOOKUP: \(percentage)%\n"
        }
        
        // Templates
        if let templates = config["enableTemplates"] as? [String: Any],
           let enabled = templates["enabled"] as? Bool {
            configText += "Templates: \(enabled)\n"
        }
        
        // Risk Scoring
        if let riskScoring = config["enableRiskScoring"] as? [String: Any],
           let enabled = riskScoring["enabled"] as? Bool {
            var riskText = "Risk Scoring: \(enabled)"
            if let metadata = riskScoring["metadata"] as? [String: Any],
               let shadowMode = metadata["shadowMode"] as? Bool {
                riskText += " (shadow: \(shadowMode))"
            }
            configText += "\(riskText)\n"
        }
        
        // Metadata
        configText += "\n=== Metadata ===\n"
        if let version = config["configVersion"] as? String {
            configText += "Config Version: \(version)\n"
        }
        if let lastUpdated = config["lastUpdated"] as? String {
            configText += "Last Updated: \(lastUpdated)\n"
        }
        if let interval = config["updateIntervalMs"] as? Int {
            configText += "Update Interval: \(interval)ms\n"
        }
        
        // Override info
        if let overrideActive = config["overrideActive"] as? Bool, overrideActive {
            configText += "\n=== Override Info ===\n"
            if let geo = config["geo"] as? String {
                configText += "Geo: \(geo)\n"
            }
            configText += "All features enabled at 100%\n"
        }
        
        configTextView.text = configText
    }
    
    private func showError(_ message: String) {
        configTextView.text = "Error: \(message)"
        kidLabel.text = "KID: error"
        kidLabel.textColor = .systemRed
        signatureLabel.text = "✗ Error fetching config"
        signatureLabel.textColor = .systemRed
    }
}

// MARK: - Debug Menu Extension
extension UIViewController {
    
    /// Add debug panel access to any view controller
    func showDebugPanelIfStaging() {
        #if DEBUG || STAGING
        // Create long press gesture
        let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleDebugGesture))
        longPress.minimumPressDuration = 3.0 // 3 second press
        longPress.numberOfTouchesRequired = 2 // Two finger press
        self.view.addGestureRecognizer(longPress)
        #endif
    }
    
    @objc private func handleDebugGesture(_ gesture: UILongPressGestureRecognizer) {
        if gesture.state == .began {
            // Present debug panel
            let storyboard = UIStoryboard(name: "Debug", bundle: nil)
            if let debugVC = storyboard.instantiateViewController(withIdentifier: "DebugPanelViewController") as? DebugPanelViewController {
                let nav = UINavigationController(rootViewController: debugVC)
                present(nav, animated: true)
            }
        }
    }
}