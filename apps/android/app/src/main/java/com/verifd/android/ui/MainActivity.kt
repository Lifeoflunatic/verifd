package com.verifd.android.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.View
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.snackbar.Snackbar
import com.verifd.android.R
import com.verifd.android.data.ContactRepository
import com.verifd.android.databinding.ActivityMainBinding
import com.verifd.android.ui.adapter.VPassAdapter
import kotlinx.coroutines.launch
import android.view.Menu
import android.view.MenuItem
import com.verifd.android.BuildConfig
import com.google.android.material.floatingactionbutton.FloatingActionButton
import android.widget.FrameLayout
import android.view.Gravity
import androidx.coordinatorlayout.widget.CoordinatorLayout

/**
 * Main activity showing vPass list and app controls
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
        private val REQUIRED_PERMISSIONS = arrayOf(
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_SMS
        )
    }

    private lateinit var binding: ActivityMainBinding
    private lateinit var repository: ContactRepository
    private lateinit var vPassAdapter: VPassAdapter
    private var notificationSnackbar: Snackbar? = null

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.values.all { it }
        if (allGranted) {
            Log.d(TAG, "All permissions granted")
            setupApp()
        } else {
            Log.w(TAG, "Some permissions denied: $permissions")
            showPermissionError()
        }
    }
    
    // Separate launcher for notification permission (Android 13+)
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            Log.d(TAG, "Notification permission granted")
            notificationSnackbar?.dismiss()
            notificationSnackbar = null
        } else {
            Log.w(TAG, "Notification permission denied - showing sticky Snackbar")
            // Show sticky Snackbar with 'Open settings' action
            showNotificationPermissionBanner()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        repository = ContactRepository.getInstance(this)
        
        setupUI()
        checkPermissions()
    }
    
    override fun onStart() {
        super.onStart()
        
        // FORCE notification permission check on Android 13+ EVERY launch
        // This ensures Samsung One UI 7.0 / Android 15 enables the toggle
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (!areNotificationsEnabled()) {
                // Always request if not enabled - critical for Android 15
                Log.w(TAG, "Notifications disabled - requesting permission (Android 15 requirement)")
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                // Also show persistent banner
                showNotificationPermissionBanner()
            }
        }
    }
    
    override fun onResume() {
        super.onResume()
        loadVPasses()
        
        // Runtime POST_NOTIFICATIONS prompt on Android 13+ (Feature 3)
        // Check on EVERY resume, not just once
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (!areNotificationsEnabled()) {
                // Request permission using ActivityResult launcher
                if (ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    // Only launch permission request once per session
                    if (notificationSnackbar == null) {
                        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                } else {
                    // Permission granted but notifications disabled in settings
                    showNotificationPermissionBanner()
                }
            } else {
                // Notifications enabled, dismiss any banner
                notificationSnackbar?.dismiss()
                notificationSnackbar = null
            }
        }
    }

    private fun setupUI() {
        // Feature 7: Staging watermark - toolbar subtitle = version
        if (BuildConfig.BUILD_TYPE == "staging") {
            // Enhanced watermark for staging builds
            binding.appTitle.text = "verifd [STAGING]"
            binding.appTitle.setTextColor(ContextCompat.getColor(this, android.R.color.holo_orange_dark))
            
            // Add version as subtitle text
            binding.statusText.text = "v${BuildConfig.VERSION_NAME} • Build ${BuildConfig.VERSION_CODE}"
            binding.statusText.setTextColor(ContextCompat.getColor(this, android.R.color.holo_orange_dark))
        } else {
            // Normal production display
            binding.appTitle.text = "verifd • ${BuildConfig.VERSION_NAME}"
        }
        
        // Add FAB for QA Panel in staging builds (fallback for OEM overflow quirks)
        if (BuildConfig.BUILD_TYPE == "staging") {
            addQAPanelFAB()
        }
        
        // Setup RecyclerView for vPass list
        vPassAdapter = VPassAdapter { vPass ->
            // Handle vPass item click (e.g., show details or remove)
            showVPassDetails(vPass)
        }
        
        binding.vpassRecyclerView.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = vPassAdapter
        }
        
        // Setup refresh
        binding.refreshButton.setOnClickListener {
            loadVPasses()
        }
        
        // Setup cleanup button
        binding.cleanupButton.setOnClickListener {
            cleanupExpired()
        }
    }

    private fun checkPermissions() {
        val missingPermissions = REQUIRED_PERMISSIONS.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missingPermissions.isEmpty()) {
            Log.d(TAG, "All permissions already granted")
            setupApp()
        } else {
            Log.d(TAG, "Requesting permissions: $missingPermissions")
            permissionLauncher.launch(missingPermissions.toTypedArray())
        }
    }

    private fun setupApp() {
        Log.d(TAG, "Setting up app with permissions granted")
        loadVPasses()
        
        // Enable UI
        binding.mainContent.visibility = android.view.View.VISIBLE
        binding.permissionError.visibility = android.view.View.GONE
    }

    private fun showPermissionError() {
        binding.mainContent.visibility = android.view.View.GONE
        binding.permissionError.visibility = android.view.View.VISIBLE
        
        binding.grantPermissionsButton.setOnClickListener {
            checkPermissions()
        }
    }

    private fun loadVPasses() {
        lifecycleScope.launch {
            try {
                binding.loadingIndicator.visibility = android.view.View.VISIBLE
                
                val vPasses = repository.getAllValidVPasses()
                vPassAdapter.submitList(vPasses)
                
                // Update status (preserve staging watermark if present)
                if (BuildConfig.BUILD_TYPE != "staging") {
                    binding.statusText.text = if (vPasses.isEmpty()) {
                        "No active vPasses"
                    } else {
                        "${vPasses.size} active vPass${if (vPasses.size == 1) "" else "es"}"
                    }
                }
                // For staging, the watermark remains as set in setupUI()
                
            } catch (e: Exception) {
                Log.e(TAG, "Error loading vPasses", e)
                if (BuildConfig.BUILD_TYPE != "staging") {
                    binding.statusText.text = "Error loading vPasses"
                }
            } finally {
                binding.loadingIndicator.visibility = android.view.View.GONE
            }
        }
    }

    private fun showVPassDetails(vPass: com.verifd.android.data.model.VPassEntry) {
        // Show dialog with vPass details and remove option
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("vPass Details")
            .setMessage(
                "Phone: ${com.verifd.android.util.PhoneNumberUtils.format(vPass.phoneNumber)}\n" +
                "Name: ${vPass.name}\n" +
                "Duration: ${vPass.duration.toDisplayString()}\n" +
                "Remaining: ${vPass.getRemainingTimeString()}"
            )
            .setPositiveButton("Remove") { _, _ ->
                removeVPass(vPass)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun removeVPass(vPass: com.verifd.android.data.model.VPassEntry) {
        lifecycleScope.launch {
            try {
                repository.removeVPass(vPass.phoneNumber)
                loadVPasses() // Refresh list
            } catch (e: Exception) {
                Log.e(TAG, "Error removing vPass", e)
            }
        }
    }

    private fun cleanupExpired() {
        lifecycleScope.launch {
            try {
                val removedCount = repository.cleanupExpiredVPasses()
                if (removedCount > 0) {
                    loadVPasses() // Refresh list
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error cleaning up expired vPasses", e)
            }
        }
    }
    
    /**
     * Check if notifications are enabled for the app
     */
    private fun areNotificationsEnabled(): Boolean {
        return NotificationManagerCompat.from(this).areNotificationsEnabled()
    }
    
    /**
     * Check and request notification permission on Android 13+
     */
    private fun checkNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            when {
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED -> {
                    // Permission already granted
                    Log.d(TAG, "Notification permission already granted")
                    notificationSnackbar?.dismiss()
                }
                shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) -> {
                    // User has previously denied the permission
                    showNotificationPermissionBanner()
                }
                else -> {
                    // First time asking
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        }
    }
    
    /**
     * Show banner when notifications are disabled
     */
    private fun showNotificationPermissionBanner() {
        // Dismiss any existing Snackbar first
        notificationSnackbar?.dismiss()
        
        notificationSnackbar = Snackbar.make(
            binding.root,
            "Notifications disabled. Missed call actions won't work.",
            Snackbar.LENGTH_INDEFINITE
        ).setAction("Open Settings") {
            // Open app notification settings
            openNotificationSettings()
        }.setBackgroundTint(
            ContextCompat.getColor(this, android.R.color.holo_orange_dark)
        ).apply {
            show()
        }
    }
    
    /**
     * Open app notification settings
     */
    private fun openNotificationSettings() {
        val intent = Intent().apply {
            when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O -> {
                    action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                    putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                }
                else -> {
                    action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
                    data = android.net.Uri.parse("package:$packageName")
                }
            }
        }
        startActivity(intent)
    }
    
    /**
     * Create options menu
     */
    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.menu_main, menu)
        
        // ALWAYS show QA Panel in staging builds (no hidden menu logic)
        val qaMenuItem = menu.findItem(R.id.action_qa_panel)
        qaMenuItem?.isVisible = BuildConfig.BUILD_TYPE == "staging" || BuildConfig.DEBUG
        
        return true
    }
    
    /**
     * Handle menu item selection
     */
    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_qa_panel -> {
                openQAPanel()
                true
            }
            R.id.action_settings -> {
                openSettings()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
    
    /**
     * Open QA Debug Panel
     */
    private fun openQAPanel() {
        val intent = Intent(this, QAPanelV2Activity::class.java)
        startActivity(intent)
    }
    
    /**
     * Open Settings (placeholder for now)
     */
    private fun openSettings() {
        // For now, just open app settings
        openNotificationSettings()
    }
    
    /**
     * Add a Floating Action Button for QA Panel access in staging builds
     * This provides a fallback when OEM overflow menus are quirky
     */
    private fun addQAPanelFAB() {
        // Get the root view
        val rootView = binding.root as? android.view.ViewGroup ?: return
        
        // Create FAB programmatically
        val fab = FloatingActionButton(this).apply {
            setImageResource(android.R.drawable.ic_menu_manage)
            setBackgroundTintList(android.content.res.ColorStateList.valueOf(
                ContextCompat.getColor(this@MainActivity, android.R.color.holo_purple)
            ))
            contentDescription = "Open QA Panel"
            
            setOnClickListener {
                openQAPanel()
            }
        }
        
        // Create layout params for bottom-right positioning
        val params = if (rootView is CoordinatorLayout) {
            CoordinatorLayout.LayoutParams(
                CoordinatorLayout.LayoutParams.WRAP_CONTENT,
                CoordinatorLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.BOTTOM or Gravity.END
                setMargins(16, 16, 16, 16)
            }
        } else {
            // Fallback for other layouts
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.BOTTOM or Gravity.END
                setMargins(32, 32, 32, 32)
            }
        }
        
        fab.layoutParams = params
        
        // Add FAB to the root view
        rootView.addView(fab)
    }
}