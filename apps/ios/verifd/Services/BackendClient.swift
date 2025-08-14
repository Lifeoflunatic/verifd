import Foundation
import CryptoKit
import Security

/**
 * Backend API client with HMAC authentication for verifd iOS.
 * Handles device registration, pass checking, and pass granting.
 */
class BackendClient {
    
    // MARK: - Singleton
    static let shared = BackendClient()
    
    // MARK: - Constants
    private let keychainService = "com.verifd.ios"
    private let deviceIdKey = "device_id"
    private let deviceKeyKey = "device_key"
    private let customUrlKey = "custom_backend_url"
    
    // MARK: - Retry Policy
    private let retryPolicy = RetryPolicy(
        maxAttempts: 5,
        baseDelayMs: 500,
        maxDelayMs: 8000,
        jitterFactor: 0.2
    )
    
    // MARK: - Base URL Configuration
    private var baseURL: String {
        // Check for runtime override first
        if let customUrl = UserDefaults.standard.string(forKey: customUrlKey),
           !customUrl.isEmpty {
            return customUrl
        }
        
        // Fall back to build configuration
        if let bundleUrl = Bundle.main.object(forInfoDictionaryKey: "BackendURL") as? String,
           !bundleUrl.isEmpty {
            return bundleUrl
        }
        
        // Default fallback for development
        return "http://localhost:3000"
    }
    
    // MARK: - Properties
    private var deviceId: String? {
        get { loadFromKeychain(key: deviceIdKey) }
        set { saveToKeychain(key: deviceIdKey, value: newValue) }
    }
    
    private var deviceKey: String? {
        get { loadFromKeychain(key: deviceKeyKey) }
        set { saveToKeychain(key: deviceKeyKey, value: newValue) }
    }
    
    private init() {}
    
    // MARK: - Configuration
    
    func setCustomBackendURL(_ url: String?) {
        if let url = url, !url.isEmpty {
            UserDefaults.standard.set(url, forKey: customUrlKey)
        } else {
            UserDefaults.standard.removeObject(forKey: customUrlKey)
        }
        // Note: Requires app restart to take effect
    }
    
    func getCurrentBackendURL() -> String {
        return baseURL
    }
    
    func getBuildVariant() -> String {
        return Bundle.main.object(forInfoDictionaryKey: "BuildVariant") as? String ?? "unknown"
    }
    
    // MARK: - Device Registration
    
    func ensureRegistered() async throws -> Bool {
        if deviceId != nil && deviceKey != nil {
            return true
        }
        
        let url = URL(string: "\(baseURL)/device/register")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10.0
        
        let body: [String: Any] = [
            "platform": "ios",
            "model": UIDevice.current.model,
            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        ]
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            print("Failed to register device: \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return false
        }
        
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        
        if let success = json?["success"] as? Bool, success,
           let deviceId = json?["device_id"] as? String,
           let deviceKey = json?["device_key"] as? String {
            self.deviceId = deviceId
            self.deviceKey = deviceKey
            print("Device registered: \(deviceId)")
            return true
        }
        
        return false
    }
    
    // MARK: - Pass Checking
    
    enum PassCheckResult {
        case allowed(scope: String, expiresAt: String, grantedToName: String)
        case notAllowed
        case rateLimited
        case error(String)
    }
    
    func checkPass(phoneNumber: String) async -> PassCheckResult {
        guard try? await ensureRegistered() else {
            return .error("Device not registered")
        }
        
        do {
            return try await retryPolicy.execute { attempt in
                print("Checking pass, attempt \(attempt)")
                
                let encodedNumber = phoneNumber.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? phoneNumber
                let url = URL(string: "\(baseURL)/pass/check?number_e164=\(encodedNumber)")!
                var request = URLRequest(url: url)
                request.httpMethod = "GET"
                request.timeoutInterval = 5.0
                
                // Add HMAC authentication
                addHmacHeaders(to: &request, method: "GET", path: "/pass/check", body: "")
                
                let (data, response) = try await URLSession.shared.data(for: request)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw NetworkError.invalidResponse
                }
                
                switch httpResponse.statusCode {
                case 200:
                    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                    
                    if let allowed = json?["allowed"] as? Bool, allowed {
                        let scope = json?["scope"] as? String ?? "24h"
                        let expiresAt = json?["expires_at"] as? String ?? ""
                        let grantedTo = json?["granted_to_name"] as? String ?? "Unknown"
                        
                        return PassCheckResult.allowed(scope: scope, expiresAt: expiresAt, grantedToName: grantedTo)
                    } else {
                        return PassCheckResult.notAllowed
                    }
                case 429:
                    // Rate limited - will be retried by RetryPolicy
                    throw NetworkError.fromHTTPResponse(httpResponse)
                case 500...599:
                    // Server error - will be retried
                    throw NetworkError.fromHTTPResponse(httpResponse)
                default:
                    // Client error or not found
                    return PassCheckResult.notAllowed
                }
            }
        } catch {
            if case NetworkError.httpError(429, _) = error {
                print("Rate limited after retries")
                return .rateLimited
            } else {
                print("Pass check failed after retries: \(error)")
                return .error(error.localizedDescription)
            }
        }
    }
    
    // MARK: - Pass Granting
    
    enum GrantPassResult {
        case success(passId: String, expiresAt: String)
        case rateLimited
        case error(String)
    }
    
    func grantPass(phoneNumber: String, scope: String, name: String? = nil, reason: String? = nil) async -> GrantPassResult {
        guard try? await ensureRegistered() else {
            return .error("Device not registered")
        }
        
        do {
            return try await retryPolicy.execute { attempt in
                print("Granting pass, attempt \(attempt)")
                
                let url = URL(string: "\(baseURL)/passes/grant")!
                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.timeoutInterval = 10.0
                
                var body: [String: Any] = [
                    "number_e164": phoneNumber,
                    "scope": scope,
                    "channel": "device"
                ]
                
                if let name = name {
                    body["granted_to_name"] = name
                }
                
                if let reason = reason {
                    body["reason"] = reason
                }
                
                let bodyData = try JSONSerialization.data(withJSONObject: body)
                let bodyString = String(data: bodyData, encoding: .utf8) ?? "{}"
                
                // Add HMAC authentication
                addHmacHeaders(to: &request, method: "POST", path: "/passes/grant", body: bodyString)
                
                request.httpBody = bodyData
                
                let (data, response) = try await URLSession.shared.data(for: request)
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw NetworkError.invalidResponse
                }
                
                switch httpResponse.statusCode {
                case 200:
                    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                    
                    if let success = json?["success"] as? Bool, success,
                       let passId = json?["pass_id"] as? String,
                       let expiresAt = json?["expires_at"] as? String {
                        return GrantPassResult.success(passId: passId, expiresAt: expiresAt)
                    } else {
                        return GrantPassResult.error("Server returned success=false")
                    }
                case 429:
                    // Rate limited - will be retried by RetryPolicy
                    throw NetworkError.fromHTTPResponse(httpResponse)
                case 500...599:
                    // Server error - will be retried
                    throw NetworkError.fromHTTPResponse(httpResponse)
                default:
                    // Client error - don't retry
                    return GrantPassResult.error("Failed to grant pass: \(httpResponse.statusCode)")
                }
            }
        } catch {
            if case NetworkError.httpError(429, _) = error {
                print("Rate limited after retries")
                return .rateLimited
            } else {
                print("Grant pass failed after retries: \(error)")
                return .error(error.localizedDescription)
            }
        }
    }
    
    // MARK: - Pass Sync
    
    struct Pass {
        let id: String
        let numberE164: String
        let grantedBy: String
        let grantedToName: String
        let reason: String?
        let expiresAt: String
        let createdAt: String
    }
    
    func syncPassesSince(timestamp: TimeInterval) async -> Result<[Pass], Error> {
        guard try? await ensureRegistered() else {
            return .failure(NSError(domain: "BackendClient", code: -1, userInfo: [NSLocalizedDescriptionKey: "Device not registered"]))
        }
        
        do {
            let url = URL(string: "\(baseURL)/passes/since?ts=\(Int(timestamp))")!
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.timeoutInterval = 10.0
            
            // Add HMAC authentication
            addHmacHeaders(to: &request, method: "GET", path: "/passes/since", body: "")
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                return .failure(NSError(domain: "BackendClient", code: -1, userInfo: [NSLocalizedDescriptionKey: "HTTP error: \((response as? HTTPURLResponse)?.statusCode ?? -1)"]))
            }
            
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            
            if let success = json?["success"] as? Bool, success,
               let passesData = json?["passes"] as? [[String: Any]] {
                
                let passes = passesData.compactMap { passDict -> Pass? in
                    guard let id = passDict["id"] as? String,
                          let numberE164 = passDict["number_e164"] as? String,
                          let grantedBy = passDict["granted_by"] as? String,
                          let grantedToName = passDict["granted_to_name"] as? String,
                          let expiresAt = passDict["expires_at"] as? String,
                          let createdAt = passDict["created_at"] as? String else {
                        return nil
                    }
                    
                    return Pass(
                        id: id,
                        numberE164: numberE164,
                        grantedBy: grantedBy,
                        grantedToName: grantedToName,
                        reason: passDict["reason"] as? String,
                        expiresAt: expiresAt,
                        createdAt: createdAt
                    )
                }
                
                return .success(passes)
            }
            
            return .failure(NSError(domain: "BackendClient", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response format"]))
            
        } catch {
            return .failure(error)
        }
    }
    
    // MARK: - HMAC Authentication
    
    private func addHmacHeaders(to request: inout URLRequest, method: String, path: String, body: String) {
        guard let deviceId = deviceId, let deviceKey = deviceKey else { return }
        
        let timestamp = String(Int(Date().timeIntervalSince1970))
        let payload = "\(method):\(path):\(timestamp):\(body)"
        
        let signature = calculateHmac(data: payload, key: deviceKey)
        
        request.setValue(deviceId, forHTTPHeaderField: "X-Device-ID")
        request.setValue(signature, forHTTPHeaderField: "X-Device-Sign")
        request.setValue(timestamp, forHTTPHeaderField: "X-Timestamp")
    }
    
    private func calculateHmac(data: String, key: String) -> String {
        let keyData = Data(key.utf8)
        let dataToSign = Data(data.utf8)
        
        let signature = HMAC<SHA256>.authenticationCode(for: dataToSign, using: SymmetricKey(data: keyData))
        return Data(signature).map { String(format: "%02x", $0) }.joined()
    }
    
    // MARK: - Keychain Storage
    
    private func saveToKeychain(key: String, value: String?) {
        guard let value = value else {
            // Delete if nil
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: keychainService,
                kSecAttrAccount as String: key
            ]
            SecItemDelete(query as CFDictionary)
            return
        }
        
        let data = value.data(using: .utf8)!
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        
        // Try to update first
        let updateQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key
        ]
        
        let status = SecItemUpdate(updateQuery as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        
        if status == errSecItemNotFound {
            // Add new item
            SecItemAdd(query as CFDictionary, nil)
        }
    }
    
    private func loadFromKeychain(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecSuccess,
           let data = result as? Data,
           let value = String(data: data, encoding: .utf8) {
            return value
        }
        
        return nil
    }
}