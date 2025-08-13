package com.verifd.android.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.verifd.android.network.RetryPolicy
import com.verifd.android.network.NetworkException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Backend API client with HMAC authentication for verifd.
 * Handles device registration, pass checking, and pass granting.
 */
class BackendClient private constructor(context: Context) {
    
    companion object {
        private const val TAG = "BackendClient"
        private const val PREFS_NAME = "verifd_device_auth"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_DEVICE_KEY = "device_key"
        private const val KEY_CUSTOM_URL = "custom_backend_url"
        
        @Volatile
        private var INSTANCE: BackendClient? = null
        
        fun getInstance(context: Context): BackendClient {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: BackendClient(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
    
    private val prefs: SharedPreferences = try {
        // Use encrypted shared preferences for production
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        EncryptedSharedPreferences.create(
            PREFS_NAME,
            masterKeyAlias,
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        Log.e(TAG, "Failed to create encrypted prefs, using regular", e)
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }
    
    private var deviceId: String? = prefs.getString(KEY_DEVICE_ID, null)
    private var deviceKey: String? = prefs.getString(KEY_DEVICE_KEY, null)
    
    // Use BuildConfig URL with optional runtime override
    private val baseUrl: String = prefs.getString(KEY_CUSTOM_URL, null) 
        ?: com.verifd.android.BuildConfig.BASE_URL
    
    // Retry policy for network requests
    private val retryPolicy = RetryPolicy(
        maxAttempts = 5,
        baseDelayMs = 500,
        maxDelayMs = 8000,
        jitterFactor = 0.2
    )
    
    /**
     * Set custom backend URL (for development/testing)
     */
    fun setCustomBackendUrl(url: String?) {
        if (url.isNullOrBlank()) {
            prefs.edit().remove(KEY_CUSTOM_URL).apply()
        } else {
            prefs.edit().putString(KEY_CUSTOM_URL, url).apply()
        }
        // Note: Requires app restart to take effect
    }
    
    /**
     * Get current backend URL (for debugging)
     */
    fun getCurrentBackendUrl(): String = baseUrl
    
    /**
     * Get or create device ID
     */
    private fun getOrCreateDeviceId(): String {
        return deviceId ?: run {
            val newId = generateDeviceId()
            deviceId = newId
            prefs.edit().putString(KEY_DEVICE_ID, newId).apply()
            newId
        }
    }
    
    /**
     * Generate a new device ID
     */
    private fun generateDeviceId(): String {
        val random = SecureRandom()
        val bytes = ByteArray(16)
        random.nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Register device with backend if not already registered
     */
    suspend fun ensureRegistered(): Boolean = withContext(Dispatchers.IO) {
        if (deviceId != null && deviceKey != null) {
            return@withContext true
        }
        
        try {
            val url = URL("$baseUrl/device/register")
            val connection = url.openConnection() as HttpURLConnection
            
            connection.apply {
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = 10000
                readTimeout = 10000
            }
            
            val body = JSONObject().apply {
                put("platform", "android")
                put("model", android.os.Build.MODEL)
                put("app_version", "1.0.0") // TODO: Get from BuildConfig
            }
            
            connection.outputStream.use { os ->
                os.write(body.toString().toByteArray())
            }
            
            if (connection.responseCode == 200) {
                val response = connection.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(response)
                
                if (json.getBoolean("success")) {
                    deviceId = json.getString("device_id")
                    deviceKey = json.getString("device_key")
                    
                    // Store credentials
                    prefs.edit().apply {
                        putString(KEY_DEVICE_ID, deviceId)
                        putString(KEY_DEVICE_KEY, deviceKey)
                        apply()
                    }
                    
                    Log.d(TAG, "Device registered: $deviceId")
                    return@withContext true
                }
            }
            
            Log.e(TAG, "Failed to register device: ${connection.responseCode}")
            false
            
        } catch (e: Exception) {
            Log.e(TAG, "Device registration error", e)
            false
        }
    }
    
    /**
     * Check if a phone number has an active pass
     */
    suspend fun checkPass(phoneNumber: String): PassCheckResult = withContext(Dispatchers.IO) {
        if (!ensureRegistered()) {
            return@withContext PassCheckResult.Error("Device not registered")
        }
        
        try {
            return@withContext retryPolicy.execute { attempt ->
                Log.d(TAG, "Checking pass, attempt $attempt")
                
                val encodedNumber = java.net.URLEncoder.encode(phoneNumber, "UTF-8")
                val url = URL("$baseUrl/pass/check?number_e164=$encodedNumber")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.apply {
                    requestMethod = "GET"
                    connectTimeout = 5000
                    readTimeout = 5000
                }
                
                // Add HMAC authentication
                addHmacHeaders(connection, "GET", "/pass/check", "")
                
                val responseCode = connection.responseCode
                
                when {
                    responseCode == 200 -> {
                        val response = connection.inputStream.bufferedReader().use { it.readText() }
                        val json = JSONObject(response)
                        
                        if (json.getBoolean("allowed")) {
                            val scope = json.optString("scope", "24h")
                            val expiresAt = json.getString("expires_at")
                            val grantedTo = json.optString("granted_to_name", "Unknown")
                            
                            PassCheckResult.Allowed(
                                scope = scope,
                                expiresAt = expiresAt,
                                grantedToName = grantedTo
                            )
                        } else {
                            PassCheckResult.NotAllowed
                        }
                    }
                    responseCode == 429 -> {
                        // Rate limited - will be retried by RetryPolicy
                        throw NetworkException.fromHttpResponse(connection)
                    }
                    responseCode in 500..599 -> {
                        // Server error - will be retried
                        throw NetworkException.fromHttpResponse(connection)
                    }
                    else -> {
                        // Client error or not found
                        PassCheckResult.NotAllowed
                    }
                }
            }
        } catch (e: NetworkException) {
            if (e.statusCode == 429) {
                Log.w(TAG, "Rate limited after retries")
                PassCheckResult.RateLimited
            } else {
                Log.e(TAG, "Pass check failed after retries", e)
                PassCheckResult.Error(e.message ?: "Network error")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Pass check error", e)
            PassCheckResult.Error(e.message ?: "Network error")
        }
    }
    
    /**
     * Grant a pass to a phone number
     */
    suspend fun grantPass(
        phoneNumber: String,
        scope: String,
        name: String? = null,
        reason: String? = null
    ): GrantPassResult = withContext(Dispatchers.IO) {
        if (!ensureRegistered()) {
            return@withContext GrantPassResult.Error("Device not registered")
        }
        
        try {
            return@withContext retryPolicy.execute { attempt ->
                Log.d(TAG, "Granting pass, attempt $attempt")
                
                val url = URL("$baseUrl/passes/grant")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.apply {
                    requestMethod = "POST"
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    connectTimeout = 10000
                    readTimeout = 10000
                }
                
                val body = JSONObject().apply {
                    put("number_e164", phoneNumber)
                    put("scope", scope)
                    name?.let { put("granted_to_name", it) }
                    reason?.let { put("reason", it) }
                    put("channel", "device")
                }
                
                val bodyString = body.toString()
                
                // Add HMAC authentication
                addHmacHeaders(connection, "POST", "/passes/grant", bodyString)
                
                connection.outputStream.use { os ->
                    os.write(bodyString.toByteArray())
                }
                
                val responseCode = connection.responseCode
                
                when {
                    responseCode == 200 -> {
                        val response = connection.inputStream.bufferedReader().use { it.readText() }
                        val json = JSONObject(response)
                        
                        if (json.getBoolean("success")) {
                            GrantPassResult.Success(
                                passId = json.getString("pass_id"),
                                expiresAt = json.getString("expires_at")
                            )
                        } else {
                            GrantPassResult.Error("Server returned success=false")
                        }
                    }
                    responseCode == 429 -> {
                        // Rate limited - will be retried by RetryPolicy
                        throw NetworkException.fromHttpResponse(connection)
                    }
                    responseCode in 500..599 -> {
                        // Server error - will be retried
                        throw NetworkException.fromHttpResponse(connection)
                    }
                    else -> {
                        // Client error - don't retry
                        GrantPassResult.Error("Failed to grant pass: $responseCode")
                    }
                }
            }
        } catch (e: NetworkException) {
            if (e.statusCode == 429) {
                Log.w(TAG, "Rate limited after retries")
                GrantPassResult.RateLimited
            } else {
                Log.e(TAG, "Grant pass failed after retries", e)
                GrantPassResult.Error(e.message ?: "Network error")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Grant pass error", e)
            GrantPassResult.Error(e.message ?: "Network error")
        }
    }
    
    /**
     * Add HMAC authentication headers to request
     */
    private fun addHmacHeaders(
        connection: HttpURLConnection,
        method: String,
        path: String,
        body: String
    ) {
        val timestamp = (System.currentTimeMillis() / 1000).toString()
        val payload = "$method:$path:$timestamp:$body"
        
        val signature = calculateHmac(payload, deviceKey!!)
        
        connection.setRequestProperty("X-Device-ID", deviceId)
        connection.setRequestProperty("X-Device-Sign", signature)
        connection.setRequestProperty("X-Timestamp", timestamp)
    }
    
    /**
     * Calculate HMAC-SHA256 signature
     */
    private fun calculateHmac(data: String, key: String): String {
        val secretKey = SecretKeySpec(key.toByteArray(), "HmacSHA256")
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(secretKey)
        val hmacBytes = mac.doFinal(data.toByteArray())
        return hmacBytes.joinToString("") { "%02x".format(it) }
    }
    
    // Result types
    sealed class PassCheckResult {
        data class Allowed(
            val scope: String,
            val expiresAt: String,
            val grantedToName: String
        ) : PassCheckResult()
        object NotAllowed : PassCheckResult()
        object RateLimited : PassCheckResult()
        data class Error(val message: String) : PassCheckResult()
    }
    
    /**
     * Fetch message templates for notification actions.
     * Uses caching on the backend (24h TTL per number).
     */
    suspend fun fetchMessageTemplates(
        phoneNumber: String,
        userName: String? = null,
        locale: String = "en-US"
    ): MessageTemplatesResult = withContext(Dispatchers.IO) {
        ensureRegistered()
        
        try {
            retryPolicy.execute { attempt ->
                val url = URL("${baseUrl}/v1/verify/link?" +
                    "phone_number=${phoneNumber.urlEncode()}" +
                    "&device_id=${getOrCreateDeviceId()}" +
                    "&locale=$locale" +
                    (userName?.let { "&user_name=${it.urlEncode()}" } ?: ""))
                
                val connection = url.openConnection() as HttpURLConnection
                connection.apply {
                    requestMethod = "GET"
                    connectTimeout = 5000
                    readTimeout = 5000
                }
                
                val responseCode = connection.responseCode
                
                when {
                    responseCode == 200 -> {
                        val response = connection.inputStream.bufferedReader().use { it.readText() }
                        val json = JSONObject(response)
                        
                        MessageTemplatesResult.Success(
                            smsTemplate = json.getString("sms_template"),
                            whatsAppTemplate = json.getString("whatsapp_template"),
                            verifyLink = json.getString("verify_link"),
                            cached = json.getBoolean("cached"),
                            ttlSeconds = json.getInt("ttl_seconds")
                        )
                    }
                    responseCode == 429 -> {
                        val response = connection.errorStream?.bufferedReader()?.use { it.readText() }
                        val json = response?.let { JSONObject(it) }
                        val retryAfter = json?.optInt("retry_after", 60) ?: 60
                        
                        MessageTemplatesResult.RateLimited(retryAfter)
                    }
                    responseCode == 400 -> {
                        MessageTemplatesResult.Error("Invalid phone number")
                    }
                    responseCode in 500..599 -> {
                        // Server error - will be retried
                        throw NetworkException.fromHttpResponse(connection)
                    }
                    else -> {
                        MessageTemplatesResult.Error("Failed to fetch templates: $responseCode")
                    }
                }
            }
        } catch (e: NetworkException) {
            if (e.statusCode == 429) {
                Log.w(TAG, "Rate limited fetching templates")
                MessageTemplatesResult.RateLimited(60)
            } else {
                Log.e(TAG, "Failed to fetch templates", e)
                MessageTemplatesResult.Error(e.message ?: "Network error")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch templates", e)
            MessageTemplatesResult.Error(e.message ?: "Unknown error")
        }
    }
    
    private fun String.urlEncode(): String {
        return java.net.URLEncoder.encode(this, "UTF-8")
    }
    
    sealed class MessageTemplatesResult {
        data class Success(
            val smsTemplate: String,
            val whatsAppTemplate: String,
            val verifyLink: String,
            val cached: Boolean,
            val ttlSeconds: Int
        ) : MessageTemplatesResult()
        data class RateLimited(val retryAfterSeconds: Int) : MessageTemplatesResult()
        data class Error(val message: String) : MessageTemplatesResult()
    }
    
    sealed class GrantPassResult {
        data class Success(
            val passId: String,
            val expiresAt: String
        ) : GrantPassResult()
        object RateLimited : GrantPassResult()
        data class Error(val message: String) : GrantPassResult()
    }
}