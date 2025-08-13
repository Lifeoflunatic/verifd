package com.verifd.android.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log
import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicInteger

/**
 * Enhanced BroadcastReceiver with wake lock management for reliable background execution
 * Ensures notification actions complete even when device is in deep sleep
 */
abstract class WakefulNotificationReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "WakefulReceiver"
        private const val WAKE_LOCK_TIMEOUT = 60000L // 60 seconds max
        private const val WAKE_LOCK_PREFIX = "verifd:wake:"
        
        private val nextId = AtomicInteger(0)
        private val activeWakeLocks = mutableMapOf<Int, PowerManager.WakeLock>()
        
        /**
         * Start wakeful service with wake lock
         */
        fun startWakefulService(context: Context, intent: Intent): Int {
            val id = nextId.incrementAndGet()
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            
            val wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "$WAKE_LOCK_PREFIX$id"
            )
            
            wakeLock.setReferenceCounted(false)
            wakeLock.acquire(WAKE_LOCK_TIMEOUT)
            
            synchronized(activeWakeLocks) {
                activeWakeLocks[id] = wakeLock
            }
            
            intent.putExtra("wake_lock_id", id)
            context.startService(intent)
            
            Log.d(TAG, "Started wakeful service with lock ID: $id")
            return id
        }
        
        /**
         * Complete wakeful intent and release wake lock
         */
        fun completeWakefulIntent(intent: Intent?): Boolean {
            val id = intent?.getIntExtra("wake_lock_id", -1) ?: -1
            if (id == -1) {
                Log.w(TAG, "No wake lock ID found in intent")
                return false
            }
            
            synchronized(activeWakeLocks) {
                val wakeLock = activeWakeLocks.remove(id)
                if (wakeLock != null) {
                    if (wakeLock.isHeld) {
                        wakeLock.release()
                        Log.d(TAG, "Released wake lock ID: $id")
                    }
                    return true
                }
            }
            
            Log.w(TAG, "Wake lock not found for ID: $id")
            return false
        }
    }
    
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    override fun onReceive(context: Context, intent: Intent) {
        val pendingResult = goAsync()
        val wakeLockId = acquireWakeLock(context)
        
        scope.launch {
            try {
                withTimeout(WAKE_LOCK_TIMEOUT) {
                    handleWakefulIntent(context, intent)
                }
            } catch (e: TimeoutCancellationException) {
                Log.e(TAG, "Wakeful intent handling timed out", e)
                onTimeout(context, intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error handling wakeful intent", e)
                onError(context, intent, e)
            } finally {
                releaseWakeLock(wakeLockId)
                pendingResult.finish()
            }
        }
    }
    
    /**
     * Acquire wake lock for this operation
     */
    private fun acquireWakeLock(context: Context): Int {
        val id = nextId.incrementAndGet()
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "$WAKE_LOCK_PREFIX$id"
        )
        
        wakeLock.setReferenceCounted(false)
        wakeLock.acquire(WAKE_LOCK_TIMEOUT)
        
        synchronized(activeWakeLocks) {
            activeWakeLocks[id] = wakeLock
        }
        
        Log.d(TAG, "Acquired wake lock ID: $id")
        return id
    }
    
    /**
     * Release wake lock
     */
    private fun releaseWakeLock(id: Int) {
        synchronized(activeWakeLocks) {
            val wakeLock = activeWakeLocks.remove(id)
            if (wakeLock?.isHeld == true) {
                wakeLock.release()
                Log.d(TAG, "Released wake lock ID: $id")
            }
        }
    }
    
    /**
     * Handle the intent with wake lock protection
     * Subclasses must implement this to handle the actual work
     */
    protected abstract suspend fun handleWakefulIntent(context: Context, intent: Intent)
    
    /**
     * Called when handling times out
     * Subclasses can override to handle timeout scenarios
     */
    protected open fun onTimeout(context: Context, intent: Intent) {
        Log.w(TAG, "Wakeful intent handling timed out for action: ${intent.action}")
    }
    
    /**
     * Called when an error occurs during handling
     * Subclasses can override to handle errors
     */
    protected open fun onError(context: Context, intent: Intent, error: Exception) {
        Log.e(TAG, "Error handling wakeful intent for action: ${intent.action}", error)
    }
    
    /**
     * Clean up any remaining wake locks (call from Application.onTerminate)
     */
    fun cleanupWakeLocks() {
        synchronized(activeWakeLocks) {
            activeWakeLocks.forEach { (id, wakeLock) ->
                if (wakeLock.isHeld) {
                    wakeLock.release()
                    Log.d(TAG, "Cleaned up wake lock ID: $id")
                }
            }
            activeWakeLocks.clear()
        }
    }
}