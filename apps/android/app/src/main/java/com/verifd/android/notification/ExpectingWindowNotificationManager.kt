package com.verifd.android.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.verifd.android.R
import com.verifd.android.data.ExpectingWindowManager
import com.verifd.android.ui.MainActivity
import com.verifd.android.receiver.ExpectingWindowActionReceiver

/**
 * Manages persistent notifications for active expecting windows.
 * Shows ongoing notification with remaining time and quick actions.
 */
class ExpectingWindowNotificationManager private constructor(private val context: Context) {
    
    companion object {
        private const val TAG = "ExpectingWindowNotificationManager"
        
        // Notification channel and ID
        private const val CHANNEL_EXPECTING_WINDOW = "expecting_window"
        private const val NOTIFICATION_ID_EXPECTING = 1001
        
        @Volatile
        private var INSTANCE: ExpectingWindowNotificationManager? = null
        
        fun getInstance(context: Context): ExpectingWindowNotificationManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: ExpectingWindowNotificationManager(context.applicationContext).also { 
                    INSTANCE = it 
                }
            }
        }
        
        fun updateNotification(context: Context, phoneNumber: String) {
            // Note: phoneNumber parameter is currently unused but may be used for future features
            kotlinx.coroutines.runBlocking {
                getInstance(context).showExpectingNotification()
            }
        }
        
        fun cancelNotification(context: Context, notificationId: Int) {
            NotificationManagerCompat.from(context).cancel(notificationId)
        }
    }
    
    private val notificationManager: NotificationManagerCompat = NotificationManagerCompat.from(context)
    
    init {
        createNotificationChannels()
    }
    
    /**
     * Show persistent notification for active expecting window
     */
    suspend fun showExpectingNotification() {
        try {
            val windowManager = ExpectingWindowManager.getInstance(context)
            
            if (!windowManager.isWindowActive()) {
                Log.d(TAG, "No active window, not showing notification")
                return
            }
            
            val remainingMinutes = windowManager.getRemainingTimeMinutes()
            val preferredDuration = windowManager.getPreferredDuration()
            
            val title = "Expecting calls"
            val content = if (remainingMinutes > 0) {
                "Allow unknown calls for ${remainingMinutes}m remaining"
            } else {
                "Allowing unknown calls for ${preferredDuration}m"
            }
            
            val builder = createNotificationBuilder(title, content)
            addNotificationActions(builder)
            
            notificationManager.notify(NOTIFICATION_ID_EXPECTING, builder.build())
            Log.d(TAG, "Showing expecting window notification")
            
        } catch (e: SecurityException) {
            Log.e(TAG, "Failed to show notification - permission denied", e)
        } catch (e: Exception) {
            Log.e(TAG, "Error showing expecting notification", e)
        }
    }
    
    /**
     * Update existing notification with current remaining time
     */
    suspend fun updateExpectingNotification() {
        try {
            val windowManager = ExpectingWindowManager.getInstance(context)
            
            if (!windowManager.isWindowActive()) {
                cancelExpectingNotification()
                return
            }
            
            showExpectingNotification()
            
        } catch (e: Exception) {
            Log.e(TAG, "Error updating expecting notification", e)
        }
    }
    
    /**
     * Cancel the expecting window notification
     */
    fun cancelExpectingNotification() {
        try {
            notificationManager.cancel(NOTIFICATION_ID_EXPECTING)
            Log.d(TAG, "Cancelled expecting window notification")
        } catch (e: Exception) {
            Log.e(TAG, "Error cancelling expecting notification", e)
        }
    }
    
    /**
     * Create the base notification builder
     */
    private fun createNotificationBuilder(
        title: String,
        content: String
    ): NotificationCompat.Builder {
        // Create intent to open main activity when notification is tapped
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        
        val pendingIntent = createPendingIntent(intent, 0)
        
        return NotificationCompat.Builder(context, CHANNEL_EXPECTING_WINDOW)
            .setSmallIcon(R.drawable.ic_phone_in_talk)
            .setContentTitle(title)
            .setContentText(content)
            .setContentIntent(pendingIntent)
            .setOngoing(true) // Make it persistent
            .setAutoCancel(false) // Don't auto-cancel when tapped
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setShowWhen(true)
            .setDefaults(0) // No sound/vibration for ongoing notification
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
    }
    
    /**
     * Add action buttons to notification
     */
    private fun addNotificationActions(builder: NotificationCompat.Builder) {
        try {
            // Stop action - stops the expecting window
            val stopIntent = createStopIntent()
            val stopPendingIntent = createPendingIntent(stopIntent, 1)
            
            builder.addAction(
                R.drawable.ic_close,
                "Stop",
                stopPendingIntent
            )
            
            // Settings action - opens main activity
            val settingsIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("open_settings", true)
            }
            val settingsPendingIntent = createPendingIntent(settingsIntent, 2)
            
            builder.addAction(
                R.drawable.ic_settings,
                "Settings", 
                settingsPendingIntent
            )
            
        } catch (e: Exception) {
            Log.e(TAG, "Error adding notification actions", e)
        }
    }
    
    /**
     * Create intent to stop expecting window
     */
    private fun createStopIntent(): Intent {
        return Intent(context, ExpectingWindowActionReceiver::class.java).apply {
            action = ExpectingWindowActionReceiver.ACTION_STOP_EXPECTING
        }
    }
    
    /**
     * Create PendingIntent with proper flags
     */
    private fun createPendingIntent(intent: Intent, requestCode: Int): PendingIntent {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        
        return if (intent.component?.className == ExpectingWindowActionReceiver::class.java.name) {
            PendingIntent.getBroadcast(context, requestCode, intent, flags)
        } else {
            PendingIntent.getActivity(context, requestCode, intent, flags)
        }
    }
    
    /**
     * Create notification channels for expecting window notifications
     */
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_EXPECTING_WINDOW,
                "Expecting Window",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Persistent notifications for active expecting windows"
                enableVibration(false)
                enableLights(false)
                setSound(null, null) // No sound for ongoing notifications
                setShowBadge(false)
            }
            
            val systemNotificationManager = ContextCompat.getSystemService(
                context,
                NotificationManager::class.java
            )
            
            systemNotificationManager?.createNotificationChannel(channel)
            Log.d(TAG, "Created expecting window notification channel")
        }
    }
    
    /**
     * Check if notification permission is granted
     */
    fun hasNotificationPermission(): Boolean {
        return notificationManager.areNotificationsEnabled()
    }
    
    /**
     * Get notification channel importance (for debugging)
     */
    fun getChannelImportance(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val systemNotificationManager = ContextCompat.getSystemService(
                context,
                NotificationManager::class.java
            )
            val channel = systemNotificationManager?.getNotificationChannel(CHANNEL_EXPECTING_WINDOW)
            channel?.importance ?: NotificationManager.IMPORTANCE_NONE
        } else {
            NotificationManager.IMPORTANCE_DEFAULT
        }
    }
}