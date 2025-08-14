package com.verifd.android.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.verifd.android.data.ExpectingWindowManager
import com.verifd.android.notification.ExpectingWindowNotificationManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Broadcast receiver for handling expecting window notification actions
 */
class ExpectingWindowActionReceiver : BroadcastReceiver() {
    
    companion object {
        const val ACTION_EXTEND = "com.verifd.android.ACTION_EXTEND_EXPECTING_WINDOW"
        const val ACTION_DISMISS = "com.verifd.android.ACTION_DISMISS_EXPECTING_WINDOW"
        const val ACTION_STOP_EXPECTING = "com.verifd.android.ACTION_STOP_EXPECTING_WINDOW"
        const val EXTRA_PHONE_NUMBER = "phone_number"
        const val EXTRA_NOTIFICATION_ID = "notification_id"
        private const val TAG = "ExpectingWindowActionReceiver"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        val phoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER)
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)
        
        // ACTION_STOP_EXPECTING doesn't require phoneNumber or notificationId
        if (intent.action == ACTION_STOP_EXPECTING) {
            Log.d(TAG, "Stopping expecting window")
            CoroutineScope(Dispatchers.IO).launch {
                ExpectingWindowManager.getInstance(context).stopWindow()
                // Cancel notification
                ExpectingWindowNotificationManager.getInstance(context).cancelExpectingNotification()
            }
            return
        }
        
        // Other actions require phoneNumber and notificationId
        if (phoneNumber == null || notificationId == -1) {
            Log.e(TAG, "Missing required extras")
            return
        }
        
        when (intent.action) {
            ACTION_EXTEND -> {
                Log.d(TAG, "Extending expecting window for $phoneNumber")
                CoroutineScope(Dispatchers.IO).launch {
                    ExpectingWindowManager.getInstance(context).extendWindow(phoneNumber)
                    // Update notification
                    ExpectingWindowNotificationManager.updateNotification(context, phoneNumber)
                }
            }
            ACTION_DISMISS -> {
                Log.d(TAG, "Dismissing expecting window for $phoneNumber")
                CoroutineScope(Dispatchers.IO).launch {
                    ExpectingWindowManager.getInstance(context).removeWindow(phoneNumber)
                    // Cancel notification
                    ExpectingWindowNotificationManager.cancelNotification(context, notificationId)
                }
            }
            else -> {
                Log.w(TAG, "Unknown action: ${intent.action}")
            }
        }
    }
}