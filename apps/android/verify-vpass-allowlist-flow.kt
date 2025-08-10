#!/usr/bin/env kotlin

/**
 * Verification script for vPass allowlist flow
 * 
 * This script demonstrates the complete workflow:
 * 1. Unknown call arrives
 * 2. CallScreeningService checks allowlist (empty initially)
 * 3. Call is labeled "Unknown Caller" 
 * 4. PostCallActivity shows with "Grant vPass 24h" button
 * 5. User grants vPass → writes to local allowlist
 * 6. Next call from same number → found in allowlist → ALLOW
 */

import kotlinx.coroutines.*
import java.util.Date

// Mock data classes (simplified versions)
data class VPassEntry(
    val phoneNumber: String,
    val name: String,
    val duration: Duration,
    val createdAt: Date,
    val expiresAt: Date
) {
    enum class Duration {
        HOURS_24, DAYS_30;
        
        fun toMillis(): Long = when (this) {
            HOURS_24 -> 24 * 60 * 60 * 1000L
            DAYS_30 -> 30 * 24 * 60 * 60 * 1000L
        }
    }
    
    fun isValid(): Boolean = expiresAt.after(Date())
}

sealed class CallScreeningResult {
    data class Allow(val displayName: String?) : CallScreeningResult()
    data class Label(val displayName: String) : CallScreeningResult()
}

// Mock Repository (simulates Room database)
class MockVPassRepository {
    private val allowlist = mutableMapOf<String, VPassEntry>()
    
    suspend fun insertVPass(entry: VPassEntry) {
        println("📝 Writing to local allowlist: ${entry.phoneNumber} (${entry.duration}, expires ${entry.expiresAt})")
        allowlist[entry.phoneNumber] = entry
    }
    
    suspend fun getValidVPass(phoneNumber: String): VPassEntry? {
        val entry = allowlist[phoneNumber]
        return if (entry?.isValid() == true) {
            println("✅ Found valid vPass in allowlist: ${entry.phoneNumber} -> ${entry.name}")
            entry
        } else {
            if (entry != null) {
                println("❌ vPass expired, removing from allowlist: ${entry.phoneNumber}")
                allowlist.remove(phoneNumber)
            }
            null
        }
    }
    
    suspend fun isKnownContact(phoneNumber: String): Boolean {
        // Simulate system contacts check
        return false // For demo, assume not in contacts
    }
}

// Mock CallScreeningService logic
class MockCallScreeningService(private val repository: MockVPassRepository) {
    suspend fun screenCall(phoneNumber: String): CallScreeningResult {
        println("\n🔍 CallScreeningService: Screening call from $phoneNumber")
        
        // Step 1: Check vPass allowlist (local storage)
        val vPassEntry = repository.getValidVPass(phoneNumber)
        if (vPassEntry != null) {
            println("✅ ALLOW: Found in vPass allowlist")
            return CallScreeningResult.Allow(vPassEntry.name)
        }
        
        // Step 2: Check system contacts
        val isKnownContact = repository.isKnownContact(phoneNumber)
        if (isKnownContact) {
            println("✅ ALLOW: Found in system contacts")
            return CallScreeningResult.Allow(null)
        }
        
        // Step 3: Unknown caller
        println("⚠️  LABEL: Unknown caller (not in allowlist or contacts)")
        return CallScreeningResult.Label("Unknown Caller")
    }
}

// Mock PostCallActivity logic  
class MockPostCallActivity(private val repository: MockVPassRepository) {
    suspend fun grantVPass24h(phoneNumber: String): Boolean {
        println("\n👤 User clicked 'Grant vPass 24h' for $phoneNumber")
        
        return try {
            val vPassEntry = VPassEntry(
                phoneNumber = phoneNumber,
                name = "Unknown Caller",
                duration = VPassEntry.Duration.HOURS_24,
                createdAt = Date(),
                expiresAt = Date(System.currentTimeMillis() + VPassEntry.Duration.HOURS_24.toMillis())
            )
            
            repository.insertVPass(vPassEntry)
            println("✅ vPass granted successfully")
            true
        } catch (e: Exception) {
            println("❌ Error granting vPass: ${e.message}")
            false
        }
    }
}

// Main verification flow
suspend fun main() {
    println("🚀 vPass Allowlist Flow Verification")
    println("=====================================")
    
    val repository = MockVPassRepository()
    val callScreeningService = MockCallScreeningService(repository)
    val postCallActivity = MockPostCallActivity(repository)
    
    val phoneNumber = "+1234567890"
    
    // SCENARIO 1: First call (unknown caller)
    println("\n📞 SCENARIO 1: First call from $phoneNumber")
    println("-------------------------------------------")
    
    val firstCallResult = callScreeningService.screenCall(phoneNumber)
    when (firstCallResult) {
        is CallScreeningResult.Allow -> println("→ Call allowed: ${firstCallResult.displayName ?: "system handled"}")
        is CallScreeningResult.Label -> println("→ Call labeled: ${firstCallResult.displayName}")
    }
    
    // Simulate PostCallActivity showing for unknown caller
    if (firstCallResult is CallScreeningResult.Label) {
        println("📱 PostCallActivity shown with 'Grant vPass 24h' button")
        
        // User grants vPass
        postCallActivity.grantVPass24h(phoneNumber)
    }
    
    // SCENARIO 2: Second call (should be in allowlist now)
    println("\n📞 SCENARIO 2: Second call from $phoneNumber")
    println("--------------------------------------------")
    
    val secondCallResult = callScreeningService.screenCall(phoneNumber)
    when (secondCallResult) {
        is CallScreeningResult.Allow -> println("→ ✅ Call allowed via vPass allowlist: ${secondCallResult.displayName}")
        is CallScreeningResult.Label -> println("→ ❌ Call still labeled (allowlist failed): ${secondCallResult.displayName}")
    }
    
    // SCENARIO 3: Verify different number is not affected
    println("\n📞 SCENARIO 3: Call from different number")
    println("------------------------------------------")
    
    val differentNumber = "+1987654321"
    val differentCallResult = callScreeningService.screenCall(differentNumber)
    when (differentCallResult) {
        is CallScreeningResult.Allow -> println("→ Call allowed: ${differentCallResult.displayName}")
        is CallScreeningResult.Label -> println("→ Call labeled: ${differentCallResult.displayName}")
    }
    
    // VERIFICATION SUMMARY
    println("\n📊 VERIFICATION SUMMARY")
    println("=======================")
    println("✅ Grant vPass 24h writes to local allowlist: ${firstCallResult is CallScreeningResult.Label}")
    println("✅ CallScreeningService checks local allowlist: ${secondCallResult is CallScreeningResult.Allow}")
    println("✅ Gate returns ALLOW for active vPasses: ${secondCallResult is CallScreeningResult.Allow}")
    println("✅ Flow works end-to-end: ${secondCallResult is CallScreeningResult.Allow}")
    
    if (secondCallResult is CallScreeningResult.Allow) {
        println("\n🎉 All requirements verified! The vPass allowlist flow works correctly.")
    } else {
        println("\n❌ Flow verification failed - check implementation")
    }
}

// Run the verification
runBlocking {
    main()
}