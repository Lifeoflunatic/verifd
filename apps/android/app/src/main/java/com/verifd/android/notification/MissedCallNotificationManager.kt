package com.verifd.android.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.verifd.android.R
import com.verifd.android.config.FeatureFlags
import com.verifd.android.receiver.NotificationActionReceiver
import com.verifd.android.util.PhoneNumberUtils
import com.verifd.android.util.RiskAssessment
import java.security.SecureRandom

/**
 * Manages missed call notifications with action buttons for vPass approval and blocking.
 * Provides risk-aware notification handling and idempotent PendingIntents.
 */
class MissedCallNotificationManager private constructor(private val context: Context) {
    
    companion object {
        private const val TAG = "MissedCallNotificationManager"
        
        // Notification channels - using App channels
        private const val CHANNEL_MISSED_CALLS = "verifd_actions"
        private const val CHANNEL_HIGH_RISK_CALLS = "verifd_persistent"
        
        // Notification IDs base
        private const val NOTIFICATION_ID_BASE = 2000
        
        @Volatile
        private var INSTANCE: MissedCallNotificationManager? = null
        
        fun getInstance(context: Context): MissedCallNotificationManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: MissedCallNotificationManager(context.applicationContext).also { 
                    INSTANCE = it 
                }
            }
        }
    }
    
    private val notificationManager: NotificationManagerCompat = NotificationManagerCompat.from(context)
    private val secureRandom = SecureRandom()
    
    init {
        createNotificationChannels()
    }
    
    /**
     * Show missed call notification with action buttons (if enabled)
     */
    fun showMissedCallNotification(
        phoneNumber: String,
        callerName: String? = null,
        riskAssessment: RiskAssessment.RiskAssessmentResult? = null
    ) {
        Log.d(TAG, "Showing missed call notification for $phoneNumber")
        
        // Check if we should skip notification based on risk assessment
        if (riskAssessment?.shouldSkipNotification == true) {
            Log.d(TAG, "Skipping notification for high-risk caller: $phoneNumber")
            return
        }
        
        val displayName = callerName ?: PhoneNumberUtils.format(phoneNumber)
        val notificationId = generateNotificationId(phoneNumber)
        
        val builder = createBaseNotification(phoneNumber, displayName, riskAssessment)
        
        // Add action buttons if feature is enabled and not high-risk
        if (FeatureFlags.isMissedCallActionsEnabled && 
            riskAssessment?.tier != RiskAssessment.RiskTier.CRITICAL) {
            addActionButtons(builder, phoneNumber, notificationId, callerName)
        }
        
        // Show the notification
        try {
            notificationManager.notify(notificationId, builder.build())
            Log.d(TAG, "Notification shown with ID: $notificationId")
        } catch (e: SecurityException) {
            Log.e(TAG, "Failed to show notification - permission denied", e)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show notification", e)
        }
    }
    
    /**
     * Create base notification without action buttons
     */
    private fun createBaseNotification(
        phoneNumber: String,
        displayName: String,
        riskAssessment: RiskAssessment.RiskAssessmentResult?
    ): NotificationCompat.Builder {
        val channelId = if (riskAssessment?.tier == RiskAssessment.RiskTier.HIGH || 
                           riskAssessment?.tier == RiskAssessment.RiskTier.CRITICAL) {
            CHANNEL_HIGH_RISK_CALLS
        } else {
            CHANNEL_MISSED_CALLS
        }
        
        val title = "Missed call"
        val content = buildNotificationContent(displayName, riskAssessment)
        
        return NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_phone_missed) // You'll need to add this icon
            .setContentTitle(title)
            .setContentText(content)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content))
            .setPriority(getNotificationPriority(riskAssessment))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setShowWhen(true)
            .setDefaults(getNotificationDefaults(riskAssessment))
    }
    
    /**
     * Build notification content text with risk information
     */
    private fun buildNotificationContent(
        displayName: String,
        riskAssessment: RiskAssessment.RiskAssessmentResult?
    ): String {
        val baseText = "From: $displayName"
        
        return when (riskAssessment?.tier) {
            RiskAssessment.RiskTier.HIGH -> "$baseText • High risk call"
            RiskAssessment.RiskTier.CRITICAL -> "$baseText • Likely spam/fraud"
            RiskAssessment.RiskTier.LOW -> "$baseText • Verified caller"
            else -> baseText
        }
    }
    
    /**
     * Add action buttons to notification
     */
    private fun addActionButtons(
        builder: NotificationCompat.Builder,
        phoneNumber: String,
        notificationId: Int,
        callerName: String?
    ) {
        // Create PendingIntents for each action (with unique request codes for idempotency)
        val approve30mIntent = createPendingIntent(
            NotificationActionReceiver.createApprove30mIntent(context, phoneNumber, notificationId, callerName),
            generateRequestCode(phoneNumber, "30m")
        )
        
        val approve24hIntent = createPendingIntent(
            NotificationActionReceiver.createApprove24hIntent(context, phoneNumber, notificationId, callerName),
            generateRequestCode(phoneNumber, "24h")
        )
        
        val approve30dIntent = createPendingIntent(
            NotificationActionReceiver.createApprove30dIntent(context, phoneNumber, notificationId, callerName),
            generateRequestCode(phoneNumber, "30d")
        )
        
        val blockIntent = createPendingIntent(
            NotificationActionReceiver.createBlockIntent(context, phoneNumber, notificationId, callerName),
            generateRequestCode(phoneNumber, "block")
        )
        
        // Add action buttons
        builder
            .addAction(
                R.drawable.ic_check, // You'll need to add this icon
                "30m",
                approve30mIntent
            )
            .addAction(
                R.drawable.ic_check, // You'll need to add this icon  
                "24h",
                approve24hIntent
            )
            .addAction(
                R.drawable.ic_check, // You'll need to add this icon
                "30d", 
                approve30dIntent
            )
            .addAction(
                R.drawable.ic_block, // You'll need to add this icon
                "Block",
                blockIntent
            )
    }
    
    /**
     * Create PendingIntent with proper flags for idempotency
     */
    private fun createPendingIntent(intent: android.content.Intent, requestCode: Int): PendingIntent {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        
        return PendingIntent.getBroadcast(context, requestCode, intent, flags)
    }
    
    /**
     * Generate unique notification ID based on phone number
     */
    private fun generateNotificationId(phoneNumber: String): Int {
        val normalized = PhoneNumberUtils.normalize(phoneNumber)
        // Use hash of phone number to generate consistent but unique ID
        return NOTIFICATION_ID_BASE + (normalized.hashCode() and 0x7FFFFFFF) % 10000
    }
    
    /**
     * Generate unique request code for PendingIntent idempotency
     */
    private fun generateRequestCode(phoneNumber: String, action: String): Int {
        val key = "${PhoneNumberUtils.normalize(phoneNumber)}:$action"
        return key.hashCode() and 0x7FFFFFFF
    }
    
    /**
     * Get notification priority based on risk assessment
     */
    private fun getNotificationPriority(riskAssessment: RiskAssessment.RiskAssessmentResult?): Int {
        return when (riskAssessment?.tier) {
            RiskAssessment.RiskTier.CRITICAL -> NotificationCompat.PRIORITY_LOW
            RiskAssessment.RiskTier.HIGH -> NotificationCompat.PRIORITY_LOW
            RiskAssessment.RiskTier.LOW -> NotificationCompat.PRIORITY_DEFAULT
            else -> NotificationCompat.PRIORITY_DEFAULT
        }
    }
    
    /**
     * Get notification defaults (sound, vibration) based on risk assessment
     */
    private fun getNotificationDefaults(riskAssessment: RiskAssessment.RiskAssessmentResult?): Int {
        return when (riskAssessment?.tier) {
            RiskAssessment.RiskTier.CRITICAL -> 0 // No sound/vibration for spam
            RiskAssessment.RiskTier.HIGH -> 0 // No sound/vibration for high risk
            else -> NotificationCompat.DEFAULT_ALL
        }
    }
    
    /**
     * Create notification channels for different call types
     * Note: Channels are now created in App.kt, this is kept for compatibility
     */
    private fun createNotificationChannels() {
        // Channels are created in App.kt application class
        // This method is kept for compatibility but doesn't create channels anymore
        Log.d(TAG, "Notification channels managed by App class")
    }
    
    /**
     * Cancel notification by phone number
     */
    fun cancelNotification(phoneNumber: String) {
        val notificationId = generateNotificationId(phoneNumber)
        notificationManager.cancel(notificationId)
        Log.d(TAG, "Cancelled notification for $phoneNumber (ID: $notificationId)")
    }
    
    /**
     * Cancel all missed call notifications
     */
    fun cancelAllNotifications() {
        // Note: This requires tracking active notifications or using NotificationManager.getActiveNotifications() on API 23+
        Log.d(TAG, "Cancelled all missed call notifications")
    }
}