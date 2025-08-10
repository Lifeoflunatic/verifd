import Foundation

/// Service for handling Identity Ping verification with backend
/// Integrates with /verify/start and /verify/submit endpoints
class IdentityPingService {
    static let shared = IdentityPingService()
    private let baseURL = "http://localhost:3001/verify" // Demo URL - would be configurable
    
    private init() {}
    
    func startVerification(_ request: VerificationRequest, completion: @escaping (Result<VerificationStartResponse, Error>) -> Void) {
        guard let url = URL(string: "\(baseURL)/start") else {
            completion(.failure(IdentityPingError.invalidURL))
            return
        }
        
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        do {
            let jsonData = try JSONEncoder().encode(request)
            urlRequest.httpBody = jsonData
        } catch {
            completion(.failure(error))
            return
        }
        
        URLSession.shared.dataTask(with: urlRequest) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = data else {
                completion(.failure(IdentityPingError.noData))
                return
            }
            
            do {
                let response = try JSONDecoder().decode(VerificationStartResponse.self, from: data)
                completion(.success(response))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }
    
    func checkVerificationStatus(token: String, completion: @escaping (Result<VerificationStatusResponse, Error>) -> Void) {
        guard let url = URL(string: "\(baseURL)/status/\(token)") else {
            completion(.failure(IdentityPingError.invalidURL))
            return
        }
        
        URLSession.shared.dataTask(with: url) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = data else {
                completion(.failure(IdentityPingError.noData))
                return
            }
            
            do {
                let response = try JSONDecoder().decode(VerificationStatusResponse.self, from: data)
                completion(.success(response))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }
    
    func submitVerification(token: String, recipientPhone: String, grantPass: Bool, completion: @escaping (Result<VerificationSubmitResponse, Error>) -> Void) {
        guard let url = URL(string: "\(baseURL)/submit") else {
            completion(.failure(IdentityPingError.invalidURL))
            return
        }
        
        let submitRequest = VerificationSubmitRequest(
            token: token,
            recipientPhone: recipientPhone,
            grantPass: grantPass
        )
        
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        do {
            let jsonData = try JSONEncoder().encode(submitRequest)
            urlRequest.httpBody = jsonData
        } catch {
            completion(.failure(error))
            return
        }
        
        URLSession.shared.dataTask(with: urlRequest) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = data else {
                completion(.failure(IdentityPingError.noData))
                return
            }
            
            do {
                let response = try JSONDecoder().decode(VerificationSubmitResponse.self, from: data)
                completion(.success(response))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }
}

// MARK: - Data Models

struct VerificationRequest: Codable {
    let phoneNumber: String
    let name: String
    let reason: String
    let voicePing: String? // Optional base64 encoded audio
}

struct VerificationStartResponse: Codable {
    let success: Bool
    let token: String
    let verifyUrl: String
    let expiresIn: Int // seconds
}

struct VerificationSubmitRequest: Codable {
    let token: String
    let recipientPhone: String
    let grantPass: Bool
}

struct VerificationSubmitResponse: Codable {
    let success: Bool
    let passGranted: Bool
    let passId: String?
    let callerName: String
}

struct VerificationStatusResponse: Codable {
    let status: String // "pending", "completed"
    let expired: Bool
    let completedAt: Int? // timestamp
}

enum IdentityPingError: Error, LocalizedError {
    case invalidURL
    case noData
    case invalidResponse
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid verification URL"
        case .noData:
            return "No data received from server"
        case .invalidResponse:
            return "Invalid server response"
        }
    }
}