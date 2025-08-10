package com.verifd.android.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.work.*
import com.verifd.android.data.ContactRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

/**
 * Service for background cleanup of expired vPass entries
 */
class CleanupService : Service() {

    companion object {
        private const val TAG = "CleanupService"
        private const val CLEANUP_WORK_NAME = "vpass_cleanup"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "CleanupService created")
        schedulePeriodicCleanup()
    }

    private fun schedulePeriodicCleanup() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.UNMETERED) // Only on WiFi
            .setRequiresBatteryNotLow(true)
            .build()

        val cleanupRequest = PeriodicWorkRequestBuilder<CleanupWorker>(
            repeatInterval = 6, // Every 6 hours
            repeatIntervalTimeUnit = TimeUnit.HOURS,
            flexTimeInterval = 1, // 1 hour flex window
            flexTimeIntervalUnit = TimeUnit.HOURS
        )
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            CLEANUP_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            cleanupRequest
        )

        Log.d(TAG, "Periodic cleanup scheduled")
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "CleanupService destroyed")
    }
}

/**
 * Worker that performs the actual cleanup
 */
class CleanupWorker(
    context: android.content.Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "CleanupWorker"
    }

    override suspend fun doWork(): Result {
        return try {
            Log.d(TAG, "Starting cleanup work")
            
            val repository = ContactRepository.getInstance(applicationContext)
            val removedCount = repository.cleanupExpiredVPasses()
            
            Log.d(TAG, "Cleanup completed: removed $removedCount expired vPasses")
            Result.success()
            
        } catch (e: Exception) {
            Log.e(TAG, "Cleanup failed", e)
            Result.retry()
        }
    }
}