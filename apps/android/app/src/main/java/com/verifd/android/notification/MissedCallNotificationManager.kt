package com.verifd.android.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.verifd.android.R
import com.verifd.android.util.PhoneNumberUtils
import java.net.URLEncoder
import kotlin.random.Random

/**
 * Manages missed call notifications with post-call actions
 * Supports SMS, WhatsApp, and Copy link actions
 */
class MissedCallNotificationManager(private val context: Context) {
    
    companion object {
        const val CHANNEL_ID = "verifd_actions"
        const val CHANNEL_NAME = "Missed Call Actions"
        const val NOTIFICATION_ID = 1001
        
        // Action types for telemetry
        const val ACTION_SMS = "sms"
        const val ACTION_WHATSAPP = "wa"
        const val ACTION_COPY = "copy"
        
        // Intent actions
        const val ACTION_SEND_SMS = "com.verifd.android.ACTION_SEND_SMS"
        const val ACTION_SEND_WHATSAPP = "com.verifd.android.ACTION_SEND_WHATSAPP"
        const val ACTION_COPY_LINK = "com.verifd.android.ACTION_COPY_LINK"
    }
    
    init {
        createNotificationChannel()
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for missed call actions"
                enableLights(true)
                enableVibration(true)
            }
            
            val notificationManager = context.getSystemService(NotificationManager::class.java)
            notificationManager?.createNotificationChannel(channel)
        }
    }
    
    /**
     * Show missed call notification with action buttons
     */
    fun showMissedCallNotification(
        phoneNumber: String,
        verifyLink: String,
        smsTemplate: String,
        whatsAppTemplate: String
    ) {
        val e164Number = PhoneNumberUtils.toE164(phoneNumber, null) ?: phoneNumber
        val timestamp = System.currentTimeMillis()
        
        // Create unique request codes for each action
        val smsRequestCode = generateRequestCode(e164Number, ACTION_SMS, timestamp)
        val whatsAppRequestCode = generateRequestCode(e164Number, ACTION_WHATSAPP, timestamp)
        val copyRequestCode = generateRequestCode(e164Number, ACTION_COPY, timestamp)
        
        // Build notification with actions
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Missed Call")
            .setContentText("From: Unknown Caller • Send verification link")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .addAction(
                R.drawable.ic_sms,
                "SMS",
                createSmsAction(e164Number, smsTemplate, smsRequestCode)
            )
            .addAction(
                R.drawable.ic_whatsapp,
                "WhatsApp",
                createWhatsAppAction(e164Number, whatsAppTemplate, whatsAppRequestCode)
            )
            .addAction(
                R.drawable.ic_copy,
                "Copy Link",
                createCopyAction(verifyLink, copyRequestCode)
            )
            .build()
        
        // Show notification
        if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        }
    }
    
    /**
     * Create SMS action PendingIntent
     */
    private fun createSmsAction(
        phoneNumber: String,
        smsBody: String,
        requestCode: Int
    ): PendingIntent {
        val intent = Intent(ACTION_SEND_SMS).apply {
            setClass(context, NotifActionReceiver::class.java)
            putExtra("phone_number", phoneNumber)
            putExtra("sms_body", smsBody)
            putExtra("action_type", ACTION_SMS)
        }
        
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
    }
    
    /**
     * Create WhatsApp action PendingIntent
     */
    private fun createWhatsAppAction(
        phoneNumber: String,
        message: String,
        requestCode: Int
    ): PendingIntent {
        val intent = Intent(ACTION_SEND_WHATSAPP).apply {
            setClass(context, NotifActionReceiver::class.java)
            putExtra("phone_number", phoneNumber)
            putExtra("message", message)
            putExtra("action_type", ACTION_WHATSAPP)
        }
        
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
    }
    
    /**
     * Create Copy Link action PendingIntent
     */
    private fun createCopyAction(
        link: String,
        requestCode: Int
    ): PendingIntent {
        val intent = Intent(ACTION_COPY_LINK).apply {
            setClass(context, NotifActionReceiver::class.java)
            putExtra("link", link)
            putExtra("action_type", ACTION_COPY)
        }
        
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
    }
    
    /**
     * Generate unique request code for PendingIntent
     */
    private fun generateRequestCode(
        phoneNumber: String,
        action: String,
        timestamp: Long
    ): Int {
        val combined = "$phoneNumber$action$timestamp"
        return combined.hashCode() and 0x7FFFFFFF // Ensure positive
    }
    
    /**
     * Handle SMS action - opens SMS composer
     */
    fun handleSmsAction(phoneNumber: String, smsBody: String) {
        val smsUri = Uri.parse("smsto:$phoneNumber")
        val smsIntent = Intent(Intent.ACTION_SENDTO, smsUri).apply {
            putExtra("sms_body", smsBody)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
            
            // Dual-SIM support
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                // Try to set default SIM if available
                putExtra("com.android.phone.force.slot", true)
                putExtra("subscription", 0) // Default to first SIM
            }
        }
        
        try {
            context.startActivity(smsIntent)
        } catch (e: Exception) {
            // Handle case where no SMS app is available
            showToast("No SMS app available")
        }
    }
    
    /**
     * Handle WhatsApp action - opens WhatsApp with pre-filled message
     */
    fun handleWhatsAppAction(phoneNumber: String, message: String) {
        // Remove '+' from E164 for WhatsApp
        val whatsAppNumber = phoneNumber.removePrefix("+")
        val encodedMessage = URLEncoder.encode(message, "UTF-8")
        val whatsAppUri = Uri.parse("https://wa.me/$whatsAppNumber?text=$encodedMessage")
        
        val whatsAppIntent = Intent(Intent.ACTION_VIEW, whatsAppUri).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        
        // Check if WhatsApp is installed
        if (isWhatsAppInstalled()) {
            whatsAppIntent.setPackage("com.whatsapp")
        }
        
        try {
            context.startActivity(whatsAppIntent)
        } catch (e: Exception) {
            // Fallback to browser or chooser
            try {
                val chooserIntent = Intent.createChooser(whatsAppIntent, "Send via")
                chooserIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                context.startActivity(chooserIntent)
                showToast("Choose WhatsApp to send message")
            } catch (e2: Exception) {
                showToast("WhatsApp not available")
            }
        }
    }
    
    /**
     * Handle Copy Link action - copies link to clipboard
     */
    fun handleCopyAction(link: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("Verification Link", link)
        clipboard.setPrimaryClip(clip)
        showToast("Link copied to clipboard")
    }
    
    /**
     * Check if WhatsApp is installed
     */
    private fun isWhatsAppInstalled(): Boolean {
        return try {
            context.packageManager.getPackageInfo("com.whatsapp", PackageManager.GET_ACTIVITIES)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }
    
    /**
     * Show toast message
     */
    private fun showToast(message: String) {
        android.widget.Toast.makeText(context, message, android.widget.Toast.LENGTH_SHORT).show()
    }
}