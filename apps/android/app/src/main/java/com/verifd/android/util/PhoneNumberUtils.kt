package com.verifd.android.util

import android.telephony.PhoneNumberUtils as AndroidPhoneNumberUtils
import android.util.Log
import java.util.Locale
import java.util.regex.Pattern

/**
 * Utility class for phone number operations
 * Handles E.164 formatting, normalization, and privacy-safe display
 */
object PhoneNumberUtils {
    
    private const val TAG = "PhoneNumberUtils"
    
    // Regex for phone number normalization
    private val PHONE_PATTERN = Pattern.compile("[^0-9+]")
    private val LEADING_ONE_PATTERN = Pattern.compile("^1([0-9]{10})$")
    private val E164_PATTERN = Pattern.compile("^\\+[1-9]\\d{1,14}$")
    
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
    
    /**
     * Convert a phone number to E.164 format
     * @param phoneNumber The raw phone number
     * @param defaultCountryIso Optional country ISO code (e.g., "US", "IN")
     * @return E.164 formatted number (e.g., "+15551234567") or null if invalid
     */
    fun toE164(phoneNumber: String, defaultCountryIso: String? = null): String? {
        return try {
            val cleaned = phoneNumber.replace(Regex("[^0-9+]"), "")
            
            // Already in E.164 format
            if (cleaned.startsWith("+") && isValidE164(cleaned)) {
                return cleaned
            }
            
            // Try to format with Android's utility
            val countryIso = defaultCountryIso ?: Locale.getDefault().country
            val formatted = AndroidPhoneNumberUtils.formatNumberToE164(cleaned, countryIso)
            
            if (formatted != null && formatted.startsWith("+")) {
                formatted
            } else {
                // Fallback: assume US if no country code and starts with valid US number
                if (cleaned.length == 10 && cleaned[0] in '2'..'9') {
                    "+1$cleaned"
                } else if (cleaned.length == 11 && cleaned.startsWith("1")) {
                    "+$cleaned"
                } else {
                    null
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to convert to E.164: $phoneNumber", e)
            null
        }
    }
    
    /**
     * Check if a number is valid E.164
     * @param phoneNumber The number to check
     * @return true if valid E.164 format
     */
    fun isValidE164(phoneNumber: String): Boolean {
        return E164_PATTERN.matcher(phoneNumber).matches()
    }
    
    /**
     * Format E.164 number for display with privacy
     * @param e164Number E.164 formatted number
     * @return Display format like "+1 (555) 123-****"
     */
    fun formatForPrivacyDisplay(e164Number: String): String {
        return try {
            if (!e164Number.startsWith("+")) return e164Number
            
            when {
                // US/Canada numbers
                e164Number.startsWith("+1") && e164Number.length == 12 -> {
                    val areaCode = e164Number.substring(2, 5)
                    val prefix = e164Number.substring(5, 8)
                    "+1 ($areaCode) $prefix-****"
                }
                // India numbers  
                e164Number.startsWith("+91") && e164Number.length == 13 -> {
                    val firstPart = e164Number.substring(3, 8)
                    "+91 $firstPart *****"
                }
                // Generic international
                else -> {
                    if (e164Number.length > 7) {
                        val visible = e164Number.substring(0, e164Number.length - 4)
                        "$visible****"
                    } else {
                        e164Number
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to format for privacy: $e164Number", e)
            e164Number
        }
    }
    
    /**
     * Hash a phone number for privacy logging
     * @param phoneNumber The number to hash
     * @return Hashed format like "ph_abc123..."
     */
    fun hashForLogging(phoneNumber: String): String {
        return try {
            val hash = phoneNumber.hashCode().toString(16)
            "ph_${hash.take(8)}"
        } catch (e: Exception) {
            "ph_unknown"
        }
    }
}