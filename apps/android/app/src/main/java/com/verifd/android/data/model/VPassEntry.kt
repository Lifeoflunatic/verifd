package com.verifd.android.data.model

import android.os.Parcelable
import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.parcelize.Parcelize
import java.util.Date

/**
 * Data class representing a vPass entry in local storage
 */
@Entity(tableName = "vpass_entries")
@Parcelize
data class VPassEntry(
    @PrimaryKey
    val phoneNumber: String,
    val name: String,
    val duration: Duration,
    val createdAt: Date,
    val expiresAt: Date
) : Parcelable {
    
    /**
     * Duration options for vPass
     */
    enum class Duration {
        HOURS_24,
        DAYS_30;
        
        fun toDisplayString(): String {
            return when (this) {
                HOURS_24 -> "24 hours"
                DAYS_30 -> "30 days"
            }
        }
        
        fun toMillis(): Long {
            return when (this) {
                HOURS_24 -> 24 * 60 * 60 * 1000L
                DAYS_30 -> 30 * 24 * 60 * 60 * 1000L
            }
        }
    }
    
    /**
     * Check if this vPass is currently valid
     */
    fun isValid(): Boolean {
        return expiresAt.after(Date())
    }
    
    /**
     * Get remaining time in milliseconds
     */
    fun getRemainingTimeMs(): Long {
        val now = Date()
        return if (expiresAt.after(now)) {
            expiresAt.time - now.time
        } else {
            0L
        }
    }
    
    /**
     * Get human-readable remaining time
     */
    fun getRemainingTimeString(): String {
        val remainingMs = getRemainingTimeMs()
        
        if (remainingMs <= 0) {
            return "Expired"
        }
        
        val hours = remainingMs / (1000 * 60 * 60)
        val days = hours / 24
        
        return when {
            days > 0 -> "${days}d ${hours % 24}h"
            hours > 0 -> "${hours}h"
            else -> {
                val minutes = remainingMs / (1000 * 60)
                "${minutes}m"
            }
        }
    }
}