package com.verifd.android.data

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.util.concurrent.TimeUnit

/**
 * Manages caching of message templates for notification actions
 * Templates are cached for 24 hours per phone number
 */
class TemplateCacheManager(context: Context) {
    
    companion object {
        private const val PREFS_NAME = "verifd_template_cache"
        private const val CACHE_TTL_HOURS = 24L
        private const val MAX_CACHE_ENTRIES = 50
    }
    
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()
    
    data class CachedTemplate(
        val phoneNumber: String,
        val templates: MessageTemplates,
        val timestamp: Long,
        val locale: String
    )
    
    data class MessageTemplates(
        val smsTemplate: String,
        val whatsappTemplate: String,
        val verifyLink: String,
        val userName: String? = null
    )
    
    /**
     * Get cached templates for a phone number
     * Returns null if cache miss or expired
     */
    fun getCachedTemplates(phoneNumber: String, locale: String = "en-US"): MessageTemplates? {
        val key = getCacheKey(phoneNumber, locale)
        val json = prefs.getString(key, null) ?: return null
        
        return try {
            val cached = gson.fromJson(json, CachedTemplate::class.java)
            
            // Check if cache is expired
            val ageMillis = System.currentTimeMillis() - cached.timestamp
            val ageHours = TimeUnit.MILLISECONDS.toHours(ageMillis)
            
            if (ageHours >= CACHE_TTL_HOURS) {
                // Cache expired, remove it
                prefs.edit().remove(key).apply()
                null
            } else {
                cached.templates
            }
        } catch (e: Exception) {
            // Invalid cache entry, remove it
            prefs.edit().remove(key).apply()
            null
        }
    }
    
    /**
     * Store templates in cache
     */
    fun cacheTemplates(phoneNumber: String, templates: MessageTemplates, locale: String = "en-US") {
        // Clean up old entries if cache is too large
        cleanupOldEntries()
        
        val key = getCacheKey(phoneNumber, locale)
        val cached = CachedTemplate(
            phoneNumber = phoneNumber,
            templates = templates,
            timestamp = System.currentTimeMillis(),
            locale = locale
        )
        
        val json = gson.toJson(cached)
        prefs.edit().putString(key, json).apply()
    }
    
    /**
     * Clear cache for a specific phone number
     */
    fun clearCache(phoneNumber: String, locale: String = "en-US") {
        val key = getCacheKey(phoneNumber, locale)
        prefs.edit().remove(key).apply()
    }
    
    /**
     * Clear all cached templates
     */
    fun clearAllCache() {
        prefs.edit().clear().apply()
    }
    
    /**
     * Get cache statistics
     */
    fun getCacheStats(): CacheStats {
        val allEntries = prefs.all
        var validCount = 0
        var expiredCount = 0
        var totalSizeBytes = 0L
        
        allEntries.forEach { (key, value) ->
            if (value is String && key.startsWith("template_")) {
                totalSizeBytes += value.length
                
                try {
                    val cached = gson.fromJson(value, CachedTemplate::class.java)
                    val ageMillis = System.currentTimeMillis() - cached.timestamp
                    val ageHours = TimeUnit.MILLISECONDS.toHours(ageMillis)
                    
                    if (ageHours >= CACHE_TTL_HOURS) {
                        expiredCount++
                    } else {
                        validCount++
                    }
                } catch (e: Exception) {
                    // Invalid entry
                }
            }
        }
        
        return CacheStats(
            totalEntries = validCount + expiredCount,
            validEntries = validCount,
            expiredEntries = expiredCount,
            totalSizeBytes = totalSizeBytes
        )
    }
    
    data class CacheStats(
        val totalEntries: Int,
        val validEntries: Int,
        val expiredEntries: Int,
        val totalSizeBytes: Long
    )
    
    /**
     * Generate cache key for phone number and locale
     */
    private fun getCacheKey(phoneNumber: String, locale: String): String {
        // Hash the phone number for privacy
        val hashedPhone = phoneNumber.hashCode().toString()
        return "template_${hashedPhone}_$locale"
    }
    
    /**
     * Remove old entries if cache is too large
     */
    private fun cleanupOldEntries() {
        val allEntries = prefs.all
        val templateEntries = mutableListOf<Pair<String, Long>>()
        
        // Collect all template entries with their timestamps
        allEntries.forEach { (key, value) ->
            if (value is String && key.startsWith("template_")) {
                try {
                    val cached = gson.fromJson(value, CachedTemplate::class.java)
                    templateEntries.add(key to cached.timestamp)
                } catch (e: Exception) {
                    // Invalid entry, mark for removal
                    templateEntries.add(key to 0L)
                }
            }
        }
        
        // If cache is too large, remove oldest entries
        if (templateEntries.size > MAX_CACHE_ENTRIES) {
            val entriesToRemove = templateEntries
                .sortedBy { it.second } // Sort by timestamp (oldest first)
                .take(templateEntries.size - MAX_CACHE_ENTRIES)
            
            val editor = prefs.edit()
            entriesToRemove.forEach { (key, _) ->
                editor.remove(key)
            }
            editor.apply()
        }
    }
}