package com.verifd.android.ui

import android.Manifest
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.cardview.widget.CardView
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.verifd.android.BuildConfig
import com.verifd.android.R
import com.verifd.android.service.CallScreeningService

/**
 * First-Run setup card shown in staging builds until role + notifications are enabled
 * Feature C: Guides users to enable call screening role and notifications
 */
class FirstRunSetupCard @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : CardView(context, attrs, defStyleAttr) {
    
    private val roleStatusText: TextView
    private val notificationStatusText: TextView
    private val btnSetCallScreener: Button
    private val btnEnableNotifications: Button
    private val btnDismissSetup: Button
    
    var onSetupCompleteListener: (() -> Unit)? = null
    
    init {
        LayoutInflater.from(context).inflate(R.layout.first_run_setup_card, this, true)
        
        roleStatusText = findViewById(R.id.roleStatusText)
        notificationStatusText = findViewById(R.id.notificationStatusText)
        btnSetCallScreener = findViewById(R.id.btnSetCallScreener)
        btnEnableNotifications = findViewById(R.id.btnEnableNotifications)
        btnDismissSetup = findViewById(R.id.btnDismissSetup)
        
        setupButtons()
        updateStatus()
    }
    
    private fun setupButtons() {
        btnSetCallScreener.setOnClickListener {
            openCallScreeningRoleSettings()
        }
        
        btnEnableNotifications.setOnClickListener {
            openNotificationSettings()
        }
        
        btnDismissSetup.setOnClickListener {
            // Task 1: In staging, dismiss is purely visual - no preferences saved
            visibility = View.GONE
            onSetupCompleteListener?.invoke()
        }
    }
    
    fun updateStatus() {
        val hasRole = hasCallScreeningRole()
        val hasNotifications = areNotificationsEnabled()
        
        // Update role status
        if (hasRole) {
            roleStatusText.text = "✓ Default call screener set"
            btnSetCallScreener.visibility = View.GONE
        } else {
            roleStatusText.text = "Set as default call screener"
            btnSetCallScreener.visibility = View.VISIBLE
        }
        
        // Update notification status
        if (hasNotifications) {
            notificationStatusText.text = "✓ Notifications enabled"
            btnEnableNotifications.visibility = View.GONE
        } else {
            notificationStatusText.text = "Enable notifications"
            btnEnableNotifications.visibility = View.VISIBLE
        }
        
        // Show dismiss button only when both are complete
        btnDismissSetup.visibility = if (hasRole && hasNotifications) View.VISIBLE else View.GONE
    }
    
    fun shouldShow(): Boolean {
        // Task 1: In staging, ONLY check runtime state - ignore preferences
        if (BuildConfig.BUILD_TYPE != "staging") {
            return false
        }
        
        // Pure runtime check - no preference checking
        return !hasCallScreeningRole() || !areNotificationsEnabled()
    }
    
    fun reset() {
        // Reset the dismissed flag (for QA Panel reset)
        context.getSharedPreferences("verifd_prefs", Context.MODE_PRIVATE)
            .edit()
            .remove("first_run_setup_dismissed")
            .apply()
        
        updateStatus()
        visibility = if (shouldShow()) View.VISIBLE else View.GONE
    }
    
    private fun hasCallScreeningRole(): Boolean {
        return CallScreeningService.hasCallScreeningRole(context)
    }
    
    private fun areNotificationsEnabled(): Boolean {
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }
    
    private fun openCallScreeningRoleSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager
            val intent = roleManager?.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
            if (intent != null) {
                (context as? MainActivity)?.startActivity(intent)
            }
        } else {
            // Pre-Android 10: Open app settings
            openAppSettings()
        }
    }
    
    private fun openNotificationSettings() {
        val intent = Intent().apply {
            when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O -> {
                    action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                    putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                }
                else -> {
                    action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
                    data = android.net.Uri.parse("package:${context.packageName}")
                }
            }
        }
        (context as? MainActivity)?.startActivity(intent)
    }
    
    private fun openAppSettings() {
        val intent = Intent().apply {
            action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
            data = android.net.Uri.parse("package:${context.packageName}")
        }
        (context as? MainActivity)?.startActivity(intent)
    }
}