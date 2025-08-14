package com.verifd.android.network

import kotlinx.coroutines.delay
import java.net.HttpURLConnection
import kotlin.math.min
import kotlin.random.Random

/**
 * Retry policy with exponential backoff and jitter for network requests
 */
class RetryPolicy(
    private val maxAttempts: Int = 5,
    private val baseDelayMs: Long = 500,
    private val maxDelayMs: Long = 8000,
    private val jitterFactor: Double = 0.2
) {
    /**
     * Execute a network operation with retry logic
     */
    suspend fun <T> execute(
        operation: suspend (attempt: Int) -> T
    ): T {
        var lastException: Exception? = null
        
        for (attempt in 1..maxAttempts) {
            try {
                return operation(attempt)
            } catch (e: Exception) {
                lastException = e
                
                // Check if retryable
                if (!isRetryable(e) || attempt == maxAttempts) {
                    throw e
                }
                
                // Calculate delay with exponential backoff and jitter
                val delay = calculateDelay(attempt, e)
                delay(delay)
            }
        }
        
        throw lastException ?: IllegalStateException("Retry failed")
    }
    
    /**
     * Determine if an exception is retryable
     */
    private fun isRetryable(exception: Exception): Boolean {
        return when (exception) {
            is NetworkException -> {
                when (exception.statusCode) {
                    // Don't retry client errors (except 429)
                    in 400..428 -> false
                    429 -> true  // Rate limited - retry with backoff
                    in 430..499 -> false
                    // Retry server errors
                    in 500..599 -> true
                    // Retry network errors
                    -1 -> true
                    else -> false
                }
            }
            is java.net.SocketTimeoutException,
            is java.net.UnknownHostException,
            is java.io.IOException -> true
            else -> false
        }
    }
    
    /**
     * Calculate delay with exponential backoff and jitter
     */
    private fun calculateDelay(attempt: Int, exception: Exception): Long {
        // Check for Retry-After header in case of rate limiting
        if (exception is NetworkException && exception.retryAfterSeconds != null) {
            return exception.retryAfterSeconds * 1000L
        }
        
        // Exponential backoff: baseDelay * 2^(attempt-1)
        val exponentialDelay = baseDelayMs * (1 shl (attempt - 1))
        
        // Cap at max delay
        val cappedDelay = min(exponentialDelay, maxDelayMs)
        
        // Add jitter to prevent thundering herd
        val jitter = (cappedDelay * jitterFactor * Random.nextDouble()).toLong()
        
        return cappedDelay + jitter
    }
}

/**
 * Custom exception for network errors with status code
 */
class NetworkException(
    val statusCode: Int,
    val retryAfterSeconds: Long? = null,
    message: String? = null,
    cause: Throwable? = null
) : Exception(message, cause) {
    companion object {
        fun fromHttpResponse(connection: HttpURLConnection): NetworkException {
            val retryAfter = connection.getHeaderField("Retry-After")?.toLongOrNull()
            return NetworkException(
                statusCode = connection.responseCode,
                retryAfterSeconds = retryAfter,
                message = "HTTP ${connection.responseCode}: ${connection.responseMessage}"
            )
        }
    }
}