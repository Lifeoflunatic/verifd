package com.verifd.android.network

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class RetryPolicyTest {
    
    @Test
    fun `test successful operation on first attempt`() = runBlocking {
        val policy = RetryPolicy(maxAttempts = 3)
        var attempts = 0
        
        val result = policy.execute { attempt ->
            attempts = attempt
            "success"
        }
        
        assertEquals("success", result)
        assertEquals(1, attempts)
    }
    
    @Test
    fun `test retry on server error`() = runBlocking {
        val policy = RetryPolicy(maxAttempts = 3, baseDelayMs = 10, maxDelayMs = 100)
        var attempts = 0
        
        val result = policy.execute { attempt ->
            attempts = attempt
            if (attempt < 3) {
                throw NetworkException(500, null, "Server error")
            }
            "success after retries"
        }
        
        assertEquals("success after retries", result)
        assertEquals(3, attempts)
    }
    
    @Test
    fun `test retry on rate limit with Retry-After header`() = runBlocking {
        val policy = RetryPolicy(maxAttempts = 3, baseDelayMs = 10, maxDelayMs = 100)
        var attempts = 0
        
        val result = policy.execute { attempt ->
            attempts = attempt
            if (attempt == 1) {
                // First attempt fails with rate limit and Retry-After header
                throw NetworkException(429, retryAfterSeconds = 1, message = "Rate limited")
            }
            "success after rate limit"
        }
        
        assertEquals("success after rate limit", result)
        assertEquals(2, attempts)
    }
    
    @Test(expected = NetworkException::class)
    fun `test no retry on client error`() = runBlocking {
        val policy = RetryPolicy(maxAttempts = 3)
        
        policy.execute { attempt ->
            throw NetworkException(400, null, "Bad request")
        }
    }
    
    @Test
    fun `test retry on network timeout`() = runBlocking {
        val policy = RetryPolicy(maxAttempts = 3, baseDelayMs = 10, maxDelayMs = 100)
        var attempts = 0
        
        val result = policy.execute { attempt ->
            attempts = attempt
            if (attempt == 1) {
                throw SocketTimeoutException("Connection timeout")
            }
            "success after timeout"
        }
        
        assertEquals("success after timeout", result)
        assertEquals(2, attempts)
    }
    
    @Test
    fun `test retry on unknown host`() = runBlocking {
        val policy = RetryPolicy(maxAttempts = 3, baseDelayMs = 10, maxDelayMs = 100)
        var attempts = 0
        
        val result = policy.execute { attempt ->
            attempts = attempt
            if (attempt < 2) {
                throw UnknownHostException("Host not found")
            }
            "success after DNS resolution"
        }
        
        assertEquals("success after DNS resolution", result)
        assertEquals(2, attempts)
    }
    
    @Test(expected = NetworkException::class)
    fun `test max attempts reached`() = runBlocking {
        val policy = RetryPolicy(maxAttempts = 3, baseDelayMs = 10, maxDelayMs = 100)
        
        policy.execute { attempt ->
            throw NetworkException(500, null, "Server error")
        }
    }
    
    @Test
    fun `test exponential backoff calculation`() = runBlocking {
        val policy = RetryPolicy(maxAttempts = 5, baseDelayMs = 100, maxDelayMs = 2000, jitterFactor = 0.0)
        val delays = mutableListOf<Long>()
        val startTimes = mutableListOf<Long>()
        
        try {
            policy.execute { attempt ->
                startTimes.add(System.currentTimeMillis())
                throw NetworkException(500, null, "Server error")
            }
        } catch (e: NetworkException) {
            // Expected
        }
        
        // Calculate actual delays between attempts
        for (i in 1 until startTimes.size) {
            delays.add(startTimes[i] - startTimes[i - 1])
        }
        
        // With jitterFactor = 0, delays should be: 100ms, 200ms, 400ms, 800ms
        // Allow some tolerance due to execution time
        assertTrue(delays[0] >= 90 && delays[0] <= 150)   // ~100ms
        assertTrue(delays[1] >= 190 && delays[1] <= 250)   // ~200ms
        assertTrue(delays[2] >= 390 && delays[2] <= 450)   // ~400ms
        assertTrue(delays[3] >= 790 && delays[3] <= 850)   // ~800ms
    }
    
    @Test
    fun `test max delay cap`() = runBlocking {
        val policy = RetryPolicy(maxAttempts = 3, baseDelayMs = 5000, maxDelayMs = 1000, jitterFactor = 0.0)
        val startTimes = mutableListOf<Long>()
        
        try {
            policy.execute { attempt ->
                startTimes.add(System.currentTimeMillis())
                throw NetworkException(500, null, "Server error")
            }
        } catch (e: NetworkException) {
            // Expected
        }
        
        // Even though base delay is 5000ms, it should be capped at 1000ms
        val delay = startTimes[1] - startTimes[0]
        assertTrue(delay >= 990 && delay <= 1100)  // ~1000ms (max cap)
    }
    
    @Test
    fun `test jitter is applied`() = runBlocking {
        val policy = RetryPolicy(maxAttempts = 10, baseDelayMs = 100, maxDelayMs = 1000, jitterFactor = 0.5)
        val delays = mutableListOf<Long>()
        
        // Run multiple times to verify jitter creates variability
        repeat(5) {
            val startTimes = mutableListOf<Long>()
            
            try {
                policy.execute { attempt ->
                    startTimes.add(System.currentTimeMillis())
                    if (attempt < 2) {
                        throw NetworkException(500, null, "Server error")
                    }
                    "success"
                }
            } catch (e: Exception) {
                // Ignore
            }
            
            if (startTimes.size >= 2) {
                delays.add(startTimes[1] - startTimes[0])
            }
        }
        
        // With jitter, delays should vary
        assertTrue(delays.distinct().size > 1)
    }
}