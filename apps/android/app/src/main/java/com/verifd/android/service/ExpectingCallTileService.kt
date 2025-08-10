package com.verifd.android.service

import android.graphics.drawable.Icon
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log
import androidx.lifecycle.LifecycleCoroutineScope
import com.verifd.android.R
import com.verifd.android.data.ContactRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Quick Settings Tile for "Expecting a Call (30m)" feature.
 * When active, temporarily allows unknown calls for 30 minutes.
 */
class ExpectingCallTileService : TileService() {
    
    companion object {
        private const val TAG = "ExpectingCallTile"
        private const val EXPECTING_DURATION_MS = 30 * 60 * 1000L // 30 minutes
    }
    
    private val serviceScope = CoroutineScope(Dispatchers.Main)
    private var expectingJob: Job? = null
    private lateinit var repository: ContactRepository
    
    override fun onCreate() {
        super.onCreate()
        repository = ContactRepository.getInstance(this)
        Log.d(TAG, "ExpectingCallTileService created")
    }
    
    override fun onStartListening() {
        super.onStartListening()
        updateTileState()
    }
    
    override fun onClick() {
        super.onClick()
        
        serviceScope.launch {
            try {
                val isCurrentlyExpecting = repository.isExpectingCall()
                
                if (isCurrentlyExpecting) {
                    // Turn off expecting mode
                    stopExpectingCall()
                } else {
                    // Turn on expecting mode for 30 minutes
                    startExpectingCall()
                }
                
                updateTileState()
                
            } catch (e: Exception) {
                Log.e(TAG, "Error handling tile click", e)
            }
        }
    }
    
    private suspend fun startExpectingCall() {
        Log.d(TAG, "Starting expecting call mode for 30 minutes")
        
        // Cancel any existing job
        expectingJob?.cancel()
        
        // Set expecting state
        repository.setExpectingCall(true)
        
        // Schedule automatic turn-off after 30 minutes
        expectingJob = serviceScope.launch {
            try {
                kotlinx.coroutines.delay(EXPECTING_DURATION_MS)
                stopExpectingCall()
                updateTileState()
                Log.d(TAG, "Expecting call mode automatically expired")
            } catch (e: Exception) {
                Log.e(TAG, "Error in expecting call timer", e)
            }
        }
    }
    
    private suspend fun stopExpectingCall() {
        Log.d(TAG, "Stopping expecting call mode")
        
        expectingJob?.cancel()
        expectingJob = null
        
        repository.setExpectingCall(false)
    }
    
    private fun updateTileState() {
        serviceScope.launch {
            try {
                val isExpecting = repository.isExpectingCall()
                
                val tile = qsTile ?: return@launch
                
                if (isExpecting) {
                    tile.state = Tile.STATE_ACTIVE
                    tile.label = "Expecting Call (ON)"
                    tile.contentDescription = "Expecting call mode is active for 30 minutes"
                    tile.icon = Icon.createWithResource(this@ExpectingCallTileService, R.drawable.ic_phone_active)
                } else {
                    tile.state = Tile.STATE_INACTIVE
                    tile.label = "Expecting Call"
                    tile.contentDescription = "Tap to expect a call for 30 minutes"
                    tile.icon = Icon.createWithResource(this@ExpectingCallTileService, R.drawable.ic_phone_inactive)
                }
                
                tile.updateTile()
                
            } catch (e: Exception) {
                Log.e(TAG, "Error updating tile state", e)
            }
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        expectingJob?.cancel()
        Log.d(TAG, "ExpectingCallTileService destroyed")
    }
}