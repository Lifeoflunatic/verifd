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
import com.verifd.android.config.FeatureFlags
import com.verifd.android.data.BackendClient
import com.verifd.android.data.ContactRepository
import com.verifd.android.notification.MissedCallNotificationManager
import com.verifd.android.ui.PostCallActivity
import com.verifd.android.util.PhoneNumberUtils
import com.verifd.android.util.RiskAssessment
import com.verifd.android.telemetry.PrivacyTelemetry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.Date
import com.verifd.android.data.model.VPassEntry
import kotlinx.coroutines.launch
import com.verifd.android.BuildConfig
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

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
    private val riskAssessment = RiskAssessment.getInstance()
    private lateinit var notificationManager: MissedCallNotificationManager
    private lateinit var telemetry: PrivacyTelemetry
    
    override fun onCreate() {
        super.onCreate()
        FeatureFlags.initialize(this)
        notificationManager = MissedCallNotificationManager(this)
        telemetry = PrivacyTelemetry(this)
    }
    
    override fun onScreenCall(callDetails: Call.Details) {
        Log.d(TAG, "Screening call from: ${callDetails.handle}")
        
        // Feature 4: Call screening smoke debug notification (staging only)
        if (BuildConfig.BUILD_TYPE == "staging" || BuildConfig.DEBUG) {
            showDebugNotification(callDetails)
        }
        
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
            
            // Handle missed call notifications and post-call actions
            handlePostCallActions(normalizedNumber, screeningResponse)
        }
    }
    
    private suspend fun processCall(
        phoneNumber: String,
        callDetails: Call.Details
    ): CallResponse {
        try {
            val repository = ContactRepository.getInstance(this)
            
            // Perform risk assessment early
            val riskAssessmentResult = riskAssessment.assessCall(callDetails, phoneNumber)
            Log.d(TAG, "Risk assessment: ${riskAssessmentResult.tier} (confidence: ${riskAssessmentResult.confidence})")
            
            // First check local vPass allowlist (fast path)
            val vPassEntry = repository.getValidVPass(phoneNumber)
            if (vPassEntry != null) {
                Log.d(TAG, "Caller has valid local vPass: $phoneNumber")
                return CallResponse(
                    shouldAllowCall = true,
                    callerDisplayName = vPassEntry.name,
                    shouldShowAsSpam = false,
                    riskAssessment = riskAssessmentResult
                )
            }
            
            // Check if caller is in system contacts
            val isKnownContact = repository.isKnownContact(phoneNumber)
            if (isKnownContact) {
                Log.d(TAG, "Caller is known contact: $phoneNumber")
                return CallResponse(
                    shouldAllowCall = true,
                    callerDisplayName = null, // Let system handle
                    shouldShowAsSpam = false,
                    riskAssessment = riskAssessmentResult
                )
            }
            
            // Unknown caller - check backend for pass
            Log.d(TAG, "Unknown caller, checking backend: $phoneNumber")
            val backendClient = BackendClient.getInstance(this)
            
            try {
                val passResult = backendClient.checkPass(phoneNumber)
                when (passResult) {
                    is BackendClient.PassCheckResult.Allowed -> {
                        Log.d(TAG, "Backend pass found for: $phoneNumber")
                        
                        // Cache in local store for next time
                        CoroutineScope(Dispatchers.IO).launch {
                            val expiresAt = Date(System.currentTimeMillis() + (24 * 60 * 60 * 1000)) // TODO: Parse actual expiry
                            val vPassEntry = VPassEntry(
                                phoneNumber = phoneNumber,
                                name = passResult.grantedToName,
                                duration = VPassEntry.Duration.HOURS_24,
                                createdAt = Date(),
                                expiresAt = expiresAt
                            )
                            repository.insertVPass(vPassEntry)
                        }
                        
                        return CallResponse(
                            shouldAllowCall = true,
                            callerDisplayName = passResult.grantedToName,
                            shouldShowAsSpam = false,
                            riskAssessment = riskAssessmentResult
                        )
                    }
                    is BackendClient.PassCheckResult.NotAllowed -> {
                        Log.d(TAG, "No backend pass for: $phoneNumber")
                    }
                    is BackendClient.PassCheckResult.RateLimited -> {
                        Log.w(TAG, "Backend rate limited, falling back to local")
                    }
                    is BackendClient.PassCheckResult.Error -> {
                        Log.e(TAG, "Backend error: ${passResult.message}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to check backend", e)
                // Continue with local-only decision
            }
            
            // No pass found - make decision based on risk assessment
            Log.d(TAG, "Unknown caller, will label: $phoneNumber")
            
            // Feature 5: Silence unknowns by default in staging
            val shouldSilence = FeatureFlags.isSilenceUnknownCallersEnabled
            if (shouldSilence) {
                Log.d(TAG, "Silencing unknown caller (Feature 5 staging default)")
            }
            
            // Handle high-risk calls with potential blocking
            val shouldAllowCall = when (riskAssessmentResult.tier) {
                RiskAssessment.RiskTier.CRITICAL -> {
                    Log.w(TAG, "Blocking critical risk call: $phoneNumber")
                    false
                }
                RiskAssessment.RiskTier.HIGH -> {
                    // Allow but silence high-risk calls
                    Log.w(TAG, "Allowing but silencing high-risk call: $phoneNumber")
                    true
                }
                else -> true
            }
            
            // Update risk assessment to include silencing for unknowns
            val updatedRiskAssessment = if (shouldSilence && shouldAllowCall) {
                riskAssessmentResult.copy(
                    shouldSilenceCall = true,
                    shouldSkipNotification = false // Still show notification for missed calls
                )
            } else {
                riskAssessmentResult
            }
            
            return CallResponse(
                shouldAllowCall = shouldAllowCall,
                callerDisplayName = UNKNOWN_CALLER_LABEL,
                shouldShowAsSpam = riskAssessmentResult.tier == RiskAssessment.RiskTier.CRITICAL,
                riskAssessment = updatedRiskAssessment
            )
            
        } catch (e: Exception) {
            Log.e(TAG, "Error processing call screening", e)
            // Fail safe - allow call with basic risk assessment
            val fallbackRiskAssessment = riskAssessment.assessCall(callDetails, phoneNumber)
            return CallResponse(
                shouldAllowCall = true,
                callerDisplayName = null,
                shouldShowAsSpam = false,
                riskAssessment = fallbackRiskAssessment
            )
        }
    }
    
    private fun handlePostCallActions(phoneNumber: String, response: CallResponse) {
        Log.d(TAG, "Handling post-call actions for: $phoneNumber")
        
        // Show missed call notification with action buttons (if enabled)
        if (FeatureFlags.isMissedCallActionsEnabled && 
            response.callerDisplayName == UNKNOWN_CALLER_LABEL) {
            
            // Delay slightly to avoid interfering with ongoing call
            serviceScope.launch {
                kotlinx.coroutines.delay(2000) // 2 second delay
                try {
                    // Fetch templates from backend with caching
                    val backendClient = BackendClient.getInstance(this@CallScreeningService)
                    val userName = getSharedPreferences("verifd_prefs", MODE_PRIVATE)
                        .getString("user_name", null)
                    
                    val templatesResult = backendClient.fetchMessageTemplates(
                        phoneNumber = phoneNumber,
                        userName = userName,
                        locale = resources.configuration.locales.get(0)?.toLanguageTag() ?: "en-US"
                    )
                    
                    when (templatesResult) {
                        is BackendClient.MessageTemplatesResult.Success -> {
                            Log.d(TAG, "Fetched templates (cached=${templatesResult.cached})")
                            
                            notificationManager.showMissedCallNotification(
                                phoneNumber = phoneNumber,
                                verifyLink = templatesResult.verifyLink,
                                smsTemplate = templatesResult.smsTemplate,
                                whatsAppTemplate = templatesResult.whatsAppTemplate
                            )
                        }
                        is BackendClient.MessageTemplatesResult.RateLimited -> {
                            Log.w(TAG, "Rate limited fetching templates, using fallback")
                            // Use fallback templates
                            val fallbackLink = "https://verify.verifd.com/v/${phoneNumber.hashCode().toString(16)}"
                            val fallbackSms = "Hi! You called earlier. Please verify: $fallbackLink"
                            val fallbackWhatsApp = "I missed your call. To reach me again, verify: $fallbackLink"
                            
                            notificationManager.showMissedCallNotification(
                                phoneNumber = phoneNumber,
                                verifyLink = fallbackLink,
                                smsTemplate = fallbackSms,
                                whatsAppTemplate = fallbackWhatsApp
                            )
                        }
                        is BackendClient.MessageTemplatesResult.Error -> {
                            Log.e(TAG, "Error fetching templates: ${templatesResult.message}")
                            // Use fallback templates
                            val fallbackLink = "https://verify.verifd.com/v/${phoneNumber.hashCode().toString(16)}"
                            val fallbackSms = "Hi! You called earlier. Please verify: $fallbackLink"
                            val fallbackWhatsApp = "I missed your call. To reach me again, verify: $fallbackLink"
                            
                            notificationManager.showMissedCallNotification(
                                phoneNumber = phoneNumber,
                                verifyLink = fallbackLink,
                                smsTemplate = fallbackSms,
                                whatsAppTemplate = fallbackWhatsApp
                            )
                        }
                    }
                    
                    // Record telemetry for notification shown
                    telemetry.recordEvent(
                        PrivacyTelemetry.EVENT_NOTIFICATION_SHOWN,
                        phoneNumber,
                        mapOf(
                            "type" to "missed_call_actions",
                            "risk_tier" to (response.riskAssessment?.tier?.name ?: "unknown")
                        )
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to show missed call notification", e)
                }
            }
        }
        
        // Schedule traditional post-call sheet for unknown callers (as fallback or when notifications disabled)
        if (response.callerDisplayName == UNKNOWN_CALLER_LABEL && 
            (!FeatureFlags.isMissedCallActionsEnabled || 
             response.riskAssessment?.tier == RiskAssessment.RiskTier.CRITICAL)) {
            schedulePostCallSheet(phoneNumber)
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
        val riskAssessment = response.riskAssessment
        
        val responseBuilder = CallScreeningService.CallResponse.Builder()
            .setDisallowCall(!response.shouldAllowCall)
            .setRejectCall(!response.shouldAllowCall)
            .setSkipCallLog(riskAssessment?.shouldSkipCallLog ?: false)
            .setSkipNotification(riskAssessment?.shouldSkipNotification ?: false)
            .setSilenceCall(riskAssessment?.shouldSilenceCall ?: false)
        
        // Note: Display name cannot be set via CallScreeningService API
        // It's only shown in our UI, not in system call log
        
        Log.d(TAG, "Responding to call: allow=${response.shouldAllowCall}, " +
                "skipLog=${riskAssessment?.shouldSkipCallLog}, " +
                "skipNotification=${riskAssessment?.shouldSkipNotification}, " +
                "silence=${riskAssessment?.shouldSilenceCall}")
        
        respondToCall(callDetails, responseBuilder.build())
    }

    /**
     * Data class representing the screening decision
     */
    private data class CallResponse(
        val shouldAllowCall: Boolean,
        val callerDisplayName: String?,
        val shouldShowAsSpam: Boolean,
        val riskAssessment: RiskAssessment.RiskAssessmentResult? = null
    )
    
    /**
     * Show debug notification for call screening events (staging builds only)
     * Feature 4: Call screening smoke debug notification
     */
    private fun showDebugNotification(callDetails: Call.Details) {
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channelId = "verifd_debug"
            
            // Create debug channel if needed
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    channelId,
                    "Debug Notifications",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Call screening debug notifications (staging only)"
                    enableLights(true)
                    lightColor = android.graphics.Color.YELLOW
                }
                notificationManager.createNotificationChannel(channel)
            }
            
            val phoneNumber = callDetails.handle?.schemeSpecificPart ?: "Unknown"
            val timestamp = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(Date())
            
            val notification = NotificationCompat.Builder(this, channelId)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("🔍 Call Screened")
                .setContentText("onScreenCall: $phoneNumber")
                .setStyle(NotificationCompat.BigTextStyle()
                    .bigText("""
                        📞 onScreenCall triggered
                        Number: $phoneNumber
                        Time: $timestamp
                        Has Role: ${hasCallScreeningRole(this)}
                        Build: ${BuildConfig.VERSION_NAME}
                    """.trimIndent()))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setColor(ContextCompat.getColor(this, android.R.color.holo_orange_dark))
                .build()
            
            // Use unique ID based on timestamp to avoid overwriting
            val notificationId = System.currentTimeMillis().toInt() and 0xFFFF
            notificationManager.notify(notificationId, notification)
            
            Log.d(TAG, "Debug notification shown for call screening: $phoneNumber at $timestamp")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show debug notification", e)
        }
    }
}