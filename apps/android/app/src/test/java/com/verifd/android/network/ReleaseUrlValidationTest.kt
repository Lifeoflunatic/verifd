package com.verifd.android.network

import com.verifd.android.BuildConfig
import org.junit.Assert.*
import org.junit.Test

/**
 * Release URL Safety Test
 * 
 * CRITICAL: These tests ensure production builds use the correct API endpoint.
 * CI will fail if release builds don't point to https://api.verifd.com
 */
class ReleaseUrlValidationTest {
    
    @Test
    fun testReleaseUrlIsProduction() {
        // This test is specifically for release builds
        if (BuildConfig.BUILD_TYPE == "release") {
            assertEquals(
                "Release build must use production API",
                "https://api.verifd.com",
                BuildConfig.API_BASE_URL
            )
            
            // Ensure no development URLs
            assertFalse(
                "Release build cannot contain localhost",
                BuildConfig.API_BASE_URL.contains("localhost")
            )
            assertFalse(
                "Release build cannot contain emulator URL",
                BuildConfig.API_BASE_URL.contains("10.0.2.2")
            )
            assertFalse(
                "Release build cannot contain staging URL",
                BuildConfig.API_BASE_URL.contains("staging")
            )
        }
    }
    
    @Test
    fun testDebugUrlIsLocal() {
        // Debug builds should use local/emulator URL
        if (BuildConfig.BUILD_TYPE == "debug") {
            assertTrue(
                "Debug build should use local development URL",
                BuildConfig.API_BASE_URL.contains("10.0.2.2:3000") ||
                BuildConfig.API_BASE_URL.contains("localhost:3000")
            )
        }
    }
    
    @Test
    fun testStagingUrlIsStaging() {
        // Staging builds should use staging URL
        if (BuildConfig.BUILD_TYPE == "staging") {
            assertEquals(
                "Staging build must use staging API",
                "https://staging-api.verifd.com",
                BuildConfig.API_BASE_URL
            )
        }
    }
    
    @Test
    fun testUrlProtocolSecurity() {
        // Production and staging must use HTTPS
        if (BuildConfig.BUILD_TYPE in listOf("release", "staging")) {
            assertTrue(
                "Production/staging builds must use HTTPS",
                BuildConfig.API_BASE_URL.startsWith("https://")
            )
        }
    }
    
    @Test
    fun testUrlFormat() {
        // Validate URL format
        val url = BuildConfig.API_BASE_URL
        
        // Should not end with slash
        assertFalse(
            "API URL should not end with slash",
            url.endsWith("/")
        )
        
        // Should be a valid URL format
        assertTrue(
            "API URL should be valid format",
            url.matches(Regex("^https?://[\\w.-]+(:\\d+)?$"))
        )
    }
}