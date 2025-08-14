package com.verifd.android.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import com.verifd.android.BuildConfig
import java.net.URLEncoder

/**
 * Utility class for sharing verification links via various apps
 */
object ShareUtils {
    
    private const val TAG = "ShareUtils"
    
    /**
     * Generate verification link using BuildConfig.VERIFY_ORIGIN
     * @param code Verification code
     * @return Full verification URL
     */
    fun generateVerificationLink(code: String): String {
        return "${BuildConfig.VERIFY_ORIGIN}/v/$code"
    }
    
    /**
     * Open WhatsApp with prefilled message containing verification link
     * Supports both WhatsApp and WhatsApp Business, with fallback to generic share
     * 
     * @param context Application context
     * @param text Message text to share
     */
    fun openWhatsApp(context: Context, text: String) {
        val encodedText = URLEncoder.encode(text, "UTF-8")
        val uri = Uri.parse("https://wa.me/?text=$encodedText")
        
        // Try WhatsApp packages in order of preference
        val whatsappPackages = listOf(
            "com.whatsapp",        // Regular WhatsApp
            "com.whatsapp.w4b"     // WhatsApp Business
        )
        
        for (pkg in whatsappPackages) {
            try {
                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                    setPackage(pkg)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                Log.d(TAG, "Opened WhatsApp with package: $pkg")
                return
            } catch (e: ActivityNotFoundException) {
                Log.d(TAG, "WhatsApp package not found: $pkg, trying next...")
            }
        }
        
        // Fallback to generic share if no WhatsApp found
        Log.w(TAG, "No WhatsApp app found, falling back to generic share")
        shareViaGeneric(context, text)
    }
    
    /**
     * Share text via generic Android share dialog
     * @param context Application context
     * @param text Text to share
     */
    fun shareViaGeneric(context: Context, text: String) {
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        
        val chooserIntent = Intent.createChooser(shareIntent, "Share verification link via")
            .apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        
        try {
            context.startActivity(chooserIntent)
            Log.d(TAG, "Launched generic share chooser")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch share chooser", e)
        }
    }
    
    /**
     * Create SMS intent with verification link
     * @param phoneNumber Target phone number
     * @param code Verification code
     * @param yourName Name to include in message
     * @return Intent for SMS with prefilled message
     */
    fun createVerificationSmsIntent(
        phoneNumber: String,
        code: String,
        yourName: String
    ): Intent {
        val link = generateVerificationLink(code)
        val message = "Hi! $yourName is trying to reach you. Please verify: $link"
        
        return SmsUtils.createSmsIntent(phoneNumber, message)
    }
    
    /**
     * Share verification link via WhatsApp
     * @param context Application context
     * @param code Verification code
     * @param yourName Name to include in message
     */
    fun shareVerificationViaWhatsApp(
        context: Context,
        code: String,
        yourName: String
    ) {
        val link = generateVerificationLink(code)
        val message = "Hi! $yourName is trying to reach you. Please verify: $link"
        openWhatsApp(context, message)
    }
    
    /**
     * Copy verification link to clipboard
     * @param context Application context
     * @param code Verification code
     * @return true if copied successfully
     */
    fun copyVerificationLink(context: Context, code: String): Boolean {
        return try {
            val link = generateVerificationLink(code)
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val clip = android.content.ClipData.newPlainText("Verification Link", link)
            clipboard.setPrimaryClip(clip)
            Log.d(TAG, "Copied verification link to clipboard")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to copy to clipboard", e)
            false
        }
    }
}