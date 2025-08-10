package com.verifd.android.data.database

import android.content.Context
import androidx.room.*
import com.verifd.android.data.model.VPassEntry
import java.util.Date

/**
 * Room database for verifd app
 */
@Database(
    entities = [VPassEntry::class],
    version = 1,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class VerifdDatabase : RoomDatabase() {
    
    abstract fun vPassDao(): VPassDao
    
    companion object {
        @Volatile
        private var INSTANCE: VerifdDatabase? = null
        
        fun getInstance(context: Context): VerifdDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    VerifdDatabase::class.java,
                    "verifd_database"
                )
                .fallbackToDestructiveMigration()
                .build()
                
                INSTANCE = instance
                instance
            }
        }
    }
}

/**
 * Type converters for Room database
 */
class Converters {
    @TypeConverter
    fun fromTimestamp(value: Long?): Date? {
        return value?.let { Date(it) }
    }
    
    @TypeConverter
    fun dateToTimestamp(date: Date?): Long? {
        return date?.time
    }
    
    @TypeConverter
    fun fromDuration(duration: VPassEntry.Duration): String {
        return duration.name
    }
    
    @TypeConverter
    fun toDuration(duration: String): VPassEntry.Duration {
        return VPassEntry.Duration.valueOf(duration)
    }
}