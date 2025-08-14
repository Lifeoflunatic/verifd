package com.verifd.android.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.verifd.android.R
import com.verifd.android.data.ContactRepository
import com.verifd.android.databinding.ActivityMainBinding
import com.verifd.android.ui.adapter.VPassAdapter
import kotlinx.coroutines.launch

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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        repository = ContactRepository.getInstance(this)
        
        setupUI()
        checkPermissions()
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
}