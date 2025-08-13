package com.verifd.android.ui

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.telephony.TelephonyManager
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.switchmaterial.SwitchMaterial
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.verifd.android.BuildConfig
import com.verifd.android.R
import com.verifd.android.config.FeatureFlags
import com.verifd.android.data.BackendClient
import com.verifd.android.data.ContactRepository
import com.verifd.android.data.ExpectingWindowManager
import com.verifd.android.data.model.VPassEntry
import com.verifd.android.notification.MissedCallNotificationManager
import com.verifd.android.service.CallScreeningService
import com.verifd.android.telemetry.PrivacyTelemetry
import com.verifd.android.util.PhoneNumberUtils
import kotlinx.coroutines.*
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

/**
 * QA Panel V2 - Enhanced debug panel for staging builds
 * Features:
 * - Test notification actions
 * - Simulate calls/passes
 * - View/clear telemetry
 * - Force crashes for testing
 * - Template testing
 * - Rate limit testing
 */
class QAPanelV2Activity : AppCompatActivity() {
    
    companion object {
        private const val TAG = "QAPanelV2"
        private const val REQUEST_CODE_CALL_SCREENING = 1001
        private const val PREFS_NAME = "qa_panel_prefs"
        private const val TEST_NOTIFICATION_ID = 9999
    }
    
    private lateinit var prefs: SharedPreferences
    private lateinit var repository: ContactRepository
    private lateinit var telemetry: PrivacyTelemetry
    private lateinit var backendClient: BackendClient
    private lateinit var expectingManager: ExpectingWindowManager
    
    private val coroutineScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    // UI Components
    private lateinit var tabHost: TabHost
    private lateinit var vPassRecyclerView: RecyclerView
    private lateinit var telemetryRecyclerView: RecyclerView
    private lateinit var configTextView: TextView
    private lateinit var statusTextView: TextView
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Only allow in staging builds
        if (!BuildConfig.BUILD_VARIANT.contains("staging")) {
            Toast.makeText(this, "QA Panel only available in staging", Toast.LENGTH_SHORT).show()
            finish()
            return
        }
        
        setContentView(R.layout.activity_qa_panel_v2)
        
        // Initialize dependencies
        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        repository = ContactRepository.getInstance(this)
        telemetry = PrivacyTelemetry(this)
        backendClient = BackendClient.getInstance(this)
        expectingManager = ExpectingWindowManager.getInstance(this)
        
        setupTabs()
        setupMainTab()
        setupNotificationTab()
        setupDataTab()
        setupTemplateTab()
        setupCrashTab()
        
        // Load initial data
        refreshStatus()
    }
    
    private fun setupTabs() {
        tabHost = findViewById(R.id.qa_tab_host)
        tabHost.setup()
        
        // Main tab
        val mainSpec = tabHost.newTabSpec("main")
        mainSpec.setContent(R.id.tab_main)
        mainSpec.setIndicator("Main")
        tabHost.addTab(mainSpec)
        
        // Notifications tab
        val notifSpec = tabHost.newTabSpec("notif")
        notifSpec.setContent(R.id.tab_notifications)
        notifSpec.setIndicator("Notif")
        tabHost.addTab(notifSpec)
        
        // Data tab
        val dataSpec = tabHost.newTabSpec("data")
        dataSpec.setContent(R.id.tab_data)
        dataSpec.setIndicator("Data")
        tabHost.addTab(dataSpec)
        
        // Templates tab
        val templateSpec = tabHost.newTabSpec("templates")
        templateSpec.setContent(R.id.tab_templates)
        templateSpec.setIndicator("Templates")
        tabHost.addTab(templateSpec)
        
        // Crash tab
        val crashSpec = tabHost.newTabSpec("crash")
        crashSpec.setContent(R.id.tab_crash)
        crashSpec.setIndicator("Crash")
        tabHost.addTab(crashSpec)
    }
    
    private fun setupMainTab() {
        statusTextView = findViewById(R.id.status_text)
        configTextView = findViewById(R.id.config_text)
        
        // Quick settings shortcuts
        findViewById<Button>(R.id.btn_notification_settings).setOnClickListener {
            openNotificationSettings()
        }
        
        findViewById<Button>(R.id.btn_call_screening).setOnClickListener {
            openCallScreeningSettings()
        }
        
        findViewById<Button>(R.id.btn_app_info).setOnClickListener {
            openAppInfo()
        }
        
        findViewById<Button>(R.id.btn_clear_cache).setOnClickListener {
            clearAppCache()
        }
        
        // Reset Setup button (for staging builds)
        findViewById<Button>(R.id.btn_reset_setup).setOnClickListener {
            resetFirstRunSetup()
        }
        
        // Feature toggles
        val featureChips = findViewById<ChipGroup>(R.id.feature_chips)
        
        val missedCallChip = Chip(this).apply {
            text = "Missed Call Actions"
            isCheckable = true
            isChecked = FeatureFlags.isMissedCallActionsEnabled
            setOnCheckedChangeListener { _, isChecked ->
                FeatureFlags.isMissedCallActionsEnabled = isChecked
                prefs.edit().putBoolean("missed_call_actions", isChecked).apply()
            }
        }
        featureChips.addView(missedCallChip)
        
        val expectingChip = Chip(this).apply {
            text = "Expecting Window"
            isCheckable = true
            isChecked = FeatureFlags.isExpectingWindowEnabled
            setOnCheckedChangeListener { _, isChecked ->
                FeatureFlags.isExpectingWindowEnabled = isChecked
                prefs.edit().putBoolean("expecting_window", isChecked).apply()
            }
        }
        featureChips.addView(expectingChip)
        
        val postCallChip = Chip(this).apply {
            text = "Post Call Actions"
            isCheckable = true
            isChecked = FeatureFlags.isPostCallActionsEnabled
            setOnCheckedChangeListener { _, isChecked ->
                FeatureFlags.isPostCallActionsEnabled = isChecked
                prefs.edit().putBoolean("post_call_actions", isChecked).apply()
            }
        }
        featureChips.addView(postCallChip)
        
        // QA Reject+Hide UI toggle (Feature A)
        val rejectHideChip = Chip(this).apply {
            text = "Reject+Hide Unknowns"
            isCheckable = true
            isChecked = prefs.getBoolean("qa_reject_hide_ui", true)
            setOnCheckedChangeListener { _, isChecked ->
                prefs.edit().putBoolean("qa_reject_hide_ui", isChecked).apply()
                android.util.Log.d(TAG, "QA Reject+Hide UI mode: ${if (isChecked) "ENABLED" else "DISABLED"}")
            }
        }
        featureChips.addView(rejectHideChip)
        
        // Refresh button
        findViewById<Button>(R.id.btn_refresh_status).setOnClickListener {
            refreshStatus()
        }
    }
    
    private fun setupNotificationTab() {
        // Test notification with actions
        findViewById<Button>(R.id.btn_test_notification).setOnClickListener {
            showTestNotification()
        }
        
        // Test each action individually
        findViewById<Button>(R.id.btn_test_sms).setOnClickListener {
            testSmsAction()
        }
        
        findViewById<Button>(R.id.btn_test_whatsapp).setOnClickListener {
            testWhatsAppAction()
        }
        
        findViewById<Button>(R.id.btn_test_copy).setOnClickListener {
            testCopyAction()
        }
        
        // Template fetching test
        val phoneInput = findViewById<TextInputEditText>(R.id.test_phone_input)
        findViewById<Button>(R.id.btn_fetch_templates).setOnClickListener {
            val phone = phoneInput.text?.toString() ?: ""
            if (phone.isNotEmpty()) {
                fetchTemplates(phone)
            } else {
                Toast.makeText(this, "Enter a phone number", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private fun setupDataTab() {
        vPassRecyclerView = findViewById(R.id.vpass_recycler)
        telemetryRecyclerView = findViewById(R.id.telemetry_recycler)
        
        vPassRecyclerView.layoutManager = LinearLayoutManager(this)
        telemetryRecyclerView.layoutManager = LinearLayoutManager(this)
        
        // Load vPasses
        findViewById<Button>(R.id.btn_refresh_vpasses).setOnClickListener {
            loadVPasses()
        }
        
        // Clear all vPasses
        findViewById<Button>(R.id.btn_clear_vpasses).setOnClickListener {
            clearAllVPasses()
        }
        
        // Load telemetry
        findViewById<Button>(R.id.btn_refresh_telemetry).setOnClickListener {
            loadTelemetry()
        }
        
        // Clear telemetry
        findViewById<Button>(R.id.btn_clear_telemetry).setOnClickListener {
            clearTelemetry()
        }
        
        // Create test vPass
        findViewById<Button>(R.id.btn_create_test_vpass).setOnClickListener {
            createTestVPass()
        }
        
        // Initial load
        loadVPasses()
        loadTelemetry()
    }
    
    private fun setupTemplateTab() {
        val templateOutput = findViewById<TextView>(R.id.template_output)
        val localeSpinner = findViewById<Spinner>(R.id.locale_spinner)
        val phoneInput = findViewById<TextInputEditText>(R.id.template_phone_input)
        val nameInput = findViewById<TextInputEditText>(R.id.template_name_input)
        
        // Setup locale spinner
        val locales = arrayOf("en-US", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja-JP", "zh-CN")
        localeSpinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, locales)
        
        // Generate template button
        findViewById<Button>(R.id.btn_generate_template).setOnClickListener {
            val phone = phoneInput.text?.toString() ?: "+1234567890"
            val name = nameInput.text?.toString() ?: "Test User"
            val locale = localeSpinner.selectedItem?.toString() ?: "en-US"
            
            coroutineScope.launch {
                try {
                    val result = backendClient.fetchMessageTemplates(phone, name, locale)
                    when (result) {
                        is BackendClient.MessageTemplatesResult.Success -> {
                            templateOutput.text = """
                                ✅ Templates Generated
                                
                                SMS (${result.smsTemplate.length} chars):
                                ${result.smsTemplate}
                                
                                WhatsApp:
                                ${result.whatsAppTemplate}
                                
                                Link:
                                ${result.verifyLink}
                                
                                Cached: ${result.cached}
                                TTL: ${result.ttlSeconds}s
                            """.trimIndent()
                        }
                        is BackendClient.MessageTemplatesResult.RateLimited -> {
                            templateOutput.text = "⚠️ Rate limited. Retry after ${result.retryAfterSeconds}s"
                        }
                        is BackendClient.MessageTemplatesResult.Error -> {
                            templateOutput.text = "❌ Error: ${result.message}"
                        }
                    }
                } catch (e: Exception) {
                    templateOutput.text = "❌ Exception: ${e.message}"
                }
            }
        }
        
        // Test rate limiting
        findViewById<Button>(R.id.btn_test_rate_limit).setOnClickListener {
            testRateLimiting()
        }
    }
    
    private fun setupCrashTab() {
        // Force crashes for testing
        findViewById<Button>(R.id.btn_crash_nullpointer).setOnClickListener {
            @Suppress("NULLABILITY_MISMATCH_BASED_ON_JAVA_ANNOTATIONS")
            val nullString: String? = null
            nullString!!.length // Force NPE
        }
        
        findViewById<Button>(R.id.btn_crash_arrayindex).setOnClickListener {
            val array = intArrayOf(1, 2, 3)
            val value = array[10] // Force ArrayIndexOutOfBoundsException
        }
        
        findViewById<Button>(R.id.btn_crash_oom).setOnClickListener {
            val list = mutableListOf<ByteArray>()
            while (true) {
                list.add(ByteArray(10_000_000)) // Force OOM
            }
        }
        
        findViewById<Button>(R.id.btn_crash_anr).setOnClickListener {
            // Block UI thread for 10 seconds
            Thread.sleep(10000)
        }
        
        findViewById<Button>(R.id.btn_crash_security).setOnClickListener {
            // Try to access restricted file
            val file = java.io.File("/system/build.prop")
            file.readText() // May throw SecurityException
        }
    }
    
    private fun refreshStatus() {
        coroutineScope.launch {
            try {
                val status = StringBuilder()
                
                // Task 2e: Enhanced QA header with live branch and suppression results
                status.append("📱 Build Info
")
                status.append("Version: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})
")
                status.append("Build Type: ${BuildConfig.BUILD_TYPE}
")
                status.append("Branch: feat/zod-row-typing
") // Hardcoded for now, would be injected at build time
                status.append("Application ID: ${BuildConfig.APPLICATION_ID}\n")
                status.append("SDK: ${Build.VERSION.SDK_INT} (Android ${Build.VERSION.RELEASE})\n")
                status.append("Debug: ${BuildConfig.DEBUG}\n")
                status.append("\n")
                
                // API Configuration
                status.append("🌐 API Configuration\n")
                status.append("Base URL: ${BuildConfig.BASE_URL}\n")
                status.append("KID: staging-2025-001\n") // Would be fetched from config in real app
                status.append("Override Users: +919233600392, +917575854485\n")
                status.append("\n")
                
                // Permissions
                status.append("🔐 Permissions\n")
                val permissions = mapOf(
                    "Phone" to Manifest.permission.READ_PHONE_STATE,
                    "SMS" to Manifest.permission.SEND_SMS,
                    "Contacts" to Manifest.permission.READ_CONTACTS,
                    "Notifications" to if (Build.VERSION.SDK_INT >= 33) Manifest.permission.POST_NOTIFICATIONS else null
                )
                
                permissions.forEach { (name, perm) ->
                    if (perm != null) {
                        val granted = ActivityCompat.checkSelfPermission(this@QAPanelV2Activity, perm) == 
                            PackageManager.PERMISSION_GRANTED
                        status.append("$name: ${if (granted) "✅" else "❌"}\n")
                    }
                }
                status.append("\n")
                
                // Call screening role & notifications
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val hasRole = CallScreeningService.hasCallScreeningRole(this@QAPanelV2Activity)
                    status.append("📞 Call Screening: ${if (hasRole) "✅ Active" else "❌ Inactive"}\n")
                    status.append("Role Holder: ${if (hasRole) "true" else "false"}\n")
                } else {
                    status.append("📞 Call Screening: Pre-Android 10\n")
                }
                
                val notificationsEnabled = NotificationManagerCompat.from(this@QAPanelV2Activity).areNotificationsEnabled()
                status.append("🔔 Notifications: ${if (notificationsEnabled) "ON" else "OFF"}\n")
                
                // QA Reject+Hide mode status & live results
                val qaRejectHideUI = prefs.getBoolean("qa_reject_hide_ui", true)
                status.append("🚫 QA Reject+Hide Mode: ${if (qaRejectHideUI) "ENABLED" else "DISABLED"}
")
                
                // Task 2e: Live suppression results
                val suppressCount = prefs.getInt("suppress_ui_success_count", 0)
                val suppressFails = prefs.getInt("suppress_ui_fail_count", 0)
                val lastSuppressTime = prefs.getLong("last_suppress_time", 0)
                
                status.append("
📊 Live Suppression Results
")
                status.append("✅ Successful: $suppressCount
")
                status.append("❌ Failed: $suppressFails
")
                if (lastSuppressTime > 0) {
                    val timeSince = System.currentTimeMillis() - lastSuppressTime
                    val seconds = timeSince / 1000
                    val minutes = seconds / 60
                    if (minutes > 0) {
                        status.append("⏱ Last: ${minutes}m ago
")
                    } else {
                        status.append("⏱ Last: ${seconds}s ago
")
                    }
                }
                
                // Feature flags summary
                status.append("\n🚩 Feature Flags\n")
                status.append("Missed Call Actions: ${if (FeatureFlags.isMissedCallActionsEnabled) "ON" else "OFF"}\n")
                status.append("Silence Unknowns: ${if (FeatureFlags.isSilenceUnknownCallersEnabled) "ON" else "OFF"}\n")
                status.append("Post Call Actions: ${if (FeatureFlags.isPostCallActionsEnabled) "ON" else "OFF"}\n")
                
                // Device info
                status.append("\n🔧 Device\n")
                status.append("Model: ${Build.MODEL}\n")
                status.append("Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})\n")
                
                // Network info
                val tm = getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
                tm?.let {
                    status.append("Carrier: ${it.networkOperatorName}\n")
                }
                
                withContext(Dispatchers.Main) {
                    statusTextView.text = status.toString()
                }
                
                // Fetch config
                fetchConfiguration()
                
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    statusTextView.text = "Error: ${e.message}"
                }
            }
        }
    }
    
    private fun fetchConfiguration() {
        coroutineScope.launch {
            try {
                // This would fetch from /config endpoint
                val config = JSONObject().apply {
                    put("kid", "staging-2025-001")
                    put("override_numbers", listOf("+919233600392", "+917575854485"))
                    put("canary_phase", "ga_50")
                    put("feature_flags", JSONObject().apply {
                        put("missed_call_actions", FeatureFlags.isMissedCallActionsEnabled)
                        put("expecting_window", FeatureFlags.isExpectingWindowEnabled)
                        put("post_call_actions", FeatureFlags.isPostCallActionsEnabled)
                    })
                }
                
                withContext(Dispatchers.Main) {
                    configTextView.text = config.toString(2)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    configTextView.text = "Config error: ${e.message}"
                }
            }
        }
    }
    
    private fun showTestNotification() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "verifd_test"
        
        // Create channel
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Test Notifications",
                NotificationManager.IMPORTANCE_HIGH
            )
            manager.createNotificationChannel(channel)
        }
        
        // Create notification with actions
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Test: Missed Call")
            .setContentText("+1 (555) 123-4567 called")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .addAction(android.R.drawable.ic_dialog_email, "SMS", null)
            .addAction(android.R.drawable.ic_menu_send, "WhatsApp", null)
            .addAction(android.R.drawable.ic_menu_save, "Copy", null)
            .build()
        
        manager.notify(TEST_NOTIFICATION_ID, notification)
        Toast.makeText(this, "Test notification shown", Toast.LENGTH_SHORT).show()
    }
    
    private fun testSmsAction() {
        val intent = Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("smsto:+15551234567")
            putExtra("sms_body", "Test SMS from QA Panel")
        }
        
        if (intent.resolveActivity(packageManager) != null) {
            startActivity(intent)
        } else {
            Toast.makeText(this, "No SMS app available", Toast.LENGTH_SHORT).show()
        }
    }
    
    private fun testWhatsAppAction() {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("https://wa.me/15551234567?text=Test%20from%20QA%20Panel")
        }
        
        if (intent.resolveActivity(packageManager) != null) {
            startActivity(intent)
        } else {
            Toast.makeText(this, "WhatsApp not installed", Toast.LENGTH_SHORT).show()
        }
    }
    
    private fun testCopyAction() {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        val clip = android.content.ClipData.newPlainText("verifd", "https://verify.verifd.com/test")
        clipboard.setPrimaryClip(clip)
        Toast.makeText(this, "Link copied to clipboard", Toast.LENGTH_SHORT).show()
    }
    
    private fun fetchTemplates(phoneNumber: String) {
        coroutineScope.launch {
            try {
                val result = backendClient.fetchMessageTemplates(phoneNumber)
                when (result) {
                    is BackendClient.MessageTemplatesResult.Success -> {
                        AlertDialog.Builder(this@QAPanelV2Activity)
                            .setTitle("Templates Fetched")
                            .setMessage("""
                                SMS: ${result.smsTemplate}
                                
                                WhatsApp: ${result.whatsAppTemplate}
                                
                                Link: ${result.verifyLink}
                                
                                Cached: ${result.cached}
                            """.trimIndent())
                            .setPositiveButton("OK", null)
                            .show()
                    }
                    is BackendClient.MessageTemplatesResult.RateLimited -> {
                        Toast.makeText(
                            this@QAPanelV2Activity,
                            "Rate limited. Retry after ${result.retryAfterSeconds}s",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                    is BackendClient.MessageTemplatesResult.Error -> {
                        Toast.makeText(
                            this@QAPanelV2Activity,
                            "Error: ${result.message}",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
            } catch (e: Exception) {
                Toast.makeText(
                    this@QAPanelV2Activity,
                    "Exception: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }
    
    private fun loadVPasses() {
        coroutineScope.launch {
            val passes = withContext(Dispatchers.IO) {
                repository.getAllValidVPasses()
            }
            
            val adapter = VPassAdapter(passes)
            vPassRecyclerView.adapter = adapter
        }
    }
    
    private fun clearAllVPasses() {
        AlertDialog.Builder(this)
            .setTitle("Clear All vPasses?")
            .setMessage("This will delete all stored vPasses")
            .setPositiveButton("Clear") { _, _ ->
                coroutineScope.launch {
                    withContext(Dispatchers.IO) {
                        // Get all passes and delete them one by one
                        val passes = repository.getAllValidVPasses()
                        passes.forEach { pass ->
                            repository.removeVPass(pass.phoneNumber)
                        }
                    }
                    loadVPasses()
                    Toast.makeText(this@QAPanelV2Activity, "vPasses cleared", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun createTestVPass() {
        val vPass = VPassEntry(
            phoneNumber = "+15551234567",
            name = "Test User",
            duration = VPassEntry.Duration.HOURS_24,
            createdAt = Date(),
            expiresAt = Date(System.currentTimeMillis() + 24 * 60 * 60 * 1000)
        )
        
        coroutineScope.launch {
            withContext(Dispatchers.IO) {
                repository.insertVPass(vPass)
            }
            loadVPasses()
            Toast.makeText(this@QAPanelV2Activity, "Test vPass created", Toast.LENGTH_SHORT).show()
        }
    }
    
    private fun loadTelemetry() {
        // Load telemetry events (mock for now)
        val events = listOf(
            TelemetryEvent("FEATURE_USED", "notification_action", Date()),
            TelemetryEvent("PASS_GRANTED", "24h", Date()),
            TelemetryEvent("CALL_SCREENED", "unknown", Date())
        )
        
        val adapter = TelemetryAdapter(events)
        telemetryRecyclerView.adapter = adapter
    }
    
    private fun clearTelemetry() {
        AlertDialog.Builder(this)
            .setTitle("Clear Telemetry?")
            .setMessage("This will delete all telemetry events")
            .setPositiveButton("Clear") { _, _ ->
                // Clear telemetry
                telemetry.clearAll()
                loadTelemetry()
                Toast.makeText(this, "Telemetry cleared", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun testRateLimiting() {
        coroutineScope.launch {
            val results = mutableListOf<String>()
            
            // Make 5 rapid requests
            repeat(5) { i ->
                val result = backendClient.fetchMessageTemplates("+1555000$i")
                when (result) {
                    is BackendClient.MessageTemplatesResult.Success -> {
                        results.add("Request ${i+1}: ✅ Success")
                    }
                    is BackendClient.MessageTemplatesResult.RateLimited -> {
                        results.add("Request ${i+1}: ⚠️ Rate limited (${result.retryAfterSeconds}s)")
                    }
                    is BackendClient.MessageTemplatesResult.Error -> {
                        results.add("Request ${i+1}: ❌ Error")
                    }
                }
                delay(100) // Small delay between requests
            }
            
            AlertDialog.Builder(this@QAPanelV2Activity)
                .setTitle("Rate Limit Test")
                .setMessage(results.joinToString("\n"))
                .setPositiveButton("OK", null)
                .show()
        }
    }
    
    private fun openNotificationSettings() {
        val intent = Intent().apply {
            action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
            putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
        }
        startActivity(intent)
    }
    
    private fun openCallScreeningSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Request call screening role for Android 10+
            val roleManager = getSystemService(Context.ROLE_SERVICE) as android.app.role.RoleManager
            val intent = roleManager.createRequestRoleIntent(android.app.role.RoleManager.ROLE_CALL_SCREENING)
            startActivityForResult(intent, REQUEST_CODE_CALL_SCREENING)
        } else {
            openAppInfo()
        }
    }
    
    private fun openAppInfo() {
        val intent = Intent().apply {
            action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
            data = Uri.parse("package:$packageName")
        }
        startActivity(intent)
    }
    
    private fun clearAppCache() {
        try {
            cacheDir.deleteRecursively()
            Toast.makeText(this, "Cache cleared", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Failed to clear cache", Toast.LENGTH_SHORT).show()
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        coroutineScope.cancel()
    }
    
    // Adapter for vPasses
    inner class VPassAdapter(private val passes: List<VPassEntry>) : 
        RecyclerView.Adapter<VPassAdapter.ViewHolder>() {
        
        inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val phoneText: TextView = view.findViewById(android.R.id.text1)
            val detailText: TextView = view.findViewById(android.R.id.text2)
        }
        
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(android.R.layout.simple_list_item_2, parent, false)
            return ViewHolder(view)
        }
        
        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val pass = passes[position]
            val dateFormat = SimpleDateFormat("MM/dd HH:mm", Locale.US)
            
            holder.phoneText.text = "${pass.name} - ${pass.phoneNumber}"
            holder.detailText.text = "Expires: ${dateFormat.format(pass.expiresAt)} (${pass.duration})"
        }
        
        override fun getItemCount() = passes.size
    }
    
    // Adapter for telemetry
    inner class TelemetryAdapter(private val events: List<TelemetryEvent>) : 
        RecyclerView.Adapter<TelemetryAdapter.ViewHolder>() {
        
        inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val eventText: TextView = view.findViewById(android.R.id.text1)
            val detailText: TextView = view.findViewById(android.R.id.text2)
        }
        
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(android.R.layout.simple_list_item_2, parent, false)
            return ViewHolder(view)
        }
        
        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val event = events[position]
            val dateFormat = SimpleDateFormat("HH:mm:ss", Locale.US)
            
            holder.eventText.text = "${event.type}: ${event.data}"
            holder.detailText.text = dateFormat.format(event.timestamp)
        }
        
        override fun getItemCount() = events.size
    }
    
    data class TelemetryEvent(
        val type: String,
        val data: String,
        val timestamp: Date
    )
    
    /**
     * Reset first-run setup state - clears onboarding flag
     * Used in staging builds to force setup card to show again
     */
    private fun resetFirstRunSetup() {
        AlertDialog.Builder(this)
            .setTitle("Reset Setup")
            .setMessage("This will clear the onboarding complete flag and force the setup card to show again. Continue?")
            .setPositiveButton("Reset") { _, _ ->
                // Clear onboarding preferences
                val setupPrefs = getSharedPreferences("verifd_prefs", Context.MODE_PRIVATE)
                setupPrefs.edit()
                    .putBoolean("first_run_setup_complete", false)
                    .remove("first_run_setup_dismissed")  // Feature C: Clear dismissed flag
                    .remove("user_name")
                    .remove("setup_complete_time")
                    .apply()
                
                Toast.makeText(this, "Setup reset! Restart app to see setup card.", Toast.LENGTH_LONG).show()
                
                // Optionally restart MainActivity to show setup immediately
                val intent = Intent(this, MainActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                finish()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}