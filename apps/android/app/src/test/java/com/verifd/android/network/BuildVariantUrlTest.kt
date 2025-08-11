package com.verifd.android.network

import com.verifd.android.BuildConfig
import org.junit.Test
import org.junit.Assert.*

/**
 * Unit tests to verify correct backend URLs per build variant
 */
class BuildVariantUrlTest {

    @Test
    fun `debug build should use local backend URL`() {
        if (BuildConfig.BUILD_TYPE == "debug") {
            assertEquals(
                "Debug build should point to local backend",
                "http://10.0.2.2:3000", // Android emulator localhost
                BuildConfig.BASE_URL
            )
        }
    }

    @Test
    fun `release build should use production backend URL`() {
        if (BuildConfig.BUILD_TYPE == "release") {
            assertEquals(
                "Release build should point to production backend",
                "https://api.verifd.com",
                BuildConfig.BASE_URL
            )
        }
    }

    @Test
    fun `staging build should use staging backend URL`() {
        if (BuildConfig.BUILD_TYPE == "staging") {
            assertEquals(
                "Staging build should point to staging backend",
                "https://staging-api.verifd.com",
                BuildConfig.BASE_URL
            )
        }
    }

    @Test
    fun `BASE_URL should never be empty`() {
        assertNotNull("BASE_URL must be defined", BuildConfig.BASE_URL)
        assertTrue("BASE_URL must not be empty", BuildConfig.BASE_URL.isNotEmpty())
    }

    @Test
    fun `BASE_URL should be valid URL format`() {
        val url = BuildConfig.BASE_URL
        assertTrue(
            "BASE_URL must start with http:// or https://",
            url.startsWith("http://") || url.startsWith("https://")
        )
        
        // Check for basic URL structure
        val pattern = Regex("^https?://[a-zA-Z0-9.-]+(:[0-9]+)?(/.*)?$")
        assertTrue(
            "BASE_URL must be a valid URL format: $url",
            pattern.matches(url)
        )
    }

    @Test
    fun `verify environment-specific features are configured`() {
        when (BuildConfig.BUILD_TYPE) {
            "debug" -> {
                assertTrue("Debug builds should have debugging enabled", BuildConfig.DEBUG)
            }
            "release" -> {
                assertFalse("Release builds should have debugging disabled", BuildConfig.DEBUG)
            }
            "staging" -> {
                // Staging may have debug enabled for testing
                // No strict assertion here
            }
        }
    }

    @Test
    fun `application ID should match build variant`() {
        val expectedSuffix = when (BuildConfig.BUILD_TYPE) {
            "debug" -> ".debug"
            "staging" -> ".staging"
            "release" -> ""
            else -> ""
        }
        
        if (expectedSuffix.isNotEmpty()) {
            assertTrue(
                "Application ID should have suffix for non-release builds",
                BuildConfig.APPLICATION_ID.endsWith(expectedSuffix)
            )
        }
    }
}