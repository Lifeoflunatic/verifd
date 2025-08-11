package com.verifd.android.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.verifd.android.R
import com.verifd.android.data.BackendClient
import com.verifd.android.data.ContactRepository
import com.verifd.android.data.model.VPassEntry
import com.verifd.android.databinding.ActivityPostCallBinding
import com.verifd.android.util.PhoneNumberUtils
import com.verifd.android.util.SmsUtils
import kotlinx.coroutines.launch
import java.util.Date

/**
 * Post-call sheet that appears after unknown calls with verification options
 */
class PostCallActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_PHONE_NUMBER = "phone_number"
        private const val TAG = "PostCallActivity"
    }

    private lateinit var binding: ActivityPostCallBinding
    private lateinit var repository: ContactRepository
    private var phoneNumber: String? = null
    private var subscriptions: List<SubscriptionInfo> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        binding = ActivityPostCallBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        repository = ContactRepository.getInstance(this)
        phoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER)
        
        if (phoneNumber.isNullOrEmpty()) {
            Log.e(TAG, "No phone number provided")
            finish()
            return
        }
        
        setupUI()
        loadDualSimInfo()
    }
    
    private fun setupUI() {
        val formattedNumber = PhoneNumberUtils.format(phoneNumber!!)
        binding.callerNumberText.text = formattedNumber
        
        // Send Identity Ping button
        binding.sendPingButton.setOnClickListener {
            showSendPingDialog()
        }
        
        // Grant vPass buttons
        binding.grant24hButton.setOnClickListener {
            showGrantVPassDialog(VPassEntry.Duration.HOURS_24)
        }
        
        binding.grant30dButton.setOnClickListener {
            showGrantVPassDialog(VPassEntry.Duration.DAYS_30)
        }
        
        // Dismiss button
        binding.dismissButton.setOnClickListener {
            finish()
        }
        
        // Block caller button
        binding.blockButton.setOnClickListener {
            blockCaller()
        }
    }
    
    private fun loadDualSimInfo() {
        lifecycleScope.launch {
            try {
                subscriptions = SmsUtils.getActiveSubscriptions(this@PostCallActivity)
                updateSimSelector()
            } catch (e: Exception) {
                Log.e(TAG, "Error loading SIM info", e)
            }
        }
    }
    
    private fun updateSimSelector() {
        if (subscriptions.size > 1) {
            binding.simSelectorGroup.visibility = android.view.View.VISIBLE
            binding.simSelectorText.text = "Choose SIM for SMS:"
            
            // Update radio buttons with SIM info
            subscriptions.forEachIndexed { index, sub ->
                when (index) {
                    0 -> {
                        binding.sim1Radio.text = "SIM 1: ${sub.displayName}"
                        binding.sim1Radio.visibility = android.view.View.VISIBLE
                    }
                    1 -> {
                        binding.sim2Radio.text = "SIM 2: ${sub.displayName}"
                        binding.sim2Radio.visibility = android.view.View.VISIBLE
                    }
                }
            }
            
            // Default to first SIM
            binding.sim1Radio.isChecked = true
        } else {
            binding.simSelectorGroup.visibility = android.view.View.GONE
        }
    }
    
    private fun showSendPingDialog() {
        val builder = AlertDialog.Builder(this)
        builder.setTitle("Send Identity Ping")
        builder.setMessage("Send verification request to ${PhoneNumberUtils.format(phoneNumber!)}?\n\nThis will open your SMS app with a pre-filled message.")
        
        builder.setPositiveButton("Open SMS") { _, _ ->
            sendIdentityPing()
        }
        
        builder.setNegativeButton("Cancel", null)
        builder.show()
    }
    
    private fun sendIdentityPing() {
        lifecycleScope.launch {
            try {
                // Get user's name for the message (placeholder - could be from user settings)
                val yourName = "Unknown" // TODO: Get from user preferences/settings
                val selectedSim = getSelectedSim()
                
                // Launch Identity Ping composer with backend integration
                val response = SmsUtils.launchIdentityPingComposer(
                    context = this@PostCallActivity,
                    phoneNumber = phoneNumber!!,
                    yourName = yourName,
                    reason = "call verification",
                    subscription = selectedSim
                )
                
                if (response.success) {
                    Toast.makeText(
                        this@PostCallActivity, 
                        "SMS composer opened with Identity Ping", 
                        Toast.LENGTH_SHORT
                    ).show()
                    // Don't finish() here - let user send the SMS manually
                } else {
                    val errorMsg = response.error ?: "Unknown error"
                    Toast.makeText(
                        this@PostCallActivity, 
                        "Failed to create Identity Ping: $errorMsg", 
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error creating identity ping", e)
                Toast.makeText(
                    this@PostCallActivity, 
                    "Error creating Identity Ping: ${e.message}", 
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }
    
    
    private fun showGrantVPassDialog(duration: VPassEntry.Duration) {
        val builder = AlertDialog.Builder(this)
        builder.setTitle("Grant vPass")
        
        val durationText = when (duration) {
            VPassEntry.Duration.HOURS_24 -> "24 hours"
            VPassEntry.Duration.DAYS_30 -> "30 days"
            else -> "unknown duration"
        }
        
        builder.setMessage("Grant ${PhoneNumberUtils.format(phoneNumber!!)} a vPass for $durationText?")
        
        builder.setPositiveButton("Grant") { _, _ ->
            grantVPass(duration)
        }
        
        builder.setNegativeButton("Cancel", null)
        builder.show()
    }
    
    private fun grantVPass(duration: VPassEntry.Duration) {
        lifecycleScope.launch {
            try {
                val scope = when (duration) {
                    VPassEntry.Duration.HOURS_24 -> "24h"
                    VPassEntry.Duration.DAYS_30 -> "30d"
                    else -> "24h"
                }
                
                // Try to grant via backend first
                val backendClient = BackendClient.getInstance(this@PostCallActivity)
                val grantResult = backendClient.grantPass(
                    phoneNumber = phoneNumber!!,
                    scope = scope,
                    name = "Unknown Caller",
                    reason = "Post-call approval"
                )
                
                when (grantResult) {
                    is BackendClient.GrantPassResult.Success -> {
                        Log.d(TAG, "Backend pass granted: ${grantResult.passId}")
                        
                        // Also save locally for fast access
                        val expiresAt = when (duration) {
                            VPassEntry.Duration.HOURS_24 -> Date(System.currentTimeMillis() + 24 * 60 * 60 * 1000)
                            VPassEntry.Duration.DAYS_30 -> Date(System.currentTimeMillis() + 30 * 24 * 60 * 60 * 1000)
                            else -> Date(System.currentTimeMillis() + 24 * 60 * 60 * 1000)
                        }
                        
                        val vPassEntry = VPassEntry(
                            phoneNumber = phoneNumber!!,
                            name = "Unknown Caller",
                            duration = duration,
                            createdAt = Date(),
                            expiresAt = expiresAt
                        )
                        
                        repository.insertVPass(vPassEntry)
                        
                        val durationText = when (duration) {
                            VPassEntry.Duration.HOURS_24 -> "24 hours"
                            VPassEntry.Duration.DAYS_30 -> "30 days"
                            else -> "unknown duration"
                        }
                        
                        Toast.makeText(
                            this@PostCallActivity,
                            "vPass granted for $durationText",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                    
                    is BackendClient.GrantPassResult.Error -> {
                        Log.e(TAG, "Backend grant failed: ${grantResult.message}")
                        
                        // Fall back to local-only
                        val expiresAt = when (duration) {
                            VPassEntry.Duration.HOURS_24 -> Date(System.currentTimeMillis() + 24 * 60 * 60 * 1000)
                            VPassEntry.Duration.DAYS_30 -> Date(System.currentTimeMillis() + 30 * 24 * 60 * 60 * 1000)
                            else -> Date(System.currentTimeMillis() + 24 * 60 * 60 * 1000)
                        }
                        
                        val vPassEntry = VPassEntry(
                            phoneNumber = phoneNumber!!,
                            name = "Unknown Caller",
                            duration = duration,
                            createdAt = Date(),
                            expiresAt = expiresAt
                        )
                        
                        repository.insertVPass(vPassEntry)
                        
                        val durationText = when (duration) {
                            VPassEntry.Duration.HOURS_24 -> "24 hours"
                            VPassEntry.Duration.DAYS_30 -> "30 days"
                            else -> "unknown duration"
                        }
                        
                        Toast.makeText(
                            this@PostCallActivity,
                            "vPass granted locally for $durationText",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
                
                finish()
                
            } catch (e: Exception) {
                Log.e(TAG, "Error granting vPass", e)
                Toast.makeText(
                    this@PostCallActivity,
                    "Error granting vPass: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }
    
    private fun blockCaller() {
        // This would typically integrate with system call blocking
        // For now, just show a placeholder
        Toast.makeText(this, "Block feature not implemented yet", Toast.LENGTH_SHORT).show()
        finish()
    }
    
    private fun getSelectedSim(): SubscriptionInfo? {
        if (subscriptions.isEmpty()) return null
        
        return when {
            binding.sim1Radio.isChecked && subscriptions.isNotEmpty() -> subscriptions[0]
            binding.sim2Radio.isChecked && subscriptions.size > 1 -> subscriptions[1]
            else -> subscriptions.firstOrNull()
        }
    }
}