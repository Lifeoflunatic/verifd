package com.verifd.android.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.verifd.android.R
import com.verifd.android.service.CallScreeningService

/**
 * First-run setup card that guides users through initial configuration.
 * Shows only on first launch or when setup is incomplete.
 * 
 * Setup steps:
 * 1. Enter your name (for templates)
 * 2. Grant permissions (Phone, SMS, Notifications)
 * 3. Enable call screening role
 * 4. Optional: Configure expecting window default
 */
class FirstRunSetupCard @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : MaterialCardView(context, attrs, defStyleAttr) {
    
    companion object {
        private const val PREFS_NAME = "verifd_prefs"
        private const val KEY_SETUP_COMPLETE = "first_run_setup_complete"
        private const val KEY_USER_NAME = "user_name"
        private const val KEY_EXPECTING_DEFAULT = "expecting_default_minutes"
        
        const val REQUEST_CODE_PERMISSIONS = 1001
        const val REQUEST_CODE_CALL_SCREENING = 1002
    }
    
    private lateinit var prefs: SharedPreferences
    private var setupListener: SetupListener? = null
    
    // UI elements
    private lateinit var stepIndicator: LinearLayout
    private lateinit var nameInput: TextInputEditText
    private lateinit var nameInputLayout: TextInputLayout
    private lateinit var permissionsStatus: TextView
    private lateinit var permissionsButton: Button
    private lateinit var callScreeningStatus: TextView
    private lateinit var callScreeningButton: Button
    private lateinit var expectingCheckbox: CheckBox
    private lateinit var completeButton: Button
    private lateinit var skipButton: Button
    
    private var currentStep = 1
    
    interface SetupListener {
        fun onSetupComplete(userName: String)
        fun onSetupSkipped()
        fun onRequestPermissions(permissions: Array<String>, requestCode: Int)
        fun onRequestCallScreeningRole()
    }
    
    init {
        initializeView()
    }
    
    private fun initializeView() {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        
        // Inflate the card content
        LayoutInflater.from(context).inflate(R.layout.first_run_setup_card, this, true)
        
        // Set card properties
        radius = 16f
        elevation = 8f
        setCardBackgroundColor(ContextCompat.getColor(context, android.R.color.white))
        useCompatPadding = true
        
        // Find views
        stepIndicator = findViewById(R.id.step_indicator)
        nameInput = findViewById(R.id.name_input)
        nameInputLayout = findViewById(R.id.name_input_layout)
        permissionsStatus = findViewById(R.id.permissions_status)
        permissionsButton = findViewById(R.id.permissions_button)
        callScreeningStatus = findViewById(R.id.call_screening_status)
        callScreeningButton = findViewById(R.id.call_screening_button)
        expectingCheckbox = findViewById(R.id.expecting_checkbox)
        completeButton = findViewById(R.id.complete_button)
        skipButton = findViewById(R.id.skip_button)
        
        // Setup click listeners
        setupClickListeners()
        
        // Update initial state
        updateUI()
    }
    
    private fun setupClickListeners() {
        nameInput.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) {
                val name = nameInput.text?.toString()?.trim()
                if (!name.isNullOrEmpty()) {
                    prefs.edit().putString(KEY_USER_NAME, name).apply()
                    moveToStep(2)
                }
            }
        }
        
        permissionsButton.setOnClickListener {
            requestPermissions()
        }
        
        callScreeningButton.setOnClickListener {
            requestCallScreeningRole()
        }
        
        expectingCheckbox.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putInt(KEY_EXPECTING_DEFAULT, if (isChecked) 30 else 0).apply()
        }
        
        completeButton.setOnClickListener {
            completeSetup()
        }
        
        skipButton.setOnClickListener {
            skipSetup()
        }
    }
    
    fun setSetupListener(listener: SetupListener) {
        this.setupListener = listener
    }
    
    fun shouldShow(): Boolean {
        // Show if setup not complete or critical permissions missing
        return !isSetupComplete() || !hasRequiredPermissions()
    }
    
    private fun isSetupComplete(): Boolean {
        return prefs.getBoolean(KEY_SETUP_COMPLETE, false)
    }
    
    private fun hasRequiredPermissions(): Boolean {
        val phonePermission = ActivityCompat.checkSelfPermission(
            context, 
            Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
        
        val smsPermission = ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED
        
        // Notification permission only required on Android 13+
        val notificationPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
        
        return phonePermission && smsPermission && notificationPermission
    }
    
    private fun hasCallScreeningRole(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            CallScreeningService.hasCallScreeningRole(context)
        } else {
            true // Not applicable for older versions
        }
    }
    
    private fun updateUI() {
        // Update step indicators
        updateStepIndicators()
        
        // Step 1: Name
        val savedName = prefs.getString(KEY_USER_NAME, "")
        if (!savedName.isNullOrEmpty()) {
            nameInput.setText(savedName)
            nameInputLayout.helperText = "✓ Name saved"
        }
        
        // Step 2: Permissions
        updatePermissionsStatus()
        
        // Step 3: Call Screening
        updateCallScreeningStatus()
        
        // Step 4: Optional settings
        val expectingDefault = prefs.getInt(KEY_EXPECTING_DEFAULT, 0)
        expectingCheckbox.isChecked = expectingDefault > 0
        
        // Complete button
        val canComplete = !prefs.getString(KEY_USER_NAME, "").isNullOrEmpty() &&
                         hasRequiredPermissions() &&
                         hasCallScreeningRole()
        
        completeButton.isEnabled = canComplete
        completeButton.text = if (canComplete) "Complete Setup" else "Finish Required Steps"
    }
    
    private fun updateStepIndicators() {
        stepIndicator.removeAllViews()
        
        for (i in 1..4) {
            val dot = View(context).apply {
                layoutParams = LinearLayout.LayoutParams(24, 24).apply {
                    marginEnd = 8
                }
                background = ContextCompat.getDrawable(
                    context,
                    if (i <= currentStep) {
                        android.R.drawable.presence_online
                    } else {
                        android.R.drawable.presence_invisible
                    }
                )
            }
            stepIndicator.addView(dot)
        }
    }
    
    private fun updatePermissionsStatus() {
        val hasPhone = ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
        
        val hasSms = ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED
        
        val hasNotifications = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
        
        val statusText = buildString {
            append("Phone: ${if (hasPhone) "✓" else "✗"} ")
            append("SMS: ${if (hasSms) "✓" else "✗"} ")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                append("Notif: ${if (hasNotifications) "✓" else "✗"}")
            }
        }
        
        permissionsStatus.text = statusText
        
        val allGranted = hasPhone && hasSms && hasNotifications
        permissionsButton.isEnabled = !allGranted
        permissionsButton.text = if (allGranted) "All Granted" else "Grant Permissions"
        
        if (allGranted && currentStep == 2) {
            moveToStep(3)
        }
    }
    
    private fun updateCallScreeningStatus() {
        val hasRole = hasCallScreeningRole()
        
        callScreeningStatus.text = if (hasRole) {
            "✓ Call screening enabled"
        } else {
            "✗ Call screening not enabled"
        }
        
        callScreeningButton.isEnabled = !hasRole
        callScreeningButton.text = if (hasRole) "Enabled" else "Enable Call Screening"
        
        if (hasRole && currentStep == 3) {
            moveToStep(4)
        }
    }
    
    private fun moveToStep(step: Int) {
        currentStep = step
        updateUI()
    }
    
    private fun requestPermissions() {
        val permissions = mutableListOf<String>()
        
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) 
            != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.READ_PHONE_STATE)
        }
        
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
            != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.SEND_SMS)
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        
        if (permissions.isNotEmpty()) {
            setupListener?.onRequestPermissions(permissions.toTypedArray(), REQUEST_CODE_PERMISSIONS)
        }
    }
    
    private fun requestCallScreeningRole() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            setupListener?.onRequestCallScreeningRole()
        }
    }
    
    private fun completeSetup() {
        val userName = nameInput.text?.toString()?.trim() ?: "User"
        prefs.edit()
            .putBoolean(KEY_SETUP_COMPLETE, true)
            .putString(KEY_USER_NAME, userName)
            .apply()
        
        setupListener?.onSetupComplete(userName)
        visibility = View.GONE
    }
    
    private fun skipSetup() {
        prefs.edit().putBoolean(KEY_SETUP_COMPLETE, true).apply()
        setupListener?.onSetupSkipped()
        visibility = View.GONE
    }
    
    fun onPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        if (requestCode == REQUEST_CODE_PERMISSIONS) {
            updatePermissionsStatus()
        }
    }
    
    fun onCallScreeningRoleResult(granted: Boolean) {
        updateCallScreeningStatus()
    }
}