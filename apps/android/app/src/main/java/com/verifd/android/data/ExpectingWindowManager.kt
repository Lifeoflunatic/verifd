package com.verifd.android.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.verifd.android.config.FeatureFlags
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Date
import java.util.concurrent.TimeUnit

/**
 * Manages temporary expecting windows for Quick Settings tile.
 * Handles window state, timing, and persistence across reboots.
 */
class ExpectingWindowManager private constructor(
    private val context: Context,
    private val prefs: SharedPreferences
) {
    
    companion object {
        private const val TAG = "ExpectingWindowManager"
        private const val PREFS_NAME = "verifd_expecting_window"
        
        // SharedPreferences keys
        private const val KEY_WINDOW_ACTIVE = "window_active"
        private const val KEY_WINDOW_START_TIME = "window_start_time"
        private const val KEY_WINDOW_END_TIME = "window_end_time"
        private const val KEY_WINDOW_DURATION_PREFERENCE = "window_duration_preference"
        
        // Default durations in minutes
        const val DURATION_15_MINUTES = 15
        const val DURATION_30_MINUTES = 30
        
        @Volatile
        private var INSTANCE: ExpectingWindowManager? = null
        
        fun getInstance(context: Context): ExpectingWindowManager {
            return INSTANCE ?: synchronized(this) {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                ExpectingWindowManager(
                    context.applicationContext,
                    prefs
                ).also { INSTANCE = it }
            }
        }
    }
    
    /**
     * Check if the expecting window feature is enabled
     */
    fun isFeatureEnabled(): Boolean {
        return FeatureFlags.isQuickTileExpectingEnabled
    }
    
    /**
     * Start a new expecting window with specified duration
     */
    suspend fun startWindow(durationMinutes: Int = getPreferredDuration()): Boolean {
        return withContext(Dispatchers.IO) {
            if (!isFeatureEnabled()) {
                Log.w(TAG, "Expecting window feature is disabled")
                return@withContext false
            }
            
            try {
                val now = System.currentTimeMillis()
                val endTime = now + TimeUnit.MINUTES.toMillis(durationMinutes.toLong())
                
                prefs.edit()
                    .putBoolean(KEY_WINDOW_ACTIVE, true)
                    .putLong(KEY_WINDOW_START_TIME, now)
                    .putLong(KEY_WINDOW_END_TIME, endTime)
                    .apply()
                
                Log.d(TAG, "Started expecting window for $durationMinutes minutes")
                Log.d(TAG, "Window start: ${Date(now)}")
                Log.d(TAG, "Window end: ${Date(endTime)}")
                
                true
                
            } catch (e: Exception) {
                Log.e(TAG, "Error starting expecting window", e)
                false
            }
        }
    }
    
    /**
     * Stop the current expecting window
     */
    suspend fun stopWindow(): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                prefs.edit()
                    .putBoolean(KEY_WINDOW_ACTIVE, false)
                    .remove(KEY_WINDOW_START_TIME)
                    .remove(KEY_WINDOW_END_TIME)
                    .apply()
                
                Log.d(TAG, "Stopped expecting window")
                true
                
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping expecting window", e)
                false
            }
        }
    }
    
    /**
     * Check if there's currently an active expecting window
     */
    suspend fun isWindowActive(): Boolean {
        return withContext(Dispatchers.IO) {
            if (!isFeatureEnabled()) {
                return@withContext false
            }
            
            try {
                val isActive = prefs.getBoolean(KEY_WINDOW_ACTIVE, false)
                
                if (!isActive) {
                    return@withContext false
                }
                
                // Check if window has expired
                val endTime = prefs.getLong(KEY_WINDOW_END_TIME, 0L)
                val currentTime = System.currentTimeMillis()
                
                if (endTime == 0L || currentTime > endTime) {
                    // Window has expired, clean up
                    stopWindow()
                    Log.d(TAG, "Expecting window expired and was cleaned up")
                    return@withContext false
                }
                
                return@withContext true
                
            } catch (e: Exception) {
                Log.e(TAG, "Error checking window state", e)
                false
            }
        }
    }
    
    /**
     * Get remaining time in the current window in minutes
     */
    suspend fun getRemainingTimeMinutes(): Int {
        return withContext(Dispatchers.IO) {
            if (!isWindowActive()) {
                return@withContext 0
            }
            
            try {
                val endTime = prefs.getLong(KEY_WINDOW_END_TIME, 0L)
                val currentTime = System.currentTimeMillis()
                val remainingMs = endTime - currentTime
                
                if (remainingMs <= 0) {
                    return@withContext 0
                }
                
                val remainingMinutes = TimeUnit.MILLISECONDS.toMinutes(remainingMs).toInt()
                return@withContext maxOf(1, remainingMinutes) // Always show at least 1 minute
                
            } catch (e: Exception) {
                Log.e(TAG, "Error calculating remaining time", e)
                0
            }
        }
    }
    
    /**
     * Get the window start time
     */
    suspend fun getWindowStartTime(): Date? {
        return withContext(Dispatchers.IO) {
            try {
                val startTime = prefs.getLong(KEY_WINDOW_START_TIME, 0L)
                if (startTime == 0L) null else Date(startTime)
            } catch (e: Exception) {
                Log.e(TAG, "Error getting window start time", e)
                null
            }
        }
    }
    
    /**
     * Get the window end time
     */
    suspend fun getWindowEndTime(): Date? {
        return withContext(Dispatchers.IO) {
            try {
                val endTime = prefs.getLong(KEY_WINDOW_END_TIME, 0L)
                if (endTime == 0L) null else Date(endTime)
            } catch (e: Exception) {
                Log.e(TAG, "Error getting window end time", e)
                null
            }
        }
    }
    
    /**
     * Set user's preferred window duration
     */
    fun setPreferredDuration(minutes: Int) {
        if (minutes != DURATION_15_MINUTES && minutes != DURATION_30_MINUTES) {
            Log.w(TAG, "Invalid duration preference: $minutes minutes. Using default.")
            return
        }
        
        prefs.edit()
            .putInt(KEY_WINDOW_DURATION_PREFERENCE, minutes)
            .apply()
        
        Log.d(TAG, "Set preferred duration to $minutes minutes")
    }
    
    /**
     * Get user's preferred window duration
     */
    fun getPreferredDuration(): Int {
        return prefs.getInt(KEY_WINDOW_DURATION_PREFERENCE, DURATION_30_MINUTES)
    }
    
    /**
     * Clean up expired windows (called by sweeper)
     */
    suspend fun extendWindow(phoneNumber: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val currentEnd = getWindowEndTime()
                if (currentEnd != null) {
                    val newEnd = Date(currentEnd.time + TimeUnit.MINUTES.toMillis(getPreferredDuration().toLong()))
                    prefs.edit()
                        .putLong(KEY_WINDOW_END_TIME, newEnd.time)
                        .apply()
                    Log.d(TAG, "Extended window for $phoneNumber until $newEnd")
                    true
                } else {
                    Log.w(TAG, "No active window to extend")
                    false
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error extending window", e)
                false
            }
        }
    }
    
    suspend fun removeWindow(phoneNumber: String): Boolean {
        return stopWindow()
    }
    
    suspend fun cleanupExpiredWindows(): Int {
        return withContext(Dispatchers.IO) {
            try {
                if (!isWindowActive()) {
                    // Already cleaned up or no active window
                    return@withContext 0
                }
                
                val endTime = prefs.getLong(KEY_WINDOW_END_TIME, 0L)
                val currentTime = System.currentTimeMillis()
                
                if (endTime != 0L && currentTime > endTime) {
                    stopWindow()
                    Log.d(TAG, "Cleaned up expired expecting window")
                    return@withContext 1
                }
                
                return@withContext 0
                
            } catch (e: Exception) {
                Log.e(TAG, "Error cleaning up expired windows", e)
                0
            }
        }
    }
    
    /**
     * Restore state after device reboot
     */
    suspend fun restoreStateAfterReboot(): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                if (!isFeatureEnabled()) {
                    return@withContext false
                }
                
                val wasActive = prefs.getBoolean(KEY_WINDOW_ACTIVE, false)
                if (!wasActive) {
                    return@withContext false
                }
                
                val endTime = prefs.getLong(KEY_WINDOW_END_TIME, 0L)
                val currentTime = System.currentTimeMillis()
                
                if (endTime == 0L || currentTime > endTime) {
                    // Window expired during reboot
                    stopWindow()
                    Log.d(TAG, "Expecting window expired during reboot")
                    return@withContext false
                }
                
                Log.d(TAG, "Restored expecting window state after reboot")
                Log.d(TAG, "Window will expire at: ${Date(endTime)}")
                
                return@withContext true
                
            } catch (e: Exception) {
                Log.e(TAG, "Error restoring state after reboot", e)
                false
            }
        }
    }
    
    /**
     * Get debug information about current window state
     */
    suspend fun getDebugInfo(): Map<String, Any> {
        return withContext(Dispatchers.IO) {
            mapOf(
                "feature_enabled" to isFeatureEnabled(),
                "window_active" to isWindowActive(),
                "preferred_duration" to getPreferredDuration(),
                "remaining_minutes" to getRemainingTimeMinutes(),
                "start_time" to (getWindowStartTime()?.toString() ?: "None"),
                "end_time" to (getWindowEndTime()?.toString() ?: "None")
            )
        }
    }
}