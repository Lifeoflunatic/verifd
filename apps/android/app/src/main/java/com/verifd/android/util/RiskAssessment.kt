package com.verifd.android.util

import android.os.Build
import android.telecom.Call
import android.util.Log
import com.verifd.android.config.FeatureFlags
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Risk assessment utility for evaluating incoming calls using STIR/SHAKEN attestation
 * and burst detection heuristics.
 */
class RiskAssessment {
    
    companion object {
        private const val TAG = "RiskAssessment"
        
        // STIR/SHAKEN attestation levels (as defined in RFC 8588)
        const val ATTESTATION_FULL = "A"      // Full attestation
        const val ATTESTATION_PARTIAL = "B"   // Partial attestation  
        const val ATTESTATION_GATEWAY = "C"   // Gateway attestation
        const val ATTESTATION_NONE = ""       // No attestation
        
        // Burst detection parameters
        private val BURST_WINDOW_MS = TimeUnit.MINUTES.toMillis(5) // 5-minute window
        private const val BURST_THRESHOLD = 3 // 3+ calls in window = burst
        
        // Call history for burst detection
        private val callHistory = ConcurrentHashMap<String, MutableList<Long>>()
        
        @Volatile
        private var INSTANCE: RiskAssessment? = null
        
        fun getInstance(): RiskAssessment {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: RiskAssessment().also { INSTANCE = it }
            }
        }
    }
    
    /**
     * Risk tiers for incoming calls
     */
    enum class RiskTier {
        LOW,      // Verified caller with full attestation
        MEDIUM,   // Partial attestation or known patterns
        HIGH,     // No attestation + burst patterns or other red flags
        CRITICAL  // Definite spam/fraud patterns
    }
    
    /**
     * Risk assessment result
     */
    data class RiskAssessmentResult(
        val tier: RiskTier,
        val confidence: Float, // 0.0 to 1.0
        val reasons: List<String>,
        val shouldSkipCallLog: Boolean = false,
        val shouldSkipNotification: Boolean = false,
        val shouldSilenceCall: Boolean = false
    )
    
    /**
     * Assess the risk level of an incoming call
     */
    fun assessCall(callDetails: Call.Details, phoneNumber: String): RiskAssessmentResult {
        if (!FeatureFlags.isRiskTierAssessmentEnabled) {
            // Feature disabled - return safe defaults
            return RiskAssessmentResult(
                tier = RiskTier.MEDIUM,
                confidence = 0.5f,
                reasons = listOf("Risk assessment disabled")
            )
        }
        
        val reasons = mutableListOf<String>()
        var riskScore = 0.0f
        
        // 1. STIR/SHAKEN Attestation Analysis
        val attestationScore = analyzeAttestation(callDetails, reasons)
        riskScore += attestationScore
        
        // 2. Burst Detection
        val burstScore = analyzeBurstPattern(phoneNumber, reasons)
        riskScore += burstScore
        
        // 3. Call Properties Analysis
        val propertiesScore = analyzeCallProperties(callDetails, phoneNumber, reasons)
        riskScore += propertiesScore
        
        // 4. Time-based Analysis
        val timeScore = analyzeCallTiming(reasons)
        riskScore += timeScore
        
        // Normalize risk score to 0.0-1.0 range
        val normalizedScore = (riskScore / 4.0f).coerceIn(0.0f, 1.0f)
        
        // Determine risk tier based on score
        val tier = when {
            normalizedScore >= 0.8f -> RiskTier.CRITICAL
            normalizedScore >= 0.6f -> RiskTier.HIGH
            normalizedScore >= 0.4f -> RiskTier.MEDIUM
            else -> RiskTier.LOW
        }
        
        // Determine call handling based on tier and feature flags
        val shouldSkipCallLog = FeatureFlags.isHighRiskBlockingEnabled && 
            (tier == RiskTier.CRITICAL || (tier == RiskTier.HIGH && normalizedScore >= 0.75f))
        
        val shouldSkipNotification = FeatureFlags.isHighRiskBlockingEnabled && 
            tier == RiskTier.CRITICAL
        
        val shouldSilenceCall = tier == RiskTier.CRITICAL || 
            (tier == RiskTier.HIGH && normalizedScore >= 0.8f)
        
        Log.d(TAG, "Risk assessment for $phoneNumber: tier=$tier, score=$normalizedScore, reasons=$reasons")
        
        return RiskAssessmentResult(
            tier = tier,
            confidence = normalizedScore,
            reasons = reasons.toList(),
            shouldSkipCallLog = shouldSkipCallLog,
            shouldSkipNotification = shouldSkipNotification,
            shouldSilenceCall = shouldSilenceCall
        )
    }
    
    /**
     * Analyze STIR/SHAKEN attestation level
     */
    private fun analyzeAttestation(callDetails: Call.Details, reasons: MutableList<String>): Float {
        // Extract STIR/SHAKEN verification status from call details
        // Note: This requires Android API level 30+ and carrier support
        // Check API level for CALLER_NUMBER_VERIFICATION support
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val verificationStatus = try {
                // Access verification status if available
                callDetails.callerNumberVerificationStatus
            } catch (e: Exception) {
                Log.w(TAG, "Unable to access caller verification status", e)
                Call.Details.CALLER_NUMBER_VERIFICATION_NOT_VERIFIED
            }
            
            return when (verificationStatus) {
                Call.Details.CALLER_NUMBER_VERIFICATION_PASSED -> {
                    reasons.add("Full STIR/SHAKEN attestation")
                    0.0f // Low risk
                }
                Call.Details.CALLER_NUMBER_VERIFICATION_FAILED -> {
                    reasons.add("Failed STIR/SHAKEN verification")
                    0.8f // High risk
                }
                Call.Details.CALLER_NUMBER_VERIFICATION_NOT_VERIFIED -> {
                    reasons.add("No STIR/SHAKEN attestation")
                    0.4f // Medium risk
                }
                else -> {
                    reasons.add("Unknown verification status")
                    0.5f // Medium risk
                }
            }
        } else {
            // API < 30, skip STIR/SHAKEN check
            reasons.add("STIR/SHAKEN not available (API < 30)")
            return 0.4f // Medium risk default
        }
    }
    
    /**
     * Analyze burst calling patterns
     */
    private fun analyzeBurstPattern(phoneNumber: String, reasons: MutableList<String>): Float {
        val now = System.currentTimeMillis()
        val normalizedNumber = PhoneNumberUtils.normalize(phoneNumber)
        
        // Get or create call history for this number
        val history = callHistory.getOrPut(normalizedNumber) { mutableListOf() }
        
        // Clean old entries outside the window
        history.removeAll { it < now - BURST_WINDOW_MS }
        
        // Add current call
        history.add(now)
        
        // Analyze pattern
        val callCount = history.size
        
        return when {
            callCount >= BURST_THRESHOLD + 2 -> {
                reasons.add("Aggressive burst pattern (${callCount} calls in 5min)")
                0.9f // Very high risk
            }
            callCount >= BURST_THRESHOLD -> {
                reasons.add("Burst pattern detected (${callCount} calls in 5min)")
                0.6f // High risk
            }
            callCount == 2 -> {
                reasons.add("Repeat caller")
                0.2f // Slightly elevated risk
            }
            else -> {
                0.0f // No pattern
            }
        }
    }
    
    /**
     * Analyze call properties for risk indicators
     */
    private fun analyzeCallProperties(
        callDetails: Call.Details, 
        phoneNumber: String, 
        reasons: MutableList<String>
    ): Float {
        var score = 0.0f
        
        // Check for suspicious number patterns
        val normalizedNumber = PhoneNumberUtils.normalize(phoneNumber)
        
        // Sequential digits pattern (e.g., 1234567890)
        if (hasSequentialDigits(normalizedNumber)) {
            reasons.add("Sequential digit pattern")
            score += 0.3f
        }
        
        // Repeated digits pattern (e.g., 1111111111)
        if (hasRepeatedDigits(normalizedNumber)) {
            reasons.add("Repeated digit pattern")
            score += 0.4f
        }
        
        // Check if number appears to be spoofed (matches local area code/prefix)
        if (appearsLocalSpoofed(normalizedNumber)) {
            reasons.add("Possible local number spoofing")
            score += 0.5f
        }
        
        return score.coerceAtMost(1.0f)
    }
    
    /**
     * Analyze call timing for risk indicators
     */
    private fun analyzeCallTiming(reasons: MutableList<String>): Float {
        val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        
        return when {
            hour < 6 || hour > 22 -> {
                reasons.add("Off-hours call (${hour}:00)")
                0.3f // Slightly elevated risk for very early/late calls
            }
            hour in 9..17 -> {
                // Business hours - neutral
                0.0f
            }
            else -> {
                // Evening hours - neutral
                0.0f
            }
        }
    }
    
    /**
     * Check for sequential digits in phone number
     */
    private fun hasSequentialDigits(phoneNumber: String): Boolean {
        val digits = phoneNumber.filter { it.isDigit() }
        if (digits.length < 4) return false
        
        for (i in 0..digits.length - 4) {
            val sequence = digits.substring(i, i + 4)
            if (isSequential(sequence)) return true
        }
        return false
    }
    
    /**
     * Check for repeated digits in phone number
     */
    private fun hasRepeatedDigits(phoneNumber: String): Boolean {
        val digits = phoneNumber.filter { it.isDigit() }
        if (digits.length < 4) return false
        
        for (i in 0..digits.length - 4) {
            val sequence = digits.substring(i, i + 4)
            if (sequence.all { it == sequence[0] }) return true
        }
        return false
    }
    
    /**
     * Check if number appears to be locally spoofed
     */
    private fun appearsLocalSpoofed(phoneNumber: String): Boolean {
        // This is a simplified implementation
        // In practice, you'd compare against the user's own number or local patterns
        val digits = phoneNumber.filter { it.isDigit() }
        
        // Look for patterns like +1NXXNXXXXXX where NXX matches common spoofing patterns
        if (digits.length == 11 && digits.startsWith("1")) {
            val areaCode = digits.substring(1, 4)
            val exchange = digits.substring(4, 7)
            
            // Common spoofed patterns: area code matches exchange
            if (areaCode == exchange) {
                return true
            }
        }
        
        return false
    }
    
    /**
     * Check if a 4-digit string is sequential
     */
    private fun isSequential(digits: String): Boolean {
        if (digits.length != 4) return false
        
        return try {
            val nums = digits.map { it.digitToInt() }
            (nums[0] + 1 == nums[1] && nums[1] + 1 == nums[2] && nums[2] + 1 == nums[3]) ||
            (nums[0] - 1 == nums[1] && nums[1] - 1 == nums[2] && nums[2] - 1 == nums[3])
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Clean up old call history entries (call periodically to prevent memory leaks)
     */
    fun cleanupHistory() {
        val cutoff = System.currentTimeMillis() - BURST_WINDOW_MS
        callHistory.values.forEach { history ->
            history.removeAll { it < cutoff }
        }
        
        // Remove empty entries
        callHistory.entries.removeAll { it.value.isEmpty() }
        
        Log.d(TAG, "Cleaned up call history, ${callHistory.size} numbers tracked")
    }
}