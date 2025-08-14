package com.verifd.android.worker

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.BackoffPolicy
import com.verifd.android.data.ContactRepository
import com.verifd.android.data.ExpectingWindowManager
import com.verifd.android.notification.ExpectingWindowNotificationManager
import java.util.concurrent.TimeUnit

/**
 * Background worker that cleans up expired expecting windows and vPass entries.
 * Runs periodically to ensure data consistency and clean up expired state.
 */
class WindowSweeperWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    companion object {
        private const val TAG = "WindowSweeperWorker"
        const val WORK_NAME = "window_sweeper_work"
        
        /**
         * Schedule periodic cleanup work
         */
        fun scheduleCleanup(context: Context) {
            try {
                val constraints = Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
                    .setRequiresBatteryNotLow(true)
                    .build()
                
                val cleanupRequest = OneTimeWorkRequestBuilder<WindowSweeperWorker>()
                    .setConstraints(constraints)
                    .setBackoffCriteria(
                        BackoffPolicy.EXPONENTIAL,
                        15,
                        TimeUnit.MINUTES
                    )
                    .addTag(TAG)
                    .build()
                
                WorkManager.getInstance(context)
                    .enqueueUniqueWork(
                        WORK_NAME,
                        androidx.work.ExistingWorkPolicy.REPLACE,
                        cleanupRequest
                    )
                
                Log.d(TAG, "Scheduled window sweeper work")
                
            } catch (e: Exception) {
                Log.e(TAG, "Error scheduling window sweeper work", e)
            }
        }
        
        /**
         * Cancel scheduled cleanup work
         */
        fun cancelCleanup(context: Context) {
            try {
                WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
                Log.d(TAG, "Cancelled window sweeper work")
            } catch (e: Exception) {
                Log.e(TAG, "Error cancelling window sweeper work", e)
            }
        }
    }
    
    override suspend fun doWork(): Result {
        Log.d(TAG, "Starting window sweeper cleanup")
        
        return try {
            val windowManager = ExpectingWindowManager.getInstance(applicationContext)
            val contactRepository = ContactRepository.getInstance(applicationContext)
            val notificationManager = ExpectingWindowNotificationManager.getInstance(applicationContext)
            
            var cleanedCount = 0
            
            // Clean up expired expecting windows
            val expiredWindows = windowManager.cleanupExpiredWindows()
            cleanedCount += expiredWindows
            
            if (expiredWindows > 0) {
                Log.d(TAG, "Cleaned up $expiredWindows expired expecting windows")
                
                // Cancel notification if window expired
                notificationManager.cancelExpectingNotification()
            }
            
            // Clean up expired vPass entries
            val expiredVPasses = contactRepository.cleanupExpiredVPasses()
            cleanedCount += expiredVPasses
            
            if (expiredVPasses > 0) {
                Log.d(TAG, "Cleaned up $expiredVPasses expired vPass entries")
            }
            
            Log.d(TAG, "Window sweeper completed. Total items cleaned: $cleanedCount")
            
            // Schedule next cleanup if there might be more work to do
            if (windowManager.isWindowActive()) {
                scheduleNextCleanup()
            }
            
            Result.success()
            
        } catch (e: Exception) {
            Log.e(TAG, "Error during window sweeper cleanup", e)
            Result.retry()
        }
    }
    
    /**
     * Schedule the next cleanup run based on active window state
     */
    private suspend fun scheduleNextCleanup() {
        try {
            val windowManager = ExpectingWindowManager.getInstance(applicationContext)
            val remainingMinutes = windowManager.getRemainingTimeMinutes()
            
            if (remainingMinutes > 0) {
                // Schedule cleanup for when the window expires, plus a small buffer
                val delayMinutes = remainingMinutes + 1
                
                val constraints = Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
                    .build()
                
                val nextCleanupRequest = OneTimeWorkRequestBuilder<WindowSweeperWorker>()
                    .setConstraints(constraints)
                    .setInitialDelay(delayMinutes.toLong(), TimeUnit.MINUTES)
                    .addTag(TAG)
                    .build()
                
                WorkManager.getInstance(applicationContext)
                    .enqueueUniqueWork(
                        WORK_NAME,
                        androidx.work.ExistingWorkPolicy.REPLACE,
                        nextCleanupRequest
                    )
                
                Log.d(TAG, "Scheduled next cleanup in $delayMinutes minutes")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error scheduling next cleanup", e)
        }
    }
}