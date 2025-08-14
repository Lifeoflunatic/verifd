package com.verifd.android

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.RecyclerView
import androidx.core.content.ContextCompat
import com.verifd.android.ui.DebugPanelActivity
import com.verifd.android.ui.FirstRunSetupCard
import com.verifd.android.service.CallScreeningService
import androidx.core.app.NotificationManagerCompat
import com.google.android.material.snackbar.Snackbar
import android.animation.ObjectAnimator
import android.animation.AnimatorListenerAdapter
import android.animation.Animator

class MainActivity : AppCompatActivity() {
    
    private lateinit var permissionError: LinearLayout
    private lateinit var mainContent: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var loadingIndicator: ProgressBar
    private lateinit var vpassRecyclerView: RecyclerView
    private lateinit var refreshButton: Button
    private lateinit var cleanupButton: Button
    private lateinit var grantPermissionsButton: Button
    private lateinit var firstRunSetupCard: FirstRunSetupCard
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        // Initialize views
        permissionError = findViewById(R.id.permissionError)
        mainContent = findViewById(R.id.mainContent)
        statusText = findViewById(R.id.statusText)
        loadingIndicator = findViewById(R.id.loadingIndicator)
        vpassRecyclerView = findViewById(R.id.vpassRecyclerView)
        refreshButton = findViewById(R.id.refreshButton)
        cleanupButton = findViewById(R.id.cleanupButton)
        grantPermissionsButton = findViewById(R.id.grantPermissionsButton)
        firstRunSetupCard = findViewById(R.id.firstRunSetupCard)
        
        // Set up click listeners
        refreshButton.setOnClickListener {
            refreshData()
        }
        
        cleanupButton.setOnClickListener {
            cleanupExpiredPasses()
        }
        
        grantPermissionsButton.setOnClickListener {
            requestPermissions()
        }
        
        // Task 2a: Show QA Panel button in staging
        if (BuildConfig.BUILD_TYPE == "staging") {
            // Show QA Panel button on header
            findViewById<Button>(R.id.btnQaPanel)?.apply {
                visibility = View.VISIBLE
                setOnClickListener {
                    startActivity(Intent(this@MainActivity, com.verifd.android.ui.QAPanelV2Activity::class.java))
                }
            }
            
            // Show Floating Action Button for QA Panel
            findViewById<com.google.android.material.floatingactionbutton.FloatingActionButton>(R.id.fabQaPanel)?.apply {
                visibility = View.VISIBLE
                setOnClickListener {
                    startActivity(Intent(this@MainActivity, com.verifd.android.ui.QAPanelV2Activity::class.java))
                }
            }
            
            // Update app title with staging watermark
            findViewById<TextView>(R.id.appTitle)?.apply {
                text = "[STAGING] verifd"
                setTextColor(ContextCompat.getColor(context, android.R.color.holo_orange_dark))
            }
            
            statusText.text = "verifd Staging - ${BuildConfig.VERSION_NAME}"
            statusText.setTextColor(ContextCompat.getColor(this, android.R.color.holo_orange_light))
        } else {
            statusText.text = "verifd - Ready"
        }
        
        // Initialize UI state
        checkPermissionsAndInitialize()
        
        // Task 1: Runtime-driven First-Run setup check for staging
        if (BuildConfig.BUILD_TYPE == "staging") {
            checkAndShowFirstRunSetup()
        }
    }
    
    override fun onResume() {
        super.onResume()
        
        // Task 4: Setup watcher - refresh gate on resume
        if (BuildConfig.BUILD_TYPE == "staging") {
            checkAndShowFirstRunSetup()
        }
    }
    
    private fun checkAndShowFirstRunSetup() {
        // Task 1: Make First-Run purely runtime-driven in staging
        // Ignore any stored preferences - only check runtime state
        val needsSetup = !hasCallScreeningRole() || !areNotificationsEnabled()
        
        if (needsSetup) {
            // Task 2: Show FirstRunSetupCard on the real PassList home screen
            if (firstRunSetupCard.visibility != View.VISIBLE) {
                firstRunSetupCard.visibility = View.VISIBLE
                firstRunSetupCard.updateStatus()
                
                // Animate in
                firstRunSetupCard.alpha = 0f
                ObjectAnimator.ofFloat(firstRunSetupCard, "alpha", 0f, 1f).apply {
                    duration = 300
                    start()
                }
            }
            
            // Set callback for when setup is complete
            firstRunSetupCard.onSetupCompleteListener = {
                // Re-check status after setup action
                checkAndShowFirstRunSetup()
            }
        } else {
            // Hide setup card when both conditions are met with animation
            if (firstRunSetupCard.visibility == View.VISIBLE) {
                ObjectAnimator.ofFloat(firstRunSetupCard, "alpha", 1f, 0f).apply {
                    duration = 300
                    addListener(object : AnimatorListenerAdapter() {
                        override fun onAnimationEnd(animation: Animator) {
                            firstRunSetupCard.visibility = View.GONE
                            
                            // Show Snackbar confirming setup complete
                            Snackbar.make(
                                findViewById(android.R.id.content),
                                "✅ Setup complete! verifd is ready to protect your calls.",
                                Snackbar.LENGTH_LONG
                            ).show()
                        }
                    })
                    start()
                }
            }
        }
    }
    
    private fun hasCallScreeningRole(): Boolean {
        return CallScreeningService.hasCallScreeningRole(this)
    }
    
    private fun areNotificationsEnabled(): Boolean {
        return NotificationManagerCompat.from(this).areNotificationsEnabled()
    }
    
    private fun checkPermissionsAndInitialize() {
        // For now, assume permissions are granted (would check in real implementation)
        permissionError.visibility = View.GONE
        mainContent.visibility = View.VISIBLE
        
        // Load initial data
        refreshData()
    }
    
    private fun requestPermissions() {
        // Would request actual permissions here
        checkPermissionsAndInitialize()
    }
    
    private fun refreshData() {
        loadingIndicator.visibility = View.VISIBLE
        statusText.text = "Refreshing..."
        
        // Simulate data refresh
        loadingIndicator.postDelayed({
            loadingIndicator.visibility = View.GONE
            statusText.text = "No active vPasses"
        }, 1000)
    }
    
    private fun cleanupExpiredPasses() {
        statusText.text = "Cleaning up expired passes..."
        
        // Simulate cleanup
        statusText.postDelayed({
            statusText.text = "Cleanup complete"
        }, 500)
    }
}