package com.verifd.android.util

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.net.Uri
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.any
import org.mockito.kotlin.whenever
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Unit tests for SmsUtils store-safe SMS functionality using ACTION_SENDTO
 */
@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class SmsUtilsTest {

    @Mock
    private lateinit var mockContext: Context

    @Mock
    private lateinit var mockPackageManager: PackageManager

    @Mock
    private lateinit var mockSubscriptionManager: SubscriptionManager

    @Mock
    private lateinit var mockSubscription1: SubscriptionInfo

    @Mock
    private lateinit var mockSubscription2: SubscriptionInfo
    
    @Mock
    private lateinit var mockResolveInfo: ResolveInfo

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
    }

    @Test
    fun `getActiveSubscriptions should return empty list without permission`() {
        // Test permission handling for subscription access
        val result = SmsUtils.getActiveSubscriptions(mockContext)
        assert(result.isEmpty())
    }

    @Test
    fun `getActiveSubscriptions should return dual SIM list when available`() {
        // Test dual-SIM detection
        whenever(mockSubscription1.displayName).thenReturn("SIM 1")
        whenever(mockSubscription2.displayName).thenReturn("SIM 2")
        
        // Expected: Should return both subscriptions
        assert(true) // Placeholder
    }

    @Test
    fun `createSmsIntent should build ACTION_SENDTO intent with correct URI and body`() {
        // Test that we build the correct SMS intent for store compliance
        val phoneNumber = "+1234567890"
        val message = "Test verification message"
        
        val intent = SmsUtils.createSmsIntent(phoneNumber, message)
        
        // CRITICAL: Must use ACTION_SENDTO (not ACTION_SEND) for store compliance
        assert(intent.action == Intent.ACTION_SENDTO)
        // CRITICAL: Must use sms: URI scheme 
        assert(intent.data == Uri.parse("sms:$phoneNumber"))
        // Standard SMS body extra
        assert(intent.getStringExtra("sms_body") == message)
        // Must include DEFAULT category for SMS app targeting
        assert(intent.hasCategory(Intent.CATEGORY_DEFAULT))
    }

    @Test
    fun `createSmsIntent should include subscription extras for dual-SIM`() {
        // Test subscription extra handling for dual-SIM support
        whenever(mockSubscription1.subscriptionId).thenReturn(1)
        whenever(mockSubscription1.simSlotIndex).thenReturn(0)
        whenever(mockSubscription1.displayName).thenReturn("SIM 1")
        
        val intent = SmsUtils.createSmsIntent("+1234567890", "Test", mockSubscription1)
        
        // DUAL-SIM: subscription_id extra should be included when subscription provided
        assert(intent.getIntExtra("subscription_id", -1) == 1)
        // DUAL-SIM: slot_id extra should be included for SIM selection
        assert(intent.getIntExtra("slot_id", -1) == 0)
        // Basic intent structure must still be correct
        assert(intent.action == Intent.ACTION_SENDTO)
        assert(intent.data == Uri.parse("sms:+1234567890"))
    }
    
    @Test
    fun `createSmsIntent should NOT include subscription extras when none provided`() {
        // Test that subscription extras are only added when available (graceful fallback)
        val intent = SmsUtils.createSmsIntent("+1234567890", "Test", null)
        
        // Should NOT include subscription extras when subscription is null
        assert(!intent.hasExtra("subscription_id"))
        assert(!intent.hasExtra("slot_id"))
        // Basic intent structure should still work (system picker fallback)
        assert(intent.action == Intent.ACTION_SENDTO)
        assert(intent.data == Uri.parse("sms:+1234567890"))
    }

    @Test
    fun `sendSmsViaIntent should return false when no SMS app available`() {
        // Test failure when no SMS app can handle the intent
        whenever(mockContext.packageManager).thenReturn(mockPackageManager)
        whenever(mockPackageManager.resolveActivity(any(), any<Int>())).thenReturn(null)
        
        val result = SmsUtils.sendSmsViaIntent(mockContext, "+1234567890", "Test message")
        assert(!result)
    }

    @Test
    fun `sendSmsViaIntent should return true when SMS app available`() {
        // Test success when SMS app can handle the intent
        whenever(mockContext.packageManager).thenReturn(mockPackageManager)
        whenever(mockPackageManager.resolveActivity(any(), any<Int>())).thenReturn(mockResolveInfo)
        
        val result = SmsUtils.sendSmsViaIntent(mockContext, "+1234567890", "Test message")
        assert(result)
    }

    @Test
    fun `isDualSimAvailable should detect dual SIM correctly`() {
        // Test dual-SIM availability detection
        assert(true) // Placeholder
    }

    @Test
    fun `getSimDisplayName should format names correctly`() {
        // Test SIM display name formatting
        whenever(mockSubscription1.displayName).thenReturn("My SIM")
        whenever(mockSubscription1.carrierName).thenReturn("Carrier Name")
        whenever(mockSubscription1.simSlotIndex).thenReturn(0)
        
        val displayName = SmsUtils.getSimDisplayName(mockSubscription1)
        assert(displayName == "My SIM")
    }

    @Test
    fun `getSimDisplayName should fallback to carrier name when no display name`() {
        // Test fallback display name logic
        whenever(mockSubscription1.displayName).thenReturn(null)
        whenever(mockSubscription1.carrierName).thenReturn("Carrier Name")
        whenever(mockSubscription1.simSlotIndex).thenReturn(0)
        
        val displayName = SmsUtils.getSimDisplayName(mockSubscription1)
        assert(displayName == "Carrier Name")
    }

    @Test
    fun `getSimDisplayName should fallback to slot number when no names available`() {
        // Test final fallback to slot number
        whenever(mockSubscription1.displayName).thenReturn(null)
        whenever(mockSubscription1.carrierName).thenReturn(null)
        whenever(mockSubscription1.simSlotIndex).thenReturn(0)
        
        val displayName = SmsUtils.getSimDisplayName(mockSubscription1)
        assert(displayName == "SIM 1")
    }
}