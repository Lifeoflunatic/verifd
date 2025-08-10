package com.verifd.android.data.database

import androidx.room.*
import com.verifd.android.data.model.VPassEntry
import java.util.Date

/**
 * Room DAO for vPass entries
 */
@Dao
interface VPassDao {
    
    @Query("SELECT * FROM vpass_entries WHERE phoneNumber = :phoneNumber LIMIT 1")
    suspend fun getByPhoneNumber(phoneNumber: String): VPassEntry?
    
    @Query("SELECT * FROM vpass_entries ORDER BY createdAt DESC")
    suspend fun getAll(): List<VPassEntry>
    
    @Query("SELECT * FROM vpass_entries WHERE expiresAt > :currentTime ORDER BY createdAt DESC")
    suspend fun getAllValid(currentTime: Date = Date()): List<VPassEntry>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(vPassEntry: VPassEntry)
    
    @Update
    suspend fun update(vPassEntry: VPassEntry)
    
    @Delete
    suspend fun delete(vPassEntry: VPassEntry)
    
    @Query("DELETE FROM vpass_entries WHERE phoneNumber = :phoneNumber")
    suspend fun deleteByPhoneNumber(phoneNumber: String)
    
    @Query("DELETE FROM vpass_entries WHERE expiresAt <= :currentTime")
    suspend fun deleteExpired(currentTime: Date): Int
    
    @Query("DELETE FROM vpass_entries")
    suspend fun deleteAll()
    
    @Query("SELECT COUNT(*) FROM vpass_entries WHERE expiresAt > :currentTime")
    suspend fun getValidCount(currentTime: Date = Date()): Int
}