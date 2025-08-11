package com.verifd.android.config

import android.content.Context
import android.content.SharedPreferences

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
    
    // Default values (can be overridden at runtime)
    private const val DEFAULT_MISSED_CALL_ACTIONS = true
    private const val DEFAULT_RISK_TIER_ASSESSMENT = true
    private const val DEFAULT_HIGH_RISK_BLOCKING = false // Conservative default
    private const val DEFAULT_QUICK_TILE_EXPECTING = true
    
    private var prefs: SharedPreferences? = null
    
    /**
     * Initialize feature flags with context
     */
    fun initialize(context: Context) {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }
    
    /**
     * Enable missed call notification actions (Approve 30m/24h/30d + Block buttons)
     */
    val isMissedCallActionsEnabled: Boolean
        get() = prefs?.getBoolean(FLAG_MISSED_CALL_ACTIONS, DEFAULT_MISSED_CALL_ACTIONS) 
            ?: DEFAULT_MISSED_CALL_ACTIONS
    
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
            FLAG_QUICK_TILE_EXPECTING to isQuickTileExpectingEnabled
        )
    }
}