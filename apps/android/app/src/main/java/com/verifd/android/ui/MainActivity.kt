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
        } else {
            Log.w(TAG, "Notification permission denied")
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
        
        // Check notification permission on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            checkNotificationPermission()
        }
    }
    
    override fun onResume() {
        super.onResume()
        loadVPasses()
    }

    private fun setupUI() {
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
                
                // Update status
                binding.statusText.text = if (vPasses.isEmpty()) {
                    "No active vPasses"
                } else {
                    "${vPasses.size} active vPass${if (vPasses.size == 1) "" else "es"}"
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error loading vPasses", e)
                binding.statusText.text = "Error loading vPasses"
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
        notificationSnackbar = Snackbar.make(
            binding.root,
            "Enable notifications to receive missed call alerts",
            Snackbar.LENGTH_INDEFINITE
        ).setAction("Enable") {
            // Open app notification settings
            openNotificationSettings()
        }.apply {
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
        
        // Show QA Panel only in staging builds
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
        val intent = Intent(this, DebugPanelActivity::class.java)
        startActivity(intent)
    }
    
    /**
     * Open Settings (placeholder for now)
     */
    private fun openSettings() {
        // For now, just open app settings
        openNotificationSettings()
    }
}