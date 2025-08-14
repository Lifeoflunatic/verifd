import XCTest
@testable import verifd

class RetryPolicyTests: XCTestCase {
    
    func testSuccessfulOperationOnFirstAttempt() async throws {
        let policy = RetryPolicy(maxAttempts: 3)
        var attempts = 0
        
        let result = try await policy.execute { attempt in
            attempts = attempt
            return "success"
        }
        
        XCTAssertEqual(result, "success")
        XCTAssertEqual(attempts, 1)
    }
    
    func testRetryOnServerError() async throws {
        let policy = RetryPolicy(maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100)
        var attempts = 0
        
        let result = try await policy.execute { attempt in
            attempts = attempt
            if attempt < 3 {
                throw NetworkError.httpError(statusCode: 500, retryAfterSeconds: nil)
            }
            return "success after retries"
        }
        
        XCTAssertEqual(result, "success after retries")
        XCTAssertEqual(attempts, 3)
    }
    
    func testRetryOnRateLimitWithRetryAfterHeader() async throws {
        let policy = RetryPolicy(maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100)
        var attempts = 0
        let startTime = Date()
        
        let result = try await policy.execute { attempt in
            attempts = attempt
            if attempt == 1 {
                // First attempt fails with rate limit and Retry-After header (1 second)
                throw NetworkError.httpError(statusCode: 429, retryAfterSeconds: 1)
            }
            return "success after rate limit"
        }
        
        let elapsedTime = Date().timeIntervalSince(startTime)
        
        XCTAssertEqual(result, "success after rate limit")
        XCTAssertEqual(attempts, 2)
        // Should have waited approximately 1 second due to Retry-After header
        XCTAssertGreaterThanOrEqual(elapsedTime, 0.9)
        XCTAssertLessThanOrEqual(elapsedTime, 1.5)
    }
    
    func testNoRetryOnClientError() async {
        let policy = RetryPolicy(maxAttempts: 3)
        var thrownError: Error?
        
        do {
            _ = try await policy.execute { attempt in
                throw NetworkError.httpError(statusCode: 400, retryAfterSeconds: nil)
            }
            XCTFail("Should have thrown error")
        } catch {
            thrownError = error
        }
        
        XCTAssertNotNil(thrownError)
        if case NetworkError.httpError(let statusCode, _) = thrownError {
            XCTAssertEqual(statusCode, 400)
        } else {
            XCTFail("Wrong error type")
        }
    }
    
    func testRetryOnTimeout() async throws {
        let policy = RetryPolicy(maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100)
        var attempts = 0
        
        let result = try await policy.execute { attempt in
            attempts = attempt
            if attempt == 1 {
                throw NetworkError.timeout
            }
            return "success after timeout"
        }
        
        XCTAssertEqual(result, "success after timeout")
        XCTAssertEqual(attempts, 2)
    }
    
    func testRetryOnNoConnection() async throws {
        let policy = RetryPolicy(maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100)
        var attempts = 0
        
        let result = try await policy.execute { attempt in
            attempts = attempt
            if attempt < 2 {
                throw NetworkError.noConnection
            }
            return "success after connection restored"
        }
        
        XCTAssertEqual(result, "success after connection restored")
        XCTAssertEqual(attempts, 2)
    }
    
    func testMaxAttemptsReached() async {
        let policy = RetryPolicy(maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100)
        var attempts = 0
        var thrownError: Error?
        
        do {
            _ = try await policy.execute { attempt in
                attempts = attempt
                throw NetworkError.httpError(statusCode: 500, retryAfterSeconds: nil)
            }
            XCTFail("Should have thrown error")
        } catch {
            thrownError = error
        }
        
        XCTAssertNotNil(thrownError)
        XCTAssertEqual(attempts, 3)
    }
    
    func testExponentialBackoffCalculation() async {
        let policy = RetryPolicy(maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 2000, jitterFactor: 0.0)
        var attemptTimes: [Date] = []
        
        do {
            _ = try await policy.execute { attempt in
                attemptTimes.append(Date())
                throw NetworkError.httpError(statusCode: 500, retryAfterSeconds: nil)
            }
        } catch {
            // Expected
        }
        
        // Calculate actual delays between attempts
        var delays: [TimeInterval] = []
        for i in 1..<attemptTimes.count {
            delays.append(attemptTimes[i].timeIntervalSince(attemptTimes[i-1]))
        }
        
        // With jitterFactor = 0, delays should be: 100ms, 200ms, 400ms, 800ms
        // Allow some tolerance due to execution time
        XCTAssertGreaterThanOrEqual(delays[0], 0.09)
        XCTAssertLessThanOrEqual(delays[0], 0.15)  // ~100ms
        
        XCTAssertGreaterThanOrEqual(delays[1], 0.19)
        XCTAssertLessThanOrEqual(delays[1], 0.25)  // ~200ms
        
        XCTAssertGreaterThanOrEqual(delays[2], 0.39)
        XCTAssertLessThanOrEqual(delays[2], 0.45)  // ~400ms
        
        XCTAssertGreaterThanOrEqual(delays[3], 0.79)
        XCTAssertLessThanOrEqual(delays[3], 0.85)  // ~800ms
    }
    
    func testMaxDelayCap() async {
        let policy = RetryPolicy(maxAttempts: 3, baseDelayMs: 5000, maxDelayMs: 1000, jitterFactor: 0.0)
        var attemptTimes: [Date] = []
        
        do {
            _ = try await policy.execute { attempt in
                attemptTimes.append(Date())
                throw NetworkError.httpError(statusCode: 500, retryAfterSeconds: nil)
            }
        } catch {
            // Expected
        }
        
        // Even though base delay is 5000ms, it should be capped at 1000ms
        let delay = attemptTimes[1].timeIntervalSince(attemptTimes[0])
        XCTAssertGreaterThanOrEqual(delay, 0.99)
        XCTAssertLessThanOrEqual(delay, 1.1)  // ~1000ms (max cap)
    }
    
    func testJitterIsApplied() async {
        let policy = RetryPolicy(maxAttempts: 10, baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0.5)
        var delays: [TimeInterval] = []
        
        // Run multiple times to verify jitter creates variability
        for _ in 0..<5 {
            var attemptTimes: [Date] = []
            
            do {
                _ = try await policy.execute { attempt in
                    attemptTimes.append(Date())
                    if attempt < 2 {
                        throw NetworkError.httpError(statusCode: 500, retryAfterSeconds: nil)
                    }
                    return "success"
                }
            } catch {
                // Ignore
            }
            
            if attemptTimes.count >= 2 {
                delays.append(attemptTimes[1].timeIntervalSince(attemptTimes[0]))
            }
        }
        
        // With jitter, delays should vary
        let uniqueDelays = Set(delays.map { Int($0 * 1000) }) // Convert to milliseconds for comparison
        XCTAssertGreaterThan(uniqueDelays.count, 1)
    }
    
    func testRetryOnURLError() async throws {
        let policy = RetryPolicy(maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100)
        var attempts = 0
        
        let result = try await policy.execute { attempt in
            attempts = attempt
            if attempt == 1 {
                throw URLError(.timedOut)
            }
            return "success after URL error"
        }
        
        XCTAssertEqual(result, "success after URL error")
        XCTAssertEqual(attempts, 2)
    }
    
    func testNoRetryOnInvalidResponse() async {
        let policy = RetryPolicy(maxAttempts: 3)
        var thrownError: Error?
        
        do {
            _ = try await policy.execute { attempt in
                throw NetworkError.invalidResponse
            }
            XCTFail("Should have thrown error")
        } catch {
            thrownError = error
        }
        
        XCTAssertNotNil(thrownError)
        if case NetworkError.invalidResponse = thrownError {
            // Success
        } else {
            XCTFail("Wrong error type")
        }
    }
}