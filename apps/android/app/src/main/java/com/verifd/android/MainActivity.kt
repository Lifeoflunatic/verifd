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
        
        // Check if this is staging build and show debug panel option
        if (BuildConfig.BUILD_VARIANT == "staging") {
            statusText.text = "verifd Staging - ${BuildConfig.BASE_URL}"
            statusText.setOnClickListener {
                startActivity(Intent(this, DebugPanelActivity::class.java))
            }
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