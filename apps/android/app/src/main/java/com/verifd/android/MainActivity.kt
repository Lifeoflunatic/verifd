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

class MainActivity : AppCompatActivity() {
    
    private lateinit var permissionError: LinearLayout
    private lateinit var mainContent: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var loadingIndicator: ProgressBar
    private lateinit var vpassRecyclerView: RecyclerView
    private lateinit var refreshButton: Button
    private lateinit var cleanupButton: Button
    private lateinit var grantPermissionsButton: Button
    
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