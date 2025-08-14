package com.verifd.android.util

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.util.Log
import androidx.core.app.ActivityCompat
import com.verifd.android.BuildConfig
import com.verifd.android.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Store-safe SMS utility class using ACTION_SENDTO intent instead of direct SMS API.
 * 
 * STORE COMPLIANCE: This class uses ACTION_SENDTO with sms: URI scheme instead of 
 * requesting SEND_SMS permission. This ensures:
 * - No dangerous permissions required in manifest
 * - User's SMS app handles actual sending (respects user choice)
 * - Dual-SIM support via subscription extras without being default SMS app
 * - Full transparency to user about what messages are being sent
 */
object SmsUtils {
    
    private const val TAG = "SmsUtils"
    
    /**
     * Get list of active SIM subscriptions for dual-SIM picker
     */
    fun getActiveSubscriptions(context: Context): List<SubscriptionInfo> {
        return try {
            if (ActivityCompat.checkSelfPermission(
                    context,
                    Manifest.permission.READ_PHONE_STATE
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                Log.w(TAG, "No READ_PHONE_STATE permission")
                return emptyList()
            }
            
            val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) 
                as? SubscriptionManager
            
            subscriptionManager?.activeSubscriptionInfoList?.filter { 
                it != null 
            } ?: emptyList()
            
        } catch (e: Exception) {
            Log.e(TAG, "Error getting active subscriptions", e)
            emptyList()
        }
    }
    
    /**
     * Create SMS intent using ACTION_SENDTO for store-safe SMS sending.
     * 
     * IMPLEMENTATION NOTE: Uses ACTION_SENDTO with sms: URI scheme - this is the store-safe
     * approach that delegates to user's SMS app instead of requiring SEND_SMS permission.
     * 
     * @param phoneNumber Target phone number for SMS
     * @param message SMS body text 
     * @param subscription Optional subscription for dual-SIM support (only added if available)
     * @return Intent ready for startActivity() call
     */
    fun createSmsIntent(
        phoneNumber: String,
        message: String,
        subscription: SubscriptionInfo? = null
    ): Intent {
        // STORE COMPLIANCE: Use sms: URI scheme with ACTION_SENDTO - no SEND_SMS permission needed
        val smsUri = Uri.parse("sms:$phoneNumber")
        
        val intent = Intent(Intent.ACTION_SENDTO, smsUri).apply {
            // Standard SMS body extra recognized by all SMS apps
            putExtra("sms_body", message)
            
            // DUAL-SIM: Add subscription extra only when available - fallback to system picker if not
            // Note: Do NOT use SmsManager unless app is default SMS app (store policy violation)
            subscription?.let { sub ->
                // These extras are handled by SMS apps for dual-SIM selection
                putExtra("subscription_id", sub.subscriptionId)
                putExtra("slot_id", sub.simSlotIndex)
                
                Log.d(TAG, "SMS intent created for ${sub.displayName} (slot ${sub.simSlotIndex})")
            }
            
            // Ensure we only target SMS-capable applications
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        
        Log.d(TAG, "Created ACTION_SENDTO SMS intent for $phoneNumber with message length: ${message.length}")
        return intent
    }
    
    /**
     * Launch SMS intent if SMS app is available
     * @return true if intent can be resolved, false otherwise
     */
    fun sendSmsViaIntent(
        context: Context,
        phoneNumber: String,
        message: String,
        subscription: SubscriptionInfo? = null
    ): Boolean {
        return try {
            val intent = createSmsIntent(phoneNumber, message, subscription)
            
            // Check if there's an app that can handle SMS intents
            if (intent.resolveActivity(context.packageManager) != null) {
                // Add flags for launching from service/background context
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                Log.d(TAG, "SMS intent launched successfully to $phoneNumber")
                true
            } else {
                Log.w(TAG, "No SMS app available to handle intent")
                false
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch SMS intent for $phoneNumber", e)
            false
        }
    }
    
    /**
     * Get display name for SIM subscription
     */
    fun getSimDisplayName(subscription: SubscriptionInfo): String {
        return when {
            !subscription.displayName.isNullOrEmpty() -> subscription.displayName.toString()
            !subscription.carrierName.isNullOrEmpty() -> subscription.carrierName.toString()
            else -> "SIM ${subscription.simSlotIndex + 1}"
        }
    }
    
    /**
     * Check if dual-SIM is available
     */
    fun isDualSimAvailable(context: Context): Boolean {
        val subscriptions = getActiveSubscriptions(context)
        return subscriptions.size > 1
    }
    
    /**
     * Data class for verification response from backend
     */
    data class VerificationResponse(
        val success: Boolean,
        val token: String?,
        val verifyUrl: String?,
        val error: String?
    )
    
    /**
     * Create an Identity Ping by calling the backend API and generating the SMS message
     * 
     * @param context Application context
     * @param phoneNumber Target phone number
     * @param yourName Your name to include in the message
     * @param reason Reason for the call (optional, defaults to "verification")
     * @return VerificationResponse with token and URL, or error
     */
    suspend fun createIdentityPing(
        context: Context,
        phoneNumber: String,
        yourName: String,
        reason: String = "verification"
    ): VerificationResponse = withContext(Dispatchers.IO) {
        try {
            // TODO: Get backend URL from config/shared preferences
            val backendUrl = "http://10.0.2.2:3000" // Android emulator localhost
            val url = URL("$backendUrl/api/verify/start")
            
            val connection = url.openConnection() as HttpURLConnection
            connection.apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                doOutput = true
                connectTimeout = 10_000
                readTimeout = 10_000
            }
            
            // Create request body
            val requestBody = JSONObject().apply {
                put("phoneNumber", phoneNumber)
                put("name", yourName)
                put("reason", reason)
            }
            
            // Send request
            connection.outputStream.use { os ->
                os.write(requestBody.toString().toByteArray(Charsets.UTF_8))
            }
            
            val responseCode = connection.responseCode
            
            if (responseCode == HttpURLConnection.HTTP_OK) {
                val response = connection.inputStream.bufferedReader().use { it.readText() }
                val jsonResponse = JSONObject(response)
                
                VerificationResponse(
                    success = jsonResponse.getBoolean("success"),
                    token = jsonResponse.optString("token"),
                    verifyUrl = jsonResponse.optString("verifyUrl"),
                    error = null
                )
            } else {
                val errorResponse = connection.errorStream?.bufferedReader()?.use { it.readText() }
                Log.e(TAG, "Backend API error: $responseCode - $errorResponse")
                
                VerificationResponse(
                    success = false,
                    token = null,
                    verifyUrl = null,
                    error = "Server error: $responseCode"
                )
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error calling backend API", e)
            VerificationResponse(
                success = false,
                token = null,
                verifyUrl = null,
                error = "Network error: ${e.message}"
            )
        }
    }
    
    /**
     * Create Identity Ping SMS message with dynamic link
     * 
     * @param context Application context for string resources
     * @param yourName Your name to include in message
     * @param code The verification code
     * @return Formatted SMS message
     */
    fun createIdentityPingMessage(
        context: Context,
        yourName: String,
        code: String
    ): String {
        val verifyUrl = "${BuildConfig.VERIFY_ORIGIN}/v/$code"
        return context.getString(R.string.identity_ping_template, yourName, verifyUrl)
    }
    
    /**
     * Create and launch Identity Ping SMS composer
     * 
     * This method:
     * 1. Calls backend to generate verification token and URL
     * 2. Creates formatted SMS message with dynamic link
     * 3. Launches ACTION_SENDTO SMS composer with prefilled body
     * 4. Handles dual-SIM selection gracefully
     * 
     * @param context Application context
     * @param phoneNumber Target phone number
     * @param yourName Your name to include in message
     * @param reason Reason for the call
     * @param subscription Optional subscription for dual-SIM (null = system picker)
     * @return VerificationResponse indicating success/failure
     */
    suspend fun launchIdentityPingComposer(
        context: Context,
        phoneNumber: String,
        yourName: String,
        reason: String = "verification",
        subscription: SubscriptionInfo? = null
    ): VerificationResponse {
        
        // Step 1: Get verification URL from backend
        val verificationResponse = createIdentityPing(context, phoneNumber, yourName, reason)
        
        if (!verificationResponse.success || verificationResponse.verifyUrl.isNullOrEmpty()) {
            return verificationResponse
        }
        
        // Step 2: Create SMS message with dynamic link
        // Extract code from the URL or use token
        val code = verificationResponse.token ?: ""
        val smsMessage = createIdentityPingMessage(
            context,
            yourName,
            code
        )
        
        // Step 3: Launch SMS composer
        val smsIntent = createSmsIntent(phoneNumber, smsMessage, subscription)
        
        return try {
            // Check if there's an SMS app that can handle the intent
            if (smsIntent.resolveActivity(context.packageManager) != null) {
                smsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(smsIntent)
                
                Log.d(TAG, "Identity Ping composer launched for $phoneNumber")
                verificationResponse // Return success response with token/URL
            } else {
                Log.w(TAG, "No SMS app available to handle Identity Ping")
                VerificationResponse(
                    success = false,
                    token = null,
                    verifyUrl = null,
                    error = "No SMS app available"
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch Identity Ping composer", e)
            VerificationResponse(
                success = false,
                token = null,
                verifyUrl = null,
                error = "Failed to launch SMS app: ${e.message}"
            )
        }
    }
}