package com.verifd.android.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import androidx.core.app.ActivityCompat

/**
 * Utility class for handling dual-SIM functionality
 */
object DualSimUtils {
    
    data class SimInfo(
        val slotIndex: Int,
        val subscriptionId: Int,
        val carrierName: String,
        val displayName: String,
        val phoneNumber: String? = null,
        val isActive: Boolean = true,
        val isDefaultSms: Boolean = false,
        val isDefaultVoice: Boolean = false
    )
    
    /**
     * Check if device has dual SIM support
     */
    fun isDualSimSupported(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) {
            return false
        }
        
        val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            telephonyManager.phoneCount > 1
        } else {
            // Fallback for older devices
            try {
                val method = telephonyManager.javaClass.getMethod("getPhoneCount")
                val count = method.invoke(telephonyManager) as Int
                count > 1
            } catch (e: Exception) {
                false
            }
        }
    }
    
    /**
     * Get list of active SIM cards
     */
    fun getActiveSimCards(context: Context): List<SimInfo> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) {
            return emptyList()
        }
        
        if (ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_PHONE_STATE
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return emptyList()
        }
        
        val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
        val activeSubscriptions = subscriptionManager.activeSubscriptionInfoList ?: return emptyList()
        
        val defaultSmsId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            SubscriptionManager.getDefaultSmsSubscriptionId()
        } else {
            -1
        }
        
        val defaultVoiceId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            SubscriptionManager.getDefaultVoiceSubscriptionId()
        } else {
            -1
        }
        
        return activeSubscriptions.map { info ->
            SimInfo(
                slotIndex = info.simSlotIndex,
                subscriptionId = info.subscriptionId,
                carrierName = info.carrierName?.toString() ?: "Unknown",
                displayName = info.displayName?.toString() ?: "SIM ${info.simSlotIndex + 1}",
                phoneNumber = info.number,
                isActive = true,
                isDefaultSms = info.subscriptionId == defaultSmsId,
                isDefaultVoice = info.subscriptionId == defaultVoiceId
            )
        }
    }
    
    /**
     * Get default SMS SIM
     */
    fun getDefaultSmsSim(context: Context): SimInfo? {
        return getActiveSimCards(context).firstOrNull { it.isDefaultSms }
    }
    
    /**
     * Get SIM info for a specific slot
     */
    fun getSimForSlot(context: Context, slotIndex: Int): SimInfo? {
        return getActiveSimCards(context).firstOrNull { it.slotIndex == slotIndex }
    }
    
    /**
     * Format SIM display name for UI
     */
    fun formatSimDisplayName(simInfo: SimInfo): String {
        return buildString {
            append(simInfo.displayName)
            if (simInfo.isDefaultSms) {
                append(" (SMS)")
            }
            if (simInfo.isDefaultVoice) {
                append(" (Calls)")
            }
        }
    }
    
    /**
     * Get SIM selection prompt message
     */
    fun getSimSelectionPrompt(context: Context): String {
        val sims = getActiveSimCards(context)
        return when (sims.size) {
            0 -> "No SIM cards detected"
            1 -> "Using ${sims[0].displayName}"
            else -> "Select SIM for sending message"
        }
    }
    
    /**
     * Create SMS intent with SIM selection
     */
    fun createSmsIntentWithSim(
        phoneNumber: String,
        message: String,
        simInfo: SimInfo? = null
    ): Intent {
        val intent = Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("smsto:$phoneNumber")
            putExtra("sms_body", message)
            
            // Add subscription ID for dual-SIM support
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1 && simInfo != null) {
                putExtra("subscription_id", simInfo.subscriptionId)
                putExtra("android.telephony.extra.SUBSCRIPTION_INDEX", simInfo.subscriptionId)
            }
        }
        
        return intent
    }
}