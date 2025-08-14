package com.verifd.android.receiver

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.verifd.android.data.BackendClient
import com.verifd.android.data.ContactRepository
import com.verifd.android.data.model.VPassEntry
import com.verifd.android.util.PhoneNumberUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.Date
import java.util.concurrent.ConcurrentHashMap

/**
 * BroadcastReceiver for handling missed call notification actions.
 * Provides idempotent handling of approve (30m/24h/30d) and block actions.
 */
class NotificationActionReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "NotificationActionReceiver"
        
        // Intent actions
        const val ACTION_APPROVE_30M = "com.verifd.android.ACTION_APPROVE_30M"
        const val ACTION_APPROVE_24H = "com.verifd.android.ACTION_APPROVE_24H"
        const val ACTION_APPROVE_30D = "com.verifd.android.ACTION_APPROVE_30D"
        const val ACTION_BLOCK = "com.verifd.android.ACTION_BLOCK"
        
        // Intent extras
        const val EXTRA_PHONE_NUMBER = "phone_number"
        const val EXTRA_NOTIFICATION_ID = "notification_id"
        const val EXTRA_CALLER_NAME = "caller_name"
        
        // Idempotency tracking - prevents duplicate actions
        private val processedActions = ConcurrentHashMap<String, Long>()
        private const val ACTION_TIMEOUT_MS = 30000L // 30 seconds
        
        /**
         * Create intent for approve 30 minutes action
         */
        fun createApprove30mIntent(
            context: Context,
            phoneNumber: String,
            notificationId: Int,
            callerName: String? = null
        ): Intent {
            return Intent(context, NotificationActionReceiver::class.java).apply {
                action = ACTION_APPROVE_30M
                putExtra(EXTRA_PHONE_NUMBER, phoneNumber)
                putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                callerName?.let { putExtra(EXTRA_CALLER_NAME, it) }
            }
        }
        
        /**
         * Create intent for approve 24 hours action
         */
        fun createApprove24hIntent(
            context: Context,
            phoneNumber: String,
            notificationId: Int,
            callerName: String? = null
        ): Intent {
            return Intent(context, NotificationActionReceiver::class.java).apply {
                action = ACTION_APPROVE_24H
                putExtra(EXTRA_PHONE_NUMBER, phoneNumber)
                putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                callerName?.let { putExtra(EXTRA_CALLER_NAME, it) }
            }
        }
        
        /**
         * Create intent for approve 30 days action
         */
        fun createApprove30dIntent(
            context: Context,
            phoneNumber: String,
            notificationId: Int,
            callerName: String? = null
        ): Intent {
            return Intent(context, NotificationActionReceiver::class.java).apply {
                action = ACTION_APPROVE_30D
                putExtra(EXTRA_PHONE_NUMBER, phoneNumber)
                putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                callerName?.let { putExtra(EXTRA_CALLER_NAME, it) }
            }
        }
        
        /**
         * Create intent for block action
         */
        fun createBlockIntent(
            context: Context,
            phoneNumber: String,
            notificationId: Int,
            callerName: String? = null
        ): Intent {
            return Intent(context, NotificationActionReceiver::class.java).apply {
                action = ACTION_BLOCK
                putExtra(EXTRA_PHONE_NUMBER, phoneNumber)
                putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                callerName?.let { putExtra(EXTRA_CALLER_NAME, it) }
            }
        }
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "Received notification action: ${intent.action}")
        
        val phoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER)
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)
        val callerName = intent.getStringExtra(EXTRA_CALLER_NAME)
        
        if (phoneNumber.isNullOrEmpty()) {
            Log.e(TAG, "No phone number provided in notification action")
            return
        }
        
        if (notificationId == -1) {
            Log.e(TAG, "Invalid notification ID")
            return
        }
        
        // Check for idempotency - prevent duplicate actions
        val actionKey = "${intent.action}:$phoneNumber:$notificationId"
        val now = System.currentTimeMillis()
        
        synchronized(processedActions) {
            val lastProcessed = processedActions[actionKey]
            if (lastProcessed != null && (now - lastProcessed) < ACTION_TIMEOUT_MS) {
                Log.d(TAG, "Ignoring duplicate action: $actionKey")
                return
            }
            processedActions[actionKey] = now
        }
        
        // Clean up old processed actions
        cleanupProcessedActions()
        
        // Dismiss the notification
        dismissNotification(context, notificationId)
        
        // Handle the action
        when (intent.action) {
            ACTION_APPROVE_30M -> handleApproveAction(
                context, phoneNumber, VPassEntry.Duration.HOURS_24, callerName, "30m"
            )
            ACTION_APPROVE_24H -> handleApproveAction(
                context, phoneNumber, VPassEntry.Duration.HOURS_24, callerName, "24h"
            )
            ACTION_APPROVE_30D -> handleApproveAction(
                context, phoneNumber, VPassEntry.Duration.DAYS_30, callerName, "30d"
            )
            ACTION_BLOCK -> handleBlockAction(context, phoneNumber, callerName)
            else -> Log.w(TAG, "Unknown action: ${intent.action}")
        }
    }
    
    /**
     * Handle approve action (30m, 24h, or 30d)
     */
    private fun handleApproveAction(
        context: Context,
        phoneNumber: String,
        duration: VPassEntry.Duration,
        callerName: String?,
        scope: String
    ) {
        Log.d(TAG, "Handling approve action: $phoneNumber for $scope")
        
        // Use application scope for coroutines
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val repository = ContactRepository.getInstance(context)
                val backendClient = BackendClient.getInstance(context)
                
                val displayName = callerName ?: "Unknown Caller"
                val normalizedNumber = PhoneNumberUtils.normalize(phoneNumber)
                
                // Try to grant via backend first
                val grantResult = backendClient.grantPass(
                    phoneNumber = normalizedNumber,
                    scope = scope,
                    name = displayName,
                    reason = "Missed call approval"
                )
                
                when (grantResult) {
                    is BackendClient.GrantPassResult.Success -> {
                        Log.d(TAG, "Backend pass granted: ${grantResult.passId}")
                        
                        // Also save locally for fast access
                        val expiresAt = calculateExpiryDate(duration)
                        val vPassEntry = VPassEntry(
                            phoneNumber = normalizedNumber,
                            name = displayName,
                            duration = duration,
                            createdAt = Date(),
                            expiresAt = expiresAt
                        )
                        
                        repository.insertVPass(vPassEntry)
                        
                        showToast(context, "✓ vPass granted for ${duration.toDisplayString()}")
                    }
                    
                    is BackendClient.GrantPassResult.Error -> {
                        Log.e(TAG, "Backend grant failed: ${grantResult.message}")
                        
                        // Fall back to local-only
                        val expiresAt = calculateExpiryDate(duration)
                        val vPassEntry = VPassEntry(
                            phoneNumber = normalizedNumber,
                            name = displayName,
                            duration = duration,
                            createdAt = Date(),
                            expiresAt = expiresAt
                        )
                        
                        repository.insertVPass(vPassEntry)
                        
                        showToast(context, "✓ vPass granted locally for ${duration.toDisplayString()}")
                    }
                    
                    is BackendClient.GrantPassResult.RateLimited -> {
                        Log.w(TAG, "Backend rate limited, falling back to local")
                        
                        // Fall back to local-only
                        val expiresAt = calculateExpiryDate(duration)
                        val vPassEntry = VPassEntry(
                            phoneNumber = normalizedNumber,
                            name = displayName,
                            duration = duration,
                            createdAt = Date(),
                            expiresAt = expiresAt
                        )
                        
                        repository.insertVPass(vPassEntry)
                        
                        showToast(context, "✓ vPass granted locally for ${duration.toDisplayString()}")
                    }
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error handling approve action", e)
                showToast(context, "✗ Error granting vPass: ${e.message}")
            }
        }
    }
    
    /**
     * Handle block action
     */
    private fun handleBlockAction(context: Context, phoneNumber: String, callerName: String?) {
        Log.d(TAG, "Handling block action: $phoneNumber")
        
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val repository = ContactRepository.getInstance(context)
                val normalizedNumber = PhoneNumberUtils.normalize(phoneNumber)
                
                // Add to local block list (this would integrate with system call blocking)
                repository.addBlockedNumber(normalizedNumber)
                
                val displayName = callerName ?: PhoneNumberUtils.format(phoneNumber)
                showToast(context, "✓ Blocked $displayName")
                
            } catch (e: Exception) {
                Log.e(TAG, "Error handling block action", e)
                showToast(context, "✗ Error blocking caller: ${e.message}")
            }
        }
    }
    
    /**
     * Dismiss the notification after action
     */
    private fun dismissNotification(context: Context, notificationId: Int) {
        try {
            val notificationManager = ContextCompat.getSystemService(
                context, 
                NotificationManager::class.java
            )
            notificationManager?.cancel(notificationId)
            Log.d(TAG, "Dismissed notification $notificationId")
        } catch (e: Exception) {
            Log.e(TAG, "Error dismissing notification", e)
        }
    }
    
    /**
     * Show toast feedback to user
     */
    private fun showToast(context: Context, message: String) {
        try {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Log.e(TAG, "Error showing toast", e)
        }
    }
    
    /**
     * Calculate expiry date for vPass duration
     */
    private fun calculateExpiryDate(duration: VPassEntry.Duration): Date {
        val now = System.currentTimeMillis()
        return when (duration) {
            VPassEntry.Duration.HOURS_24 -> Date(now + 24 * 60 * 60 * 1000)
            VPassEntry.Duration.DAYS_30 -> Date(now + 30 * 24 * 60 * 60 * 1000)
        }
    }
    
    /**
     * Clean up old processed actions to prevent memory leaks
     */
    private fun cleanupProcessedActions() {
        val cutoff = System.currentTimeMillis() - ACTION_TIMEOUT_MS * 2
        synchronized(processedActions) {
            processedActions.entries.removeAll { it.value < cutoff }
        }
    }
}