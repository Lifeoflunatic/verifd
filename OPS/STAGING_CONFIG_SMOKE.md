# Staging Config Smoke Test Documentation

## Overview

Automated smoke tests for staging configuration API to verify override users receive correct feature flags.

## Test Execution

### Manual Test Commands

```bash
# Test Primary Override User (+919233600392)
curl -s "https://staging.api.verifd.com/config/features?phone=%2B919233600392" \
  -H "x-geo-location: US" \
  -H "x-device-type: android" | jq '.'

# Expected Output:
{
  "GLOBAL_KILL_SWITCH": false,
  "MISSED_CALL_ACTIONS": 100,
  "enableTemplates": true,
  "enableRiskScoring": "shadow",
  "overrideActive": true,
  "geo": "OVERRIDE",
  "signature": "<base64-signature>",
  "kid": "staging-2025-001",
  "signedAt": "2025-01-11T12:00:00.000Z"
}

# Test Secondary Override User (+917575854485)
curl -s "https://staging.api.verifd.com/config/features?phone=%2B917575854485" \
  -H "x-geo-location: GB" \
  -H "x-device-type: ios" | jq '.'

# Expected Output:
{
  "GLOBAL_KILL_SWITCH": false,
  "MISSED_CALL_ACTIONS": 100,
  "enableTemplates": true,
  "enableRiskScoring": "shadow",
  "overrideActive": true,
  "geo": "OVERRIDE",
  "signature": "<base64-signature>",
  "kid": "staging-2025-001",
  "signedAt": "2025-01-11T12:00:00.000Z"
}

# Test Regular User (Control - India)
curl -s "https://staging.api.verifd.com/config/features" \
  -H "x-geo-location: IN" \
  -H "x-device-type: android" | jq '.'

# Expected Output (staging defaults):
{
  "GLOBAL_KILL_SWITCH": false,
  "MISSED_CALL_ACTIONS": {
    "enabled": true,
    "cohort": {
      "percentage": 50,
      "geoTargets": ["IN"]
    }
  },
  "enableTemplates": {
    "enabled": true,
    "cohort": {
      "percentage": 75
    }
  },
  "signature": "<base64-signature>",
  "kid": "staging-2025-001"
}
```

## Validation Script

```bash
#!/bin/bash
# staging-config-test.sh

API="https://staging.api.verifd.com"
PRIMARY="+919233600392"
SECONDARY="+917575854485"
EXPECTED_KID="staging-2025-001"

echo "🧪 Testing Staging Config Overrides"
echo "===================================="

# Test primary
echo -n "Primary tester ($PRIMARY): "
RESPONSE=$(curl -s "$API/config/features?phone=$PRIMARY" -H "x-geo-location: US")
OVERRIDE=$(echo "$RESPONSE" | jq -r '.overrideActive')
KID=$(echo "$RESPONSE" | jq -r '.kid')

if [ "$OVERRIDE" == "true" ] && [ "$KID" == "$EXPECTED_KID" ]; then
  echo "✅ PASS"
else
  echo "❌ FAIL (override=$OVERRIDE, kid=$KID)"
fi

# Test secondary
echo -n "Secondary tester ($SECONDARY): "
RESPONSE=$(curl -s "$API/config/features?phone=$SECONDARY" -H "x-geo-location: GB")
OVERRIDE=$(echo "$RESPONSE" | jq -r '.overrideActive')
KID=$(echo "$RESPONSE" | jq -r '.kid')

if [ "$OVERRIDE" == "true" ] && [ "$KID" == "$EXPECTED_KID" ]; then
  echo "✅ PASS"
else
  echo "❌ FAIL (override=$OVERRIDE, kid=$KID)"
fi

# Test regular user
echo -n "Regular user (no override): "
RESPONSE=$(curl -s "$API/config/features" -H "x-geo-location: IN")
OVERRIDE=$(echo "$RESPONSE" | jq -r '.overrideActive')

if [ "$OVERRIDE" != "true" ]; then
  echo "✅ PASS"
else
  echo "❌ FAIL (override should be null/false)"
fi
```

## Assertions

### Required Fields for Override Users

| Field | Expected Value | Type |
|-------|---------------|------|
| `overrideActive` | `true` | boolean |
| `MISSED_CALL_ACTIONS` | `100` | number |
| `enableTemplates` | `true` | boolean |
| `enableRiskScoring` | `"shadow"` | string |
| `geo` | `"OVERRIDE"` | string |
| `signature` | (present) | string |
| `kid` | `"staging-2025-001"` | string |

### GitHub Actions Workflow

The smoke test runs automatically:
- On every push to `main`, `staging`, or `feat/*` branches
- On pull requests to `main` or `staging`
- Every 6 hours via cron schedule
- Manual trigger via workflow_dispatch

### Artifacts

The workflow produces:
- `staging-config-results.json`: Combined test results with all three user types
- GitHub Step Summary with results table
- Pass/fail status check

## Troubleshooting

### Common Issues

1. **Override not active**
   - Check phone number format (must include country code with +)
   - Verify staging environment is running
   - Check override configuration in `/apps/backend/src/config/overrides.ts`

2. **KID mismatch**
   - Verify `STAGING_ED25519_KID` environment variable
   - Check signing configuration in backend

3. **Signature missing**
   - Ensure `STAGING_ED25519_PRIVATE_KEY` is set
   - Verify Ed25519 key format (hex string)

4. **API endpoint down**
   - Check staging deployment status
   - Verify DNS resolution for staging.api.verifd.com

## Expected Results Summary

```json
{
  "test_results": {
    "primary_tester": {
      "number": "+919233600392",
      "override_active": true,
      "missed_call_actions": 100,
      "templates": true,
      "risk_scoring": "shadow",
      "kid": "staging-2025-001",
      "signature_present": true
    },
    "secondary_tester": {
      "number": "+917575854485",
      "override_active": true,
      "missed_call_actions": 100,
      "templates": true,
      "risk_scoring": "shadow",
      "kid": "staging-2025-001",
      "signature_present": true
    },
    "regular_user": {
      "geo": "IN",
      "override_active": false,
      "missed_call_actions": 50,
      "templates": 75,
      "kid": "staging-2025-001",
      "signature_present": true
    }
  }
}
```