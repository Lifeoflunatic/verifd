#!/usr/bin/env node

/**
 * Test script for success banner functionality
 * This tests the success page message logic
 */

// Mock success page logic
function generateSuccessMessage(verificationData, passCheck) {
  const messages = [];
  
  // Title
  const title = verificationData.passGranted ? 'vPass Granted!' : 'Verification Request Sent';
  messages.push(`TITLE: ${title}`);
  
  // Subtitle
  let subtitle = '';
  if (verificationData.passGranted) {
    if (verificationData.callerName) {
      subtitle += `Great! ${verificationData.callerName} now has temporary access to call you. `;
    }
    subtitle += 'Try calling me now.';
  } else {
    if (verificationData.callerName) {
      subtitle += `Thanks, ${verificationData.callerName}! `;
    }
    subtitle += 'Your verification request has been sent.';
  }
  messages.push(`SUBTITLE: ${subtitle}`);
  
  // Pass status message
  if (passCheck.data && passCheck.data.allowed) {
    const statusTitle = verificationData.passGranted ? 
      '✨ vPass Active — Try Calling Now!' : 
      'Active Pass Found';
    messages.push(`PASS STATUS: ${statusTitle}`);
    
    if (passCheck.data.scope) {
      const scopeDesc = getScopeDescription(passCheck.data.scope);
      messages.push(`SCOPE: ${scopeDesc}`);
    }
    
    if (passCheck.data.expires_at) {
      messages.push(`EXPIRES: ${new Date(passCheck.data.expires_at).toLocaleString()}`);
    }
    
    if (verificationData.passGranted) {
      messages.push('BANNER: 🎉 Your call will now ring through like a contact!');
    }
  } else {
    messages.push('PASS STATUS: No Active Pass');
    const reason = verificationData.passGranted ? 
      'The pass may take a moment to appear. Try refreshing the page.' :
      'You don\'t currently have an active verification pass for this number.';
    messages.push(`REASON: ${reason}`);
  }
  
  return messages;
}

function getScopeDescription(scope) {
  switch (scope) {
    case '30m': return 'Short-term (30 minutes)';
    case '24h': return 'Medium-term (24 hours)';
    case '30d': return 'Long-term (30 days)';
    default: return scope;
  }
}

// Test scenarios
console.log('🧪 Testing Success Banner Messages\n');

// Scenario 1: New verification request (no pass yet)
console.log('=== Scenario 1: New verification request ===');
const scenario1 = {
  verificationData: {
    callerName: 'Alice Johnson',
    passGranted: false,
    vanityUrl: '/v/abc123'
  },
  passCheck: {
    data: { allowed: false }
  }
};

const messages1 = generateSuccessMessage(scenario1.verificationData, scenario1.passCheck);
messages1.forEach(msg => console.log(`  ${msg}`));

// Scenario 2: vPass just granted
console.log('\n=== Scenario 2: vPass just granted ===');
const scenario2 = {
  verificationData: {
    callerName: 'Bob Smith',
    passGranted: true,
    passId: 'pass_123'
  },
  passCheck: {
    data: { 
      allowed: true, 
      scope: '24h',
      expires_at: new Date(Date.now() + 24*60*60*1000).toISOString()
    }
  }
};

const messages2 = generateSuccessMessage(scenario2.verificationData, scenario2.passCheck);
messages2.forEach(msg => console.log(`  ${msg}`));

// Scenario 3: Existing pass found
console.log('\n=== Scenario 3: Existing pass found ===');
const scenario3 = {
  verificationData: {
    callerName: 'Charlie Wilson',
    passGranted: false
  },
  passCheck: {
    data: { 
      allowed: true, 
      scope: '30d',
      expires_at: new Date(Date.now() + 30*24*60*60*1000).toISOString()
    }
  }
};

const messages3 = generateSuccessMessage(scenario3.verificationData, scenario3.passCheck);
messages3.forEach(msg => console.log(`  ${msg}`));

console.log('\n✅ Success banner tests completed!');
console.log('🎯 Banner Features:');
console.log('  • Dynamic title based on pass grant status');
console.log('  • Clear "Try calling me now" call-to-action');
console.log('  • Scope and expiration time display');
console.log('  • Celebration message for new vPasses');
console.log('  • Helpful guidance for all scenarios');