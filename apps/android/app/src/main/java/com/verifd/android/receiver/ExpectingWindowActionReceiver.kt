package com.verifd.android.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.verifd.android.data.ExpectingWindowManager
import com.verifd.android.notification.ExpectingWindowNotificationManager
import com.verifd.android.service.VerifdTileService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Handles actions from expecting window notifications.
 * Processes stop expecting and other notification actions.
 */
class ExpectingWindowActionReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "ExpectingWindowActionReceiver"
        
        // Actions
        const val ACTION_STOP_EXPECTING = "com.verifd.android.ACTION_STOP_EXPECTING"
        const val ACTION_SETTINGS = "com.verifd.android.ACTION_SETTINGS"
    }
    
    private val receiverScope = CoroutineScope(Dispatchers.Main)
    
    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) {
            Log.w(TAG, "Received null context or intent")
            return
        }
        
        val action = intent.action
        Log.d(TAG, "Received action: $action")
        
        when (action) {
            ACTION_STOP_EXPECTING -> handleStopExpecting(context)
            ACTION_SETTINGS -> handleOpenSettings(context)
            else -> Log.w(TAG, "Unknown action: $action")
        }
    }
    
    /**
     * Handle stop expecting action from notification
     */
    private fun handleStopExpecting(context: Context) {
        Log.d(TAG, "Handling stop expecting action")
        
        receiverScope.launch {
            try {
                val windowManager = ExpectingWindowManager.getInstance(context)
                val notificationManager = ExpectingWindowNotificationManager.getInstance(context)
                
                // Stop the expecting window
                val success = windowManager.stopWindow()
                
                if (success) {
                    // Cancel the notification
                    notificationManager.cancelExpectingNotification()
                    
                    // Update tile service state
                    VerifdTileService.requestTileUpdate(context)
                    
                    Log.d(TAG, "Successfully stopped expecting window from notification")
                } else {
                    Log.e(TAG, "Failed to stop expecting window")
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error handling stop expecting action", e)
            }
        }
    }
    
    /**
     * Handle open settings action from notification
     */
    private fun handleOpenSettings(context: Context) {
        Log.d(TAG, "Handling open settings action")
        
        try {
            // This would typically open the main activity with settings intent
            // For now, we'll just log it as the MainActivity integration would be needed
            Log.d(TAG, "Settings action triggered - would open MainActivity")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error handling open settings action", e)
        }
    }
}