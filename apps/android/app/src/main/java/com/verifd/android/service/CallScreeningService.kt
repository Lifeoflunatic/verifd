package com.verifd.android.service

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.app.ActivityCompat
import com.verifd.android.data.ContactRepository
import com.verifd.android.ui.PostCallActivity
import com.verifd.android.util.PhoneNumberUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * CallScreeningService implementation that labels unknown calls and triggers
 * post-call actions for verifd identity verification workflow.
 * 
 * ROLE REQUIREMENTS:
 * - Android 10+: Requires ROLE_CALL_SCREENING for optimal functionality
 * - Pre-Android 10: Uses permission-based call screening  
 * - Graceful degradation: Basic functionality preserved without role
 * 
 * STORE COMPLIANCE: No dangerous call log permissions needed - uses CallScreeningService API
 */
class CallScreeningService : CallScreeningService() {
    
    companion object {
        private const val TAG = "CallScreeningService"
        private const val UNKNOWN_CALLER_LABEL = "Unknown Caller"
        
        /**
         * Check if the app has call screening role (Android 10+) or permissions (pre-Android 10).
         * 
         * @param context Application context
         * @return true if call screening is available, false otherwise
         */
        fun hasCallScreeningRole(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+: Check RoleManager for ROLE_CALL_SCREENING
                val roleManager = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager
                val hasRole = roleManager?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) == true
                Log.d(TAG, "Call screening role status: $hasRole")
                hasRole
            } else {
                // Pre-Android 10: Call screening works with ANSWER_PHONE_CALLS permission
                val hasPermission = ActivityCompat.checkSelfPermission(
                    context, 
                    android.Manifest.permission.ANSWER_PHONE_CALLS
                ) == PackageManager.PERMISSION_GRANTED
                Log.d(TAG, "Call screening permission status: $hasPermission")
                hasPermission
            }
        }
        
        /**
         * Create intent to request call screening role from user (Android 10+).
         * This should be launched with startActivityForResult() to handle user response.
         * 
         * @param context Application context
         * @return Intent for role request, or null if not applicable for this Android version
         */
        @RequiresApi(Build.VERSION_CODES.Q)
        fun createCallScreeningRoleIntent(context: Context): Intent? {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    val roleManager = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager
                    val intent = roleManager?.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
                    Log.d(TAG, "Created call screening role request intent: ${intent != null}")
                    intent
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to create role request intent", e)
                    null
                }
            } else {
                Log.d(TAG, "Role request not needed for Android version < 10")
                null
            }
        }
        
        /**
         * Check if call screening role can be requested (not already held and system supports it).
         * 
         * @param context Application context
         * @return true if role request makes sense, false otherwise
         */
        fun shouldRequestCallScreeningRole(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                !hasCallScreeningRole(context) // Only request if we don't already have it
            } else {
                false // Not applicable for pre-Android 10
            }
        }
    }
    
    private val serviceScope = CoroutineScope(Dispatchers.Main)
    
    override fun onScreenCall(callDetails: Call.Details) {
        Log.d(TAG, "Screening call from: ${callDetails.handle}")
        
        // GRACEFUL DEGRADATION: Check if we have proper call screening role
        if (!hasCallScreeningRole(this)) {
            Log.w(TAG, "Call screening role not granted - limited functionality available")
            // Continue processing but with reduced capabilities
            // Note: Without role, caller ID labeling may not work optimally on Android 10+
        }
        
        val phoneNumber = callDetails.handle?.schemeSpecificPart
        if (phoneNumber.isNullOrEmpty()) {
            Log.w(TAG, "No phone number available for screening")
            // Return default response that allows the call
            respondToCall(callDetails, CallResponse(
                shouldAllowCall = true,
                callerDisplayName = null,
                shouldShowAsSpam = false
            ))
            return
        }
        
        val normalizedNumber = PhoneNumberUtils.normalize(phoneNumber)
        Log.d(TAG, "Normalized number: $normalizedNumber")
        
        serviceScope.launch {
            val screeningResponse = processCall(normalizedNumber, callDetails)
            respondToCall(callDetails, screeningResponse)
            
            // Schedule post-call sheet if this is an unknown caller (no vPass, not in contacts)
            if (screeningResponse.callerDisplayName == UNKNOWN_CALLER_LABEL) {
                schedulePostCallSheet(normalizedNumber)
            }
        }
    }
    
    private suspend fun processCall(
        phoneNumber: String,
        callDetails: Call.Details
    ): CallResponse {
        try {
            val repository = ContactRepository.getInstance(this)
            
            // Check if caller is in vPass allowlist
            val vPassEntry = repository.getValidVPass(phoneNumber)
            if (vPassEntry != null) {
                Log.d(TAG, "Caller has valid vPass: $phoneNumber")
                return CallResponse(
                    shouldAllowCall = true,
                    callerDisplayName = vPassEntry.name,
                    shouldShowAsSpam = false
                )
            }
            
            // Check if caller is in system contacts
            val isKnownContact = repository.isKnownContact(phoneNumber)
            if (isKnownContact) {
                Log.d(TAG, "Caller is known contact: $phoneNumber")
                return CallResponse(
                    shouldAllowCall = true,
                    callerDisplayName = null, // Let system handle
                    shouldShowAsSpam = false
                )
            }
            
            // Unknown caller - label and allow (don't auto-reject)
            Log.d(TAG, "Unknown caller, will label: $phoneNumber")
            return CallResponse(
                shouldAllowCall = true,
                callerDisplayName = UNKNOWN_CALLER_LABEL,
                shouldShowAsSpam = false
            )
            
        } catch (e: Exception) {
            Log.e(TAG, "Error processing call screening", e)
            // Fail safe - allow call
            return CallResponse(
                shouldAllowCall = true,
                callerDisplayName = null,
                shouldShowAsSpam = false
            )
        }
    }
    
    private fun schedulePostCallSheet(phoneNumber: String) {
        Log.d(TAG, "Scheduling post-call sheet for: $phoneNumber")
        
        val intent = Intent(this, PostCallActivity::class.java).apply {
            putExtra(PostCallActivity.EXTRA_PHONE_NUMBER, phoneNumber)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        
        // Delay slightly to avoid interfering with ongoing call
        serviceScope.launch {
            kotlinx.coroutines.delay(2000) // 2 second delay
            try {
                startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start PostCallActivity", e)
            }
        }
    }
    
    private fun respondToCall(callDetails: Call.Details, response: CallResponse) {
        val responseBuilder = CallScreeningService.CallResponse.Builder()
            .setDisallowCall(!response.shouldAllowCall)
            .setRejectCall(!response.shouldAllowCall)
            .setSkipCallLog(false)
            .setSkipNotification(false)
            .setSilenceCall(false)
        
        // Note: CallResponse.Builder doesn't support setting custom caller display names
        // This would need to be handled through Call Directory or other means
        
        respondToCall(callDetails, responseBuilder.build())
    }

    /**
     * Data class representing the screening decision
     */
    private data class CallResponse(
        val shouldAllowCall: Boolean,
        val callerDisplayName: String?,
        val shouldShowAsSpam: Boolean
    )
}