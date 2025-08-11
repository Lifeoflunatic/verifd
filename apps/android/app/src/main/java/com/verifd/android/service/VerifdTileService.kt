package com.verifd.android.service

import android.content.ComponentName
import android.content.Context
import android.graphics.drawable.Icon
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log
import com.verifd.android.R
import com.verifd.android.config.FeatureFlags
import com.verifd.android.data.ExpectingWindowManager
import com.verifd.android.notification.ExpectingWindowNotificationManager
import com.verifd.android.worker.WindowSweeperWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Enhanced Quick Settings Tile for temporary vPass windows.
 * Supports 15-30 minute windows with persistent notifications and reboot persistence.
 */
class VerifdTileService : TileService() {
    
    companion object {
        private const val TAG = "VerifdTileService"
        
        /**
         * Request tile update from external components
         */
        fun requestTileUpdate(context: Context) {
            try {
                val componentName = ComponentName(context, VerifdTileService::class.java)
                requestListeningState(context, componentName)
                Log.d(TAG, "Requested tile update")
            } catch (e: Exception) {
                Log.e(TAG, "Error requesting tile update", e)
            }
        }
    }
    
    private val serviceScope = CoroutineScope(Dispatchers.Main)
    private var updateJob: Job? = null
    
    private lateinit var windowManager: ExpectingWindowManager
    private lateinit var notificationManager: ExpectingWindowNotificationManager
    
    override fun onCreate() {
        super.onCreate()
        windowManager = ExpectingWindowManager.getInstance(this)
        notificationManager = ExpectingWindowNotificationManager.getInstance(this)
        Log.d(TAG, "VerifdTileService created")
    }
    
    override fun onStartListening() {
        super.onStartListening()
        Log.d(TAG, "Tile started listening")
        updateTileState()
    }
    
    override fun onStopListening() {
        super.onStopListening()
        updateJob?.cancel()
        Log.d(TAG, "Tile stopped listening")
    }
    
    override fun onClick() {
        super.onClick()
        
        if (!windowManager.isFeatureEnabled()) {
            Log.w(TAG, "Feature is disabled, ignoring tile click")
            updateTileState()
            return
        }
        
        serviceScope.launch {
            try {
                val isCurrentlyActive = windowManager.isWindowActive()
                
                if (isCurrentlyActive) {
                    // Stop the current expecting window
                    stopExpectingWindow()
                } else {
                    // Start a new expecting window
                    startExpectingWindow()
                }
                
                updateTileState()
                
            } catch (e: Exception) {
                Log.e(TAG, "Error handling tile click", e)
            }
        }
    }
    
    /**
     * Start a new expecting window with user's preferred duration
     */
    private suspend fun startExpectingWindow() {
        Log.d(TAG, "Starting expecting window")
        
        try {
            val preferredDuration = windowManager.getPreferredDuration()
            val success = windowManager.startWindow(preferredDuration)
            
            if (success) {
                // Show persistent notification
                notificationManager.showExpectingNotification()
                
                // Schedule cleanup worker
                WindowSweeperWorker.scheduleCleanup(this@VerifdTileService)
                
                Log.d(TAG, "Successfully started expecting window for ${preferredDuration}m")
            } else {
                Log.e(TAG, "Failed to start expecting window")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error starting expecting window", e)
        }
    }
    
    /**
     * Stop the current expecting window
     */
    private suspend fun stopExpectingWindow() {
        Log.d(TAG, "Stopping expecting window")
        
        try {
            val success = windowManager.stopWindow()
            
            if (success) {
                // Cancel persistent notification
                notificationManager.cancelExpectingNotification()
                
                // Cancel cleanup worker
                WindowSweeperWorker.cancelCleanup(this@VerifdTileService)
                
                Log.d(TAG, "Successfully stopped expecting window")
            } else {
                Log.e(TAG, "Failed to stop expecting window")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping expecting window", e)
        }
    }
    
    /**
     * Update tile appearance and state
     */
    private fun updateTileState() {
        updateJob?.cancel()
        updateJob = serviceScope.launch {
            try {
                val tile = qsTile ?: return@launch
                
                if (!windowManager.isFeatureEnabled()) {
                    // Feature is disabled
                    tile.state = Tile.STATE_UNAVAILABLE
                    tile.label = "Expecting (Disabled)"
                    tile.contentDescription = "Expecting calls feature is disabled"
                    tile.icon = Icon.createWithResource(this@VerifdTileService, R.drawable.ic_phone_inactive)
                    
                } else if (windowManager.isWindowActive()) {
                    // Window is active
                    val remainingMinutes = windowManager.getRemainingTimeMinutes()
                    val preferredDuration = windowManager.getPreferredDuration()
                    
                    tile.state = Tile.STATE_ACTIVE
                    
                    if (remainingMinutes > 0) {
                        tile.label = "Expecting ${remainingMinutes}m"
                        tile.contentDescription = "Expecting calls for ${remainingMinutes} minutes remaining"
                    } else {
                        tile.label = "Expecting ${preferredDuration}m"
                        tile.contentDescription = "Expecting calls for ${preferredDuration} minutes"
                    }
                    
                    tile.icon = Icon.createWithResource(this@VerifdTileService, R.drawable.ic_phone_active)
                    
                } else {
                    // Window is inactive
                    val preferredDuration = windowManager.getPreferredDuration()
                    
                    tile.state = Tile.STATE_INACTIVE
                    tile.label = "Expecting ${preferredDuration}m"
                    tile.contentDescription = "Tap to expect calls for ${preferredDuration} minutes"
                    tile.icon = Icon.createWithResource(this@VerifdTileService, R.drawable.ic_phone_inactive)
                }
                
                tile.updateTile()
                
            } catch (e: Exception) {
                Log.e(TAG, "Error updating tile state", e)
            }
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        updateJob?.cancel()
        Log.d(TAG, "VerifdTileService destroyed")
    }
}