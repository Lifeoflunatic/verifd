package com.verifd.android.config

import android.content.Context
import android.content.SharedPreferences
import com.verifd.android.BuildConfig

/**
 * Feature flag configuration for verifd Android app.
 * Allows runtime enabling/disabling of features during development and testing.
 */
object FeatureFlags {
    
    private const val PREFS_NAME = "verifd_feature_flags"
    
    // Feature flag constants
    private const val FLAG_MISSED_CALL_ACTIONS = "missed_call_actions"
    private const val FLAG_RISK_TIER_ASSESSMENT = "risk_tier_assessment"
    private const val FLAG_HIGH_RISK_BLOCKING = "high_risk_blocking"
    private const val FLAG_QUICK_TILE_EXPECTING = "quick_tile_expecting"
    private const val FLAG_EXPECTING_WINDOW = "expecting_window"
    private const val FLAG_POST_CALL_ACTIONS = "post_call_actions"
    private const val FLAG_SILENCE_UNKNOWN_CALLERS = "silence_unknown_callers"
    
    // Default values (can be overridden at runtime)
    private const val DEFAULT_MISSED_CALL_ACTIONS = true
    private const val DEFAULT_RISK_TIER_ASSESSMENT = true
    private const val DEFAULT_HIGH_RISK_BLOCKING = false // Conservative default
    private const val DEFAULT_QUICK_TILE_EXPECTING = true
    private const val DEFAULT_EXPECTING_WINDOW = true
    private const val DEFAULT_POST_CALL_ACTIONS = true
    
    private var prefs: SharedPreferences? = null
    
    /**
     * Initialize feature flags with context
     * Feature 5: Staging defaults - enable missed-call actions and silence unknowns
     */
    fun initialize(context: Context) {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        
        // Set staging defaults on first run
        if (BuildConfig.BUILD_TYPE == "staging" && !prefs!!.contains("staging_defaults_set")) {
            prefs!!.edit().apply {
                putBoolean(FLAG_MISSED_CALL_ACTIONS, true) // Always enable in staging
                putBoolean(FLAG_SILENCE_UNKNOWN_CALLERS, true) // Silence unknowns by default
                putBoolean(FLAG_POST_CALL_ACTIONS, true) // Enable post-call actions
                putBoolean("staging_defaults_set", true) // Mark as initialized
                apply()
            }
        }
    }
    
    /**
     * Enable missed call notification actions (Approve 30m/24h/30d + Block buttons)
     */
    var isMissedCallActionsEnabled: Boolean
        get() = prefs?.getBoolean(FLAG_MISSED_CALL_ACTIONS, DEFAULT_MISSED_CALL_ACTIONS) 
            ?: DEFAULT_MISSED_CALL_ACTIONS
        set(value) {
            prefs?.edit()?.putBoolean(FLAG_MISSED_CALL_ACTIONS, value)?.apply()
        }
    
    /**
     * Enable risk tier assessment using STIR/SHAKEN attestation and burst heuristics
     */
    val isRiskTierAssessmentEnabled: Boolean
        get() = prefs?.getBoolean(FLAG_RISK_TIER_ASSESSMENT, DEFAULT_RISK_TIER_ASSESSMENT)
            ?: DEFAULT_RISK_TIER_ASSESSMENT
    
    /**
     * Enable high-risk call handling (skipCallLog and skipNotification)
     */
    val isHighRiskBlockingEnabled: Boolean
        get() = prefs?.getBoolean(FLAG_HIGH_RISK_BLOCKING, DEFAULT_HIGH_RISK_BLOCKING)
            ?: DEFAULT_HIGH_RISK_BLOCKING
    
    /**
     * Enable Quick Settings tile for expecting calls with persistent notifications
     */
    val isQuickTileExpectingEnabled: Boolean
        get() = prefs?.getBoolean(FLAG_QUICK_TILE_EXPECTING, DEFAULT_QUICK_TILE_EXPECTING)
            ?: DEFAULT_QUICK_TILE_EXPECTING
    
    /**
     * Enable expecting window feature
     */
    var isExpectingWindowEnabled: Boolean
        get() = prefs?.getBoolean(FLAG_EXPECTING_WINDOW, DEFAULT_EXPECTING_WINDOW)
            ?: DEFAULT_EXPECTING_WINDOW
        set(value) {
            prefs?.edit()?.putBoolean(FLAG_EXPECTING_WINDOW, value)?.apply()
        }
    
    /**
     * Enable post-call actions feature
     */
    var isPostCallActionsEnabled: Boolean
        get() = prefs?.getBoolean(FLAG_POST_CALL_ACTIONS, DEFAULT_POST_CALL_ACTIONS)
            ?: DEFAULT_POST_CALL_ACTIONS
        set(value) {
            prefs?.edit()?.putBoolean(FLAG_POST_CALL_ACTIONS, value)?.apply()
        }
    
    /**
     * Silence unknown callers (staging default: true)
     * Feature 5: Staging default behavior
     */
    var isSilenceUnknownCallersEnabled: Boolean
        get() {
            // Default to true in staging builds
            val defaultValue = BuildConfig.BUILD_TYPE == "staging"
            return prefs?.getBoolean(FLAG_SILENCE_UNKNOWN_CALLERS, defaultValue) ?: defaultValue
        }
        set(value) {
            prefs?.edit()?.putBoolean(FLAG_SILENCE_UNKNOWN_CALLERS, value)?.apply()
        }
    
    /**
     * Set feature flag value (for testing/debugging)
     */
    fun setFlag(flag: String, enabled: Boolean) {
        prefs?.edit()?.putBoolean(flag, enabled)?.apply()
    }
    
    /**
     * Reset all flags to defaults
     */
    fun resetToDefaults() {
        prefs?.edit()?.clear()?.apply()
    }
    
    /**
     * Get all current flag values (for debugging)
     */
    fun getAllFlags(): Map<String, Boolean> {
        return mapOf(
            FLAG_MISSED_CALL_ACTIONS to isMissedCallActionsEnabled,
            FLAG_RISK_TIER_ASSESSMENT to isRiskTierAssessmentEnabled,
            FLAG_HIGH_RISK_BLOCKING to isHighRiskBlockingEnabled,
            FLAG_QUICK_TILE_EXPECTING to isQuickTileExpectingEnabled,
            FLAG_EXPECTING_WINDOW to isExpectingWindowEnabled,
            FLAG_POST_CALL_ACTIONS to isPostCallActionsEnabled,
            FLAG_SILENCE_UNKNOWN_CALLERS to isSilenceUnknownCallersEnabled
        )
    }
}