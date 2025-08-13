package com.verifd.android.telemetry

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.verifd.android.util.PhoneNumberUtils
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.min

/**
 * Privacy-focused telemetry for verifd actions
 * Records anonymized events with phone number hashing
 */
class PrivacyTelemetry(private val context: Context) {
    
    companion object {
        private const val TAG = "PrivacyTelemetry"
        private const val PREFS_NAME = "verifd_telemetry"
        private const val KEY_EVENTS = "events"
        private const val KEY_AGGREGATES = "aggregates"
        private const val MAX_EVENTS = 100
        private const val EVENT_TTL_DAYS = 7
        
        // Event types
        const val EVENT_NOTIFICATION_SHOWN = "notif_shown"
        const val EVENT_SMS_ACTION = "sms_action"
        const val EVENT_WHATSAPP_ACTION = "whatsapp_action"
        const val EVENT_COPY_ACTION = "copy_action"
        const val EVENT_VERIFY_STARTED = "verify_started"
        const val EVENT_VERIFY_COMPLETED = "verify_completed"
        const val EVENT_PASS_GRANTED = "pass_granted"
        const val EVENT_PASS_CHECKED = "pass_checked"
        const val EVENT_CALL_SCREENED = "call_screened"
        const val EVENT_CALL_ALLOWED = "call_allowed"
        const val EVENT_ERROR = "error"
    }
    
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    
    /**
     * Record a telemetry event with privacy protection
     */
    fun recordEvent(
        eventType: String,
        phoneNumber: String? = null,
        metadata: Map<String, Any> = emptyMap()
    ) {
        try {
            val event = JSONObject().apply {
                put("type", eventType)
                put("timestamp", dateFormat.format(Date()))
                
                // Hash phone number for privacy
                phoneNumber?.let {
                    put("phone_hash", PhoneNumberUtils.hashForLogging(it))
                }
                
                // Add metadata
                if (metadata.isNotEmpty()) {
                    val metaJson = JSONObject()
                    metadata.forEach { (key, value) ->
                        when (value) {
                            is String -> metaJson.put(key, value)
                            is Number -> metaJson.put(key, value)
                            is Boolean -> metaJson.put(key, value)
                            else -> metaJson.put(key, value.toString())
                        }
                    }
                    put("metadata", metaJson)
                }
            }
            
            // Store event
            storeEvent(event)
            
            // Update aggregates
            updateAggregates(eventType)
            
            // Clean old events
            cleanOldEvents()
            
            Log.d(TAG, "Event recorded: $eventType")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to record event: $eventType", e)
        }
    }
    
    /**
     * Store event in local storage
     */
    private fun storeEvent(event: JSONObject) {
        val eventsJson = prefs.getString(KEY_EVENTS, "[]") ?: "[]"
        val events = JSONArray(eventsJson)
        
        // Add new event
        events.put(event)
        
        // Limit total events
        while (events.length() > MAX_EVENTS) {
            events.remove(0)
        }
        
        prefs.edit().putString(KEY_EVENTS, events.toString()).apply()
    }
    
    /**
     * Update aggregate statistics
     */
    private fun updateAggregates(eventType: String) {
        val aggregatesJson = prefs.getString(KEY_AGGREGATES, "{}") ?: "{}"
        val aggregates = JSONObject(aggregatesJson)
        
        // Update count for this event type
        val currentCount = aggregates.optInt(eventType, 0)
        aggregates.put(eventType, currentCount + 1)
        
        // Update last occurrence
        aggregates.put("${eventType}_last", dateFormat.format(Date()))
        
        prefs.edit().putString(KEY_AGGREGATES, aggregates.toString()).apply()
    }
    
    /**
     * Clean events older than TTL
     */
    private fun cleanOldEvents() {
        try {
            val eventsJson = prefs.getString(KEY_EVENTS, "[]") ?: "[]"
            val events = JSONArray(eventsJson)
            val filteredEvents = JSONArray()
            
            val cutoffTime = System.currentTimeMillis() - (EVENT_TTL_DAYS * 24 * 60 * 60 * 1000L)
            val cutoffDate = dateFormat.format(Date(cutoffTime))
            
            for (i in 0 until events.length()) {
                val event = events.getJSONObject(i)
                val timestamp = event.getString("timestamp")
                
                if (timestamp > cutoffDate) {
                    filteredEvents.put(event)
                }
            }
            
            if (filteredEvents.length() != events.length()) {
                prefs.edit().putString(KEY_EVENTS, filteredEvents.toString()).apply()
                Log.d(TAG, "Cleaned ${events.length() - filteredEvents.length()} old events")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clean old events", e)
        }
    }
    
    /**
     * Get telemetry summary (privacy-safe)
     */
    fun getSummary(): JSONObject {
        return try {
            val aggregatesJson = prefs.getString(KEY_AGGREGATES, "{}") ?: "{}"
            val aggregates = JSONObject(aggregatesJson)
            
            JSONObject().apply {
                put("total_events", getTotalEventCount())
                put("aggregates", aggregates)
                put("last_cleanup", getLastCleanupTime())
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get summary", e)
            JSONObject()
        }
    }
    
    /**
     * Get total event count
     */
    private fun getTotalEventCount(): Int {
        val eventsJson = prefs.getString(KEY_EVENTS, "[]") ?: "[]"
        return try {
            JSONArray(eventsJson).length()
        } catch (e: Exception) {
            0
        }
    }
    
    /**
     * Get last cleanup time
     */
    private fun getLastCleanupTime(): String {
        return prefs.getString("last_cleanup", "never") ?: "never"
    }
    
    /**
     * Clear all telemetry data
     */
    fun clearAll() {
        prefs.edit().clear().apply()
        Log.d(TAG, "All telemetry data cleared")
    }
    
    /**
     * Export telemetry for debugging (staging only)
     */
    fun exportForDebug(): String {
        return if (isStaging()) {
            JSONObject().apply {
                put("events", JSONArray(prefs.getString(KEY_EVENTS, "[]")))
                put("aggregates", JSONObject(prefs.getString(KEY_AGGREGATES, "{}")))
            }.toString(2)
        } else {
            "{\"error\": \"Export only available in staging\"}"
        }
    }
    
    /**
     * Check if running in staging environment
     */
    private fun isStaging(): Boolean {
        // Check if staging build based on package name or build config
        return context.packageName.contains(".staging") || 
               context.packageName.contains(".debug")
    }
}