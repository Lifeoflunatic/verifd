package com.verifd.android.ui

import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.verifd.android.BuildConfig
import com.verifd.android.R
import com.verifd.android.network.ApiService
import kotlinx.coroutines.*
import org.json.JSONObject

/**
 * QA Debug Panel - Shows configuration and feature flags
 */
class DebugPanelActivity : AppCompatActivity() {
    
    private lateinit var configTextView: TextView
    private lateinit var kidTextView: TextView
    private lateinit var signatureTextView: TextView
    private lateinit var overrideTextView: TextView
    private lateinit var environmentTextView: TextView
    
    private val coroutineScope = CoroutineScope(Dispatchers.Main + Job())
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_debug_panel)
        
        // Initialize views
        configTextView = findViewById(R.id.config_text)
        kidTextView = findViewById(R.id.kid_text)
        signatureTextView = findViewById(R.id.signature_text)
        overrideTextView = findViewById(R.id.override_text)
        environmentTextView = findViewById(R.id.environment_text)
        
        // Set build info
        environmentTextView.text = """
            Environment: ${BuildConfig.BUILD_VARIANT}
            API: ${BuildConfig.BASE_URL}
            Version: ${BuildConfig.VERSION_NAME}
            Build: ${BuildConfig.VERSION_CODE}
        """.trimIndent()
        
        // Fetch configuration
        fetchConfiguration()
    }
    
    private fun fetchConfiguration() {
        coroutineScope.launch {
            try {
                // Get user's phone number (from SharedPreferences or intent)
                val phoneNumber = getSharedPreferences("verifd", MODE_PRIVATE)
                    .getString("user_phone", null)
                
                // Call config API
                val configUrl = if (phoneNumber != null) {
                    "${BuildConfig.BASE_URL}/config/features?phone=$phoneNumber"
                } else {
                    "${BuildConfig.BASE_URL}/config/features"
                }
                
                val response = withContext(Dispatchers.IO) {
                    // Make HTTP request (simplified for example)
                    ApiService.getInstance().getConfiguration(phoneNumber)
                }
                
                // Parse response
                val json = JSONObject(response)
                
                // Display configuration
                displayConfiguration(json)
                
            } catch (e: Exception) {
                configTextView.text = "Error fetching config: ${e.message}"
            }
        }
    }
    
    private fun displayConfiguration(config: JSONObject) {
        // Extract key fields
        val kid = config.optString("kid", "none")
        val signature = config.optString("signature", "none")
        val overrideActive = config.optBoolean("overrideActive", false)
        
        // Display KID
        kidTextView.text = "KID: $kid"
        kidTextView.setTextColor(
            if (kid == "staging-2025-001") 
                getColor(android.R.color.holo_green_dark)
            else 
                getColor(android.R.color.holo_red_dark)
        )
        
        // Display signature status
        signatureTextView.text = if (signature != "none") {
            "✓ Signature present (${signature.take(20)}...)"
        } else {
            "✗ No signature"
        }
        signatureTextView.setTextColor(
            if (signature != "none")
                getColor(android.R.color.holo_green_dark)
            else
                getColor(android.R.color.holo_red_dark)
        )
        
        // Display override status
        overrideTextView.text = if (overrideActive) {
            "✓ Override Active (Full Features)"
        } else {
            "Standard User (Cohort-based)"
        }
        overrideTextView.setTextColor(
            if (overrideActive)
                getColor(android.R.color.holo_blue_dark)
            else
                getColor(android.R.color.black)
        )
        
        // Display full config (formatted)
        val formattedConfig = buildString {
            appendLine("=== Feature Flags ===")
            
            // MISSED_CALL_ACTIONS
            val missedCall = config.optJSONObject("MISSED_CALL_ACTIONS")
            if (missedCall != null) {
                val percentage = missedCall.optJSONObject("cohort")
                    ?.optInt("percentage", 0) ?: 0
                appendLine("MISSED_CALL_ACTIONS: $percentage%")
            }
            
            // Templates
            val templates = config.optJSONObject("enableTemplates")
            if (templates != null) {
                val enabled = templates.optBoolean("enabled", false)
                appendLine("Templates: $enabled")
            }
            
            // Risk Scoring
            val riskScoring = config.optJSONObject("enableRiskScoring")
            if (riskScoring != null) {
                val enabled = riskScoring.optBoolean("enabled", false)
                val metadata = riskScoring.optJSONObject("metadata")
                val shadowMode = metadata?.optBoolean("shadowMode", false) ?: false
                appendLine("Risk Scoring: $enabled (shadow: $shadowMode)")
            }
            
            appendLine("\n=== Metadata ===")
            appendLine("Config Version: ${config.optString("configVersion", "unknown")}")
            appendLine("Last Updated: ${config.optString("lastUpdated", "unknown")}")
            appendLine("Update Interval: ${config.optInt("updateIntervalMs", 0)}ms")
            
            if (overrideActive) {
                appendLine("\n=== Override Info ===")
                appendLine("Geo: ${config.optString("geo", "unknown")}")
                appendLine("All features enabled at 100%")
            }
        }
        
        configTextView.text = formattedConfig
    }
    
    override fun onDestroy() {
        super.onDestroy()
        coroutineScope.cancel()
    }
}