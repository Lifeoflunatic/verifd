package com.verifd.android.notification

import android.content.Context
import android.content.Intent
import android.util.Log
import com.verifd.android.telemetry.PrivacyTelemetry
import kotlinx.coroutines.delay
import kotlin.random.Random

/**
 * Enhanced BroadcastReceiver for handling notification actions
 * Extends WakefulNotificationReceiver for reliable background execution
 */
class NotifActionReceiver : WakefulNotificationReceiver() {
    
    companion object {
        private const val TAG = "NotifActionReceiver"
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val RETRY_DELAY_BASE = 1000L // 1 second
    }
    
    override suspend fun handleWakefulIntent(context: Context, intent: Intent) {
        var retryCount = 0
        var lastError: Exception? = null
        
        while (retryCount < MAX_RETRY_ATTEMPTS) {
            try {
                handleAction(context, intent)
                return // Success, exit
            } catch (e: Exception) {
                Log.e(TAG, "Error handling action (attempt ${retryCount + 1}/$MAX_RETRY_ATTEMPTS)", e)
                lastError = e
                retryCount++
                
                if (retryCount < MAX_RETRY_ATTEMPTS) {
                    // Exponential backoff with jitter
                    val delayMs = RETRY_DELAY_BASE * (1 shl (retryCount - 1)) + Random.nextLong(0, 500)
                    delay(delayMs)
                }
            }
        }
        
        // All retries failed
        Log.e(TAG, "Failed to handle action after $MAX_RETRY_ATTEMPTS attempts")
        recordTelemetry(
            context,
            intent.getStringExtra("action_type") ?: "unknown",
            "fail",
            lastError?.message
        )
    }
    
    private suspend fun handleAction(context: Context, intent: Intent) {
        val actionType = intent.getStringExtra("action_type") ?: return
        val notificationManager = MissedCallNotificationManager(context)
        
        when (intent.action) {
            MissedCallNotificationManager.ACTION_SEND_SMS -> {
                val phoneNumber = intent.getStringExtra("phone_number") ?: return
                val smsBody = intent.getStringExtra("sms_body") ?: return
                
                Log.d(TAG, "Handling SMS action for: ${phoneNumber.take(4)}***")
                notificationManager.handleSmsAction(phoneNumber, smsBody)
                recordTelemetry(context, actionType, "ok", null)
            }
            
            MissedCallNotificationManager.ACTION_SEND_WHATSAPP -> {
                val phoneNumber = intent.getStringExtra("phone_number") ?: return
                val message = intent.getStringExtra("message") ?: return
                
                Log.d(TAG, "Handling WhatsApp action for: ${phoneNumber.take(4)}***")
                notificationManager.handleWhatsAppAction(phoneNumber, message)
                recordTelemetry(context, actionType, "ok", null)
            }
            
            MissedCallNotificationManager.ACTION_COPY_LINK -> {
                val link = intent.getStringExtra("link") ?: return
                
                Log.d(TAG, "Handling Copy Link action")
                notificationManager.handleCopyAction(link)
                recordTelemetry(context, actionType, "ok", null)
            }
            
            else -> {
                Log.w(TAG, "Unknown action: ${intent.action}")
            }
        }
    }
    
    /**
     * Record telemetry for notification actions
     */
    private fun recordTelemetry(
        context: Context,
        action: String,
        result: String,
        error: String?
    ) {
        try {
            val telemetry = PrivacyTelemetry(context)
            val metadata = mutableMapOf(
                "action" to action,
                "result" to result,
                "device" to android.os.Build.MODEL,
                "api" to android.os.Build.VERSION.SDK_INT.toString()
            )
            
            error?.let { metadata["error"] = it }
            
            // Get carrier info if available
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? android.telephony.TelephonyManager
            telephonyManager?.networkOperatorName?.let { 
                if (it.isNotBlank()) metadata["carrier"] = it 
            }
            
            telemetry.recordEvent(
                "FEATURE_USED",
                "notification_action",
                metadata
            )
            
            Log.d(TAG, "Telemetry recorded: action=$action, result=$result")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to record telemetry", e)
        }
    }
}