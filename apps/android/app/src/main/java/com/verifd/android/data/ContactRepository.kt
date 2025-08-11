package com.verifd.android.data

import android.content.Context
import android.content.SharedPreferences
import android.database.Cursor
import android.provider.ContactsContract
import android.util.Log
import com.verifd.android.data.database.VPassDao
import com.verifd.android.data.database.VerifdDatabase
import com.verifd.android.data.model.VPassEntry
import com.verifd.android.util.PhoneNumberUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Date

/**
 * Repository for managing contacts, vPass entries, and call screening logic
 */
class ContactRepository private constructor(
    private val context: Context,
    private val vPassDao: VPassDao,
    private val prefs: SharedPreferences
) {
    
    companion object {
        private const val TAG = "ContactRepository"
        private const val PREFS_NAME = "verifd_prefs"
        private const val KEY_EXPECTING_CALL = "expecting_call"
        
        @Volatile
        private var INSTANCE: ContactRepository? = null
        
        fun getInstance(context: Context): ContactRepository {
            return INSTANCE ?: synchronized(this) {
                val database = VerifdDatabase.getInstance(context)
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                
                ContactRepository(
                    context.applicationContext,
                    database.vPassDao(),
                    prefs
                ).also { INSTANCE = it }
            }
        }
    }
    
    /**
     * Check if phone number has valid vPass
     */
    suspend fun getValidVPass(phoneNumber: String): VPassEntry? {
        return withContext(Dispatchers.IO) {
            try {
                val normalizedNumber = PhoneNumberUtils.normalize(phoneNumber)
                val vPass = vPassDao.getByPhoneNumber(normalizedNumber)
                
                // Check if vPass is still valid
                if (vPass != null && vPass.expiresAt.after(Date())) {
                    Log.d(TAG, "Valid vPass found for $normalizedNumber")
                    vPass
                } else {
                    if (vPass != null) {
                        // Clean up expired vPass
                        vPassDao.delete(vPass)
                        Log.d(TAG, "Expired vPass removed for $normalizedNumber")
                    }
                    null
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking vPass for $phoneNumber", e)
                null
            }
        }
    }
    
    /**
     * Insert new vPass entry
     */
    suspend fun insertVPass(vPassEntry: VPassEntry) {
        withContext(Dispatchers.IO) {
            try {
                val normalizedEntry = vPassEntry.copy(
                    phoneNumber = PhoneNumberUtils.normalize(vPassEntry.phoneNumber)
                )
                vPassDao.insert(normalizedEntry)
                Log.d(TAG, "vPass inserted for ${normalizedEntry.phoneNumber}")
            } catch (e: Exception) {
                Log.e(TAG, "Error inserting vPass", e)
                throw e
            }
        }
    }
    
    /**
     * Check if phone number exists in system contacts
     */
    suspend fun isKnownContact(phoneNumber: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val normalizedNumber = PhoneNumberUtils.normalize(phoneNumber)
                
                val cursor: Cursor? = context.contentResolver.query(
                    ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                    arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
                    null,
                    null,
                    null
                )
                
                cursor?.use { c ->
                    while (c.moveToNext()) {
                        val contactNumber = c.getString(0)
                        val normalizedContactNumber = PhoneNumberUtils.normalize(contactNumber)
                        
                        if (normalizedContactNumber == normalizedNumber) {
                            Log.d(TAG, "Found contact match for $normalizedNumber")
                            return@withContext true
                        }
                    }
                }
                
                Log.d(TAG, "No contact match found for $normalizedNumber")
                false
                
            } catch (e: Exception) {
                Log.e(TAG, "Error checking contacts for $phoneNumber", e)
                false
            }
        }
    }
    
    /**
     * Get all active vPass entries
     */
    suspend fun getAllValidVPasses(): List<VPassEntry> {
        return withContext(Dispatchers.IO) {
            try {
                val currentTime = Date()
                val allPasses = vPassDao.getAll()
                
                // Filter and clean up expired entries
                val validPasses = allPasses.filter { vPass ->
                    if (vPass.expiresAt.after(currentTime)) {
                        true
                    } else {
                        // Clean up expired entry
                        vPassDao.delete(vPass)
                        false
                    }
                }
                
                Log.d(TAG, "Retrieved ${validPasses.size} valid vPasses")
                validPasses
                
            } catch (e: Exception) {
                Log.e(TAG, "Error getting all vPasses", e)
                emptyList()
            }
        }
    }
    
    /**
     * Remove vPass entry
     */
    suspend fun removeVPass(phoneNumber: String) {
        withContext(Dispatchers.IO) {
            try {
                val normalizedNumber = PhoneNumberUtils.normalize(phoneNumber)
                val vPass = vPassDao.getByPhoneNumber(normalizedNumber)
                
                if (vPass != null) {
                    vPassDao.delete(vPass)
                    Log.d(TAG, "vPass removed for $normalizedNumber")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error removing vPass for $phoneNumber", e)
                throw e
            }
        }
    }
    
    /**
     * Clean up expired vPass entries
     */
    suspend fun cleanupExpiredVPasses(): Int {
        return withContext(Dispatchers.IO) {
            try {
                val expiredCount = vPassDao.deleteExpired(Date())
                if (expiredCount > 0) {
                    Log.d(TAG, "Cleaned up $expiredCount expired vPasses")
                }
                expiredCount
            } catch (e: Exception) {
                Log.e(TAG, "Error cleaning up expired vPasses", e)
                0
            }
        }
    }
    
    /**
     * Set expecting call state (for Quick Tile)
     */
    suspend fun setExpectingCall(expecting: Boolean) {
        withContext(Dispatchers.IO) {
            prefs.edit()
                .putBoolean(KEY_EXPECTING_CALL, expecting)
                .apply()
            
            Log.d(TAG, "Expecting call state set to: $expecting")
        }
    }
    
    /**
     * Check if currently expecting a call
     */
    suspend fun isExpectingCall(): Boolean {
        return withContext(Dispatchers.IO) {
            val expecting = prefs.getBoolean(KEY_EXPECTING_CALL, false)
            Log.d(TAG, "Current expecting call state: $expecting")
            expecting
        }
    }
    
    /**
     * Add phone number to blocked list (placeholder implementation)
     * In a full implementation, this would integrate with system call blocking
     */
    suspend fun addBlockedNumber(phoneNumber: String) {
        withContext(Dispatchers.IO) {
            try {
                val normalizedNumber = PhoneNumberUtils.normalize(phoneNumber)
                
                // For now, store in SharedPreferences
                // In a full implementation, this would integrate with system call blocking APIs
                val blockedNumbers = getBlockedNumbers().toMutableSet()
                blockedNumbers.add(normalizedNumber)
                
                prefs.edit()
                    .putStringSet("blocked_numbers", blockedNumbers)
                    .apply()
                
                Log.d(TAG, "Added $normalizedNumber to blocked list")
                
            } catch (e: Exception) {
                Log.e(TAG, "Error adding blocked number: $phoneNumber", e)
                throw e
            }
        }
    }
    
    /**
     * Get all blocked phone numbers
     */
    suspend fun getBlockedNumbers(): Set<String> {
        return withContext(Dispatchers.IO) {
            try {
                prefs.getStringSet("blocked_numbers", emptySet()) ?: emptySet()
            } catch (e: Exception) {
                Log.e(TAG, "Error getting blocked numbers", e)
                emptySet()
            }
        }
    }
    
    /**
     * Check if phone number is blocked
     */
    suspend fun isBlockedNumber(phoneNumber: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val normalizedNumber = PhoneNumberUtils.normalize(phoneNumber)
                val blockedNumbers = getBlockedNumbers()
                blockedNumbers.contains(normalizedNumber)
            } catch (e: Exception) {
                Log.e(TAG, "Error checking if number is blocked: $phoneNumber", e)
                false
            }
        }
    }
}