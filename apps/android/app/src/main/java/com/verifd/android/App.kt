package com.verifd.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Main Application class for verifd Android app.
 * Handles app-wide initialization including notification channels.
 */
class App : Application() {
    
    companion object {
        private const val TAG = "VerifdApp"
        
        // Notification channel IDs
        const val CHANNEL_VERIFD_ACTIONS = "verifd_actions"
        const val CHANNEL_VERIFD_PERSISTENT = "verifd_persistent"
    }
    
    override fun onCreate() {
        super.onCreate()
        
        Log.d(TAG, "Application onCreate")
        
        // Create notification channels for Android 8.0+
        createNotificationChannels()
    }
    
    /**
     * Create notification channels required for the app.
     * Channels are required on Android 8.0 (API 26) and above.
     */
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = ContextCompat.getSystemService(
                this,
                NotificationManager::class.java
            ) ?: return
            
            // Channel 1: High importance for missed call actions
            val actionsChannel = NotificationChannel(
                CHANNEL_VERIFD_ACTIONS,
                "Missed Call Actions",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for missed calls requiring action"
                enableVibration(true)
                enableLights(true)
                setShowBadge(true)
            }
            
            // Channel 2: Low importance for persistent notifications (tiles/windows)
            val persistentChannel = NotificationChannel(
                CHANNEL_VERIFD_PERSISTENT,
                "Persistent Notifications",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Ongoing notifications for expecting windows and quick tiles"
                enableVibration(false)
                enableLights(false)
                setShowBadge(false)
                // No sound for persistent notifications
                setSound(null, null)
            }
            
            // Create the channels
            notificationManager.createNotificationChannel(actionsChannel)
            notificationManager.createNotificationChannel(persistentChannel)
            
            Log.d(TAG, "Notification channels created")
        }
    }
}