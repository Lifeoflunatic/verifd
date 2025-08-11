package com.verifd.android.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.verifd.android.data.ExpectingWindowManager
import com.verifd.android.notification.ExpectingWindowNotificationManager
import com.verifd.android.worker.WindowSweeperWorker
import com.verifd.android.service.VerifdTileService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Handles device boot events to restore expecting window state.
 * Restores persistent notifications and schedules cleanup workers.
 */
class BootReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "BootReceiver"
    }
    
    private val bootScope = CoroutineScope(Dispatchers.Main)
    
    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) {
            Log.w(TAG, "Received null context or intent")
            return
        }
        
        val action = intent.action
        Log.d(TAG, "Received boot action: $action")
        
        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_PACKAGE_REPLACED -> {
                if (action == Intent.ACTION_PACKAGE_REPLACED) {
                    // Only handle our own package replacement
                    val packageName = intent.dataString
                    if (packageName != "package:${context.packageName}") {
                        return
                    }
                }
                handleBootCompleted(context)
            }
            else -> Log.w(TAG, "Unknown boot action: $action")
        }
    }
    
    /**
     * Handle boot completed event
     */
    private fun handleBootCompleted(context: Context) {
        Log.d(TAG, "Handling boot completed")
        
        bootScope.launch {
            try {
                val windowManager = ExpectingWindowManager.getInstance(context)
                val notificationManager = ExpectingWindowNotificationManager.getInstance(context)
                
                // Restore expecting window state
                val stateRestored = windowManager.restoreStateAfterReboot()
                
                if (stateRestored) {
                    Log.d(TAG, "Expecting window state restored after boot")
                    
                    // Show notification if window is still active
                    if (windowManager.isWindowActive()) {
                        notificationManager.showExpectingNotification()
                        Log.d(TAG, "Restored expecting window notification after boot")
                        
                        // Schedule cleanup worker for when window expires
                        WindowSweeperWorker.scheduleCleanup(context)
                        Log.d(TAG, "Scheduled window sweeper after boot")
                    }
                    
                    // Update tile service state
                    VerifdTileService.requestTileUpdate(context)
                    
                } else {
                    Log.d(TAG, "No active expecting window to restore after boot")
                }
                
                // Always schedule periodic cleanup worker
                WindowSweeperWorker.scheduleCleanup(context)
                
            } catch (e: Exception) {
                Log.e(TAG, "Error handling boot completed", e)
            }
        }
    }
}