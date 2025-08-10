package com.verifd.android.util

import android.util.Log
import java.util.regex.Pattern

/**
 * Utility class for phone number operations
 */
object PhoneNumberUtils {
    
    private const val TAG = "PhoneNumberUtils"
    
    // Regex for phone number normalization
    private val PHONE_PATTERN = Pattern.compile("[^0-9+]")
    private val LEADING_ONE_PATTERN = Pattern.compile("^1([0-9]{10})$")
    
    /**
     * Normalize phone number for consistent comparison
     * Removes formatting, handles country codes
     */
    fun normalize(phoneNumber: String): String {
        try {
            var normalized = phoneNumber.trim()
            
            // Remove all non-digit characters except +
            normalized = PHONE_PATTERN.matcher(normalized).replaceAll("")
            
            // Handle common formats
            when {
                // International format starting with +
                normalized.startsWith("+1") && normalized.length == 12 -> {
                    normalized = normalized.substring(2) // Remove +1
                }
                normalized.startsWith("+") -> {
                    // Keep other international formats as-is for now
                    return normalized
                }
                // US number with leading 1
                normalized.length == 11 && normalized.startsWith("1") -> {
                    val matcher = LEADING_ONE_PATTERN.matcher(normalized)
                    if (matcher.matches()) {
                        normalized = matcher.group(1) ?: normalized
                    }
                }
                // Standard 10-digit US number
                normalized.length == 10 -> {
                    // Already in correct format
                }
                // Handle other lengths - might be extensions or invalid
                normalized.length < 10 -> {
                    Log.w(TAG, "Phone number too short: $phoneNumber -> $normalized")
                }
                normalized.length > 11 -> {
                    Log.w(TAG, "Phone number too long, truncating: $phoneNumber -> $normalized")
                    // Take last 10 digits for US numbers
                    if (normalized.length <= 15) { // Reasonable upper bound
                        normalized = normalized.takeLast(10)
                    }
                }
            }
            
            Log.d(TAG, "Normalized: $phoneNumber -> $normalized")
            return normalized
            
        } catch (e: Exception) {
            Log.e(TAG, "Error normalizing phone number: $phoneNumber", e)
            return phoneNumber.filter { it.isDigit() }.take(10)
        }
    }
    
    /**
     * Format phone number for display
     */
    fun format(phoneNumber: String): String {
        val normalized = normalize(phoneNumber)
        
        return when (normalized.length) {
            10 -> {
                // Format as (XXX) XXX-XXXX
                "${normalized.substring(0, 3).let { "($it)" }} " +
                "${normalized.substring(3, 6)}-${normalized.substring(6)}"
            }
            11 -> {
                // Format with country code
                "+${normalized.substring(0, 1)} ${format(normalized.substring(1))}"
            }
            else -> {
                // Return as-is if we can't format it nicely
                phoneNumber
            }
        }
    }
    
    /**
     * Check if phone number appears to be valid
     */
    fun isValid(phoneNumber: String): Boolean {
        val normalized = normalize(phoneNumber)
        
        return when {
            normalized.startsWith("+") -> {
                // International format - basic validation
                normalized.length >= 10 && normalized.length <= 15
            }
            else -> {
                // US format
                normalized.length == 10 && 
                normalized[0] in '2'..'9' && // Area code can't start with 0 or 1
                normalized[3] in '2'..'9'    // Exchange can't start with 0 or 1
            }
        }
    }
    
    /**
     * Extract just the digits for comparison
     */
    fun getDigitsOnly(phoneNumber: String): String {
        return phoneNumber.filter { it.isDigit() }
    }
    
    /**
     * Check if two phone numbers are equivalent
     */
    fun areEquivalent(number1: String, number2: String): Boolean {
        val normalized1 = normalize(number1)
        val normalized2 = normalize(number2)
        
        return normalized1 == normalized2
    }
}