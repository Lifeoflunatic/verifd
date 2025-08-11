import Foundation

/**
 * Retry policy with exponential backoff and jitter for network requests
 */
class RetryPolicy {
    private let maxAttempts: Int
    private let baseDelayMs: Int
    private let maxDelayMs: Int
    private let jitterFactor: Double
    
    init(maxAttempts: Int = 5, baseDelayMs: Int = 500, maxDelayMs: Int = 8000, jitterFactor: Double = 0.2) {
        self.maxAttempts = maxAttempts
        self.baseDelayMs = baseDelayMs
        self.maxDelayMs = maxDelayMs
        self.jitterFactor = jitterFactor
    }
    
    /**
     * Execute a network operation with retry logic
     */
    func execute<T>(_ operation: @escaping (Int) async throws -> T) async throws -> T {
        var lastError: Error?
        
        for attempt in 1...maxAttempts {
            do {
                return try await operation(attempt)
            } catch let error {
                lastError = error
                
                // Check if retryable
                if !isRetryable(error) || attempt == maxAttempts {
                    throw error
                }
                
                // Calculate delay with exponential backoff and jitter
                let delay = calculateDelay(attempt: attempt, error: error)
                try await Task.sleep(nanoseconds: UInt64(delay) * 1_000_000) // Convert ms to ns
            }
        }
        
        throw lastError ?? NetworkError.unknown
    }
    
    /**
     * Determine if an error is retryable
     */
    private func isRetryable(_ error: Error) -> Bool {
        if let networkError = error as? NetworkError {
            switch networkError {
            case .httpError(let statusCode, _):
                switch statusCode {
                case 429:  // Rate limited - retry with backoff
                    return true
                case 500...599:  // Server errors
                    return true
                case 400...499:  // Client errors (except 429)
                    return false
                default:
                    return false
                }
            case .timeout, .noConnection, .unknown:
                return true
            case .invalidResponse:
                return false
            }
        } else if error is URLError {
            let urlError = error as! URLError
            switch urlError.code {
            case .timedOut, .cannotFindHost, .cannotConnectToHost, .networkConnectionLost, .dnsLookupFailed:
                return true
            default:
                return false
            }
        }
        return false
    }
    
    /**
     * Calculate delay with exponential backoff and jitter
     */
    private func calculateDelay(attempt: Int, error: Error) -> Int {
        // Check for Retry-After header in case of rate limiting
        if let networkError = error as? NetworkError,
           case .httpError(_, let retryAfterSeconds) = networkError,
           let retryAfter = retryAfterSeconds {
            return retryAfter * 1000  // Convert seconds to milliseconds
        }
        
        // Exponential backoff: baseDelay * 2^(attempt-1)
        let exponentialDelay = baseDelayMs * (1 << (attempt - 1))
        
        // Cap at max delay
        let cappedDelay = min(exponentialDelay, maxDelayMs)
        
        // Add jitter to prevent thundering herd
        let jitter = Int(Double(cappedDelay) * jitterFactor * Double.random(in: 0...1))
        
        return cappedDelay + jitter
    }
}

/**
 * Custom error for network operations
 */
enum NetworkError: Error {
    case httpError(statusCode: Int, retryAfterSeconds: Int?)
    case timeout
    case noConnection
    case invalidResponse
    case unknown
    
    static func fromHTTPResponse(_ response: HTTPURLResponse) -> NetworkError {
        let retryAfter = response.value(forHTTPHeaderField: "Retry-After")
            .flatMap { Int($0) }
        
        return .httpError(statusCode: response.statusCode, retryAfterSeconds: retryAfter)
    }
}