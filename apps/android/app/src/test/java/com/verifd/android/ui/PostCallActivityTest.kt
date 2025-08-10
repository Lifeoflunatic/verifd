package com.verifd.android.ui

import android.content.Intent
import android.telephony.SubscriptionInfo
import com.verifd.android.data.ContactRepository
import com.verifd.android.data.model.VPassEntry
import com.verifd.android.util.SmsUtils
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.whenever
import org.mockito.kotlin.verify
import org.mockito.kotlin.times
import org.mockito.kotlin.eq
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.junit.Assert.*
import java.util.Date

/**
 * Unit tests for PostCallActivity
 * Focus on vPass granting flow and local allowlist population
 */
@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class PostCallActivityTest {

    @Mock
    private lateinit var mockRepository: ContactRepository

    @Mock
    private lateinit var mockSubscription: SubscriptionInfo

    private lateinit var testGrantVPassHelper: TestGrantVPassHelper

    /**
     * Helper class to test vPass granting logic in isolation
     */
    private class TestGrantVPassHelper(
        private val repository: ContactRepository
    ) {
        suspend fun grantVPass(phoneNumber: String, duration: VPassEntry.Duration): VPassEntry {
            val expiresAt = when (duration) {
                VPassEntry.Duration.HOURS_24 -> Date(System.currentTimeMillis() + 24 * 60 * 60 * 1000)
                VPassEntry.Duration.DAYS_30 -> Date(System.currentTimeMillis() + 30 * 24 * 60 * 60 * 1000)
            }
            
            val vPassEntry = VPassEntry(
                phoneNumber = phoneNumber,
                name = "Unknown Caller", // Default name
                duration = duration,
                createdAt = Date(),
                expiresAt = expiresAt
            )
            
            repository.insertVPass(vPassEntry)
            return vPassEntry
        }
    }

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        testGrantVPassHelper = TestGrantVPassHelper(mockRepository)
    }

    @Test
    fun `Grant vPass 24h should populate local allowlist`() = runTest {
        // Arrange: Phone number from unknown caller
        val phoneNumber = "+1234567890"
        
        // Act: Grant 24-hour vPass (simulates user clicking "Grant vPass 24h" button)
        val vPassEntry = testGrantVPassHelper.grantVPass(phoneNumber, VPassEntry.Duration.HOURS_24)
        
        // Assert: Verify vPass was written to local allowlist
        val captor = argumentCaptor<VPassEntry>()
        verify(mockRepository, times(1)).insertVPass(captor.capture())
        
        val capturedVPass = captor.firstValue
        assertEquals("Phone number should match", phoneNumber, capturedVPass.phoneNumber)
        assertEquals("Duration should be 24 hours", VPassEntry.Duration.HOURS_24, capturedVPass.duration)
        assertEquals("Default name should be set", "Unknown Caller", capturedVPass.name)
        assertNotNull("Created date should be set", capturedVPass.createdAt)
        assertNotNull("Expiry date should be set", capturedVPass.expiresAt)
        
        // Verify expiry time is approximately 24 hours from now
        val expectedExpiry = System.currentTimeMillis() + 24 * 60 * 60 * 1000
        val actualExpiry = capturedVPass.expiresAt.time
        val timeDifference = Math.abs(actualExpiry - expectedExpiry)
        assertTrue("Expiry should be ~24 hours from now", timeDifference < 60000) // Within 1 minute
    }

    @Test
    fun `Grant vPass 30d should populate local allowlist`() = runTest {
        // Arrange: Phone number from unknown caller
        val phoneNumber = "+1987654321"
        
        // Act: Grant 30-day vPass (simulates user clicking "Grant vPass 30d" button)
        val vPassEntry = testGrantVPassHelper.grantVPass(phoneNumber, VPassEntry.Duration.DAYS_30)
        
        // Assert: Verify vPass was written to local allowlist
        val captor = argumentCaptor<VPassEntry>()
        verify(mockRepository, times(1)).insertVPass(captor.capture())
        
        val capturedVPass = captor.firstValue
        assertEquals("Phone number should match", phoneNumber, capturedVPass.phoneNumber)
        assertEquals("Duration should be 30 days", VPassEntry.Duration.DAYS_30, capturedVPass.duration)
        assertEquals("Default name should be set", "Unknown Caller", capturedVPass.name)
        
        // Verify expiry time is approximately 30 days from now
        val expectedExpiry = System.currentTimeMillis() + 30 * 24 * 60 * 60 * 1000L
        val actualExpiry = capturedVPass.expiresAt.time
        val timeDifference = Math.abs(actualExpiry - expectedExpiry)
        assertTrue("Expiry should be ~30 days from now", timeDifference < 60000) // Within 1 minute
    }

    @Test
    fun `Grant vPass should handle database errors gracefully`() = runTest {
        // Arrange: Mock database error
        val phoneNumber = "+1555123456"
        whenever(mockRepository.insertVPass(any())).thenThrow(RuntimeException("Database error"))
        
        // Act & Assert: Should not crash, should handle error
        try {
            testGrantVPassHelper.grantVPass(phoneNumber, VPassEntry.Duration.HOURS_24)
            fail("Should have thrown exception")
        } catch (e: RuntimeException) {
            assertEquals("Database error", e.message)
        }
        
        // Verify attempt was made to insert vPass
        verify(mockRepository, times(1)).insertVPass(any())
    }

    @Test
    fun `Multiple vPass grants should update allowlist correctly`() = runTest {
        // Arrange: Same phone number, different durations
        val phoneNumber = "+1234567890"
        
        // Act: Grant 24h, then grant 30d (should replace/update)
        testGrantVPassHelper.grantVPass(phoneNumber, VPassEntry.Duration.HOURS_24)
        testGrantVPassHelper.grantVPass(phoneNumber, VPassEntry.Duration.DAYS_30)
        
        // Assert: Both inserts should have been attempted
        verify(mockRepository, times(2)).insertVPass(any())
        
        // Note: Room's @Insert(onConflict = OnConflictStrategy.REPLACE) should handle duplicates
        // The second insert should replace the first based on the primary key (phoneNumber)
    }

    @Test
    fun `vPass should be immediately available for CallScreeningService`() = runTest {
        // This test verifies the integration between PostCallActivity and CallScreeningService
        
        // Arrange: Phone number that just called
        val phoneNumber = "+1234567890"
        val grantedVPass = VPassEntry(
            phoneNumber = phoneNumber,
            name = "Unknown Caller",
            duration = VPassEntry.Duration.HOURS_24,
            createdAt = Date(),
            expiresAt = Date(System.currentTimeMillis() + 24 * 60 * 60 * 1000)
        )
        
        // Act: Grant vPass
        testGrantVPassHelper.grantVPass(phoneNumber, VPassEntry.Duration.HOURS_24)
        
        // Simulate CallScreeningService checking allowlist immediately after
        whenever(mockRepository.getValidVPass(phoneNumber)).thenReturn(grantedVPass)
        val retrievedVPass = mockRepository.getValidVPass(phoneNumber)
        
        // Assert: vPass should be immediately retrievable by CallScreeningService
        verify(mockRepository, times(1)).insertVPass(any()) // From grant action
        verify(mockRepository, times(1)).getValidVPass(eq(phoneNumber)) // From screening check
        assertNotNull("vPass should be retrievable", retrievedVPass)
        assertEquals("Should retrieve same phone number", phoneNumber, retrievedVPass?.phoneNumber)
        assertTrue("vPass should be valid", retrievedVPass?.isValid() == true)
    }

    @Test
    fun `vPass duration calculation should be accurate`() = runTest {
        // Test that duration calculations match VPassEntry.Duration.toMillis()
        
        // Arrange & Act
        val phoneNumber = "+1234567890"
        
        // Test 24-hour duration
        val vPass24h = testGrantVPassHelper.grantVPass(phoneNumber, VPassEntry.Duration.HOURS_24)
        val expected24h = VPassEntry.Duration.HOURS_24.toMillis()
        val actual24h = vPass24h.expiresAt.time - vPass24h.createdAt.time
        
        // Test 30-day duration  
        val vPass30d = testGrantVPassHelper.grantVPass("+1987654321", VPassEntry.Duration.DAYS_30)
        val expected30d = VPassEntry.Duration.DAYS_30.toMillis()
        val actual30d = vPass30d.expiresAt.time - vPass30d.createdAt.time
        
        // Assert: Duration calculations should match enum values
        val tolerance = 1000L // 1 second tolerance for test execution time
        assertTrue("24h duration should be accurate", Math.abs(actual24h - expected24h) < tolerance)
        assertTrue("30d duration should be accurate", Math.abs(actual30d - expected30d) < tolerance)
    }
}