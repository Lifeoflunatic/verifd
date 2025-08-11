#!/bin/bash
# Test staging config with override users

echo "Testing staging config endpoints..."
echo "================================="

STAGING_API="https://staging.api.verifd.com"
LOCAL_API="http://localhost:3001"

# Use local API if available, otherwise staging
API_URL="${1:-$LOCAL_API}"

echo "Using API: $API_URL"
echo ""

# Test 1: Check staging overrides endpoint
echo "1. Fetching staging override configuration..."
curl -s "$API_URL/config/staging-overrides" | jq .
echo ""

# Test 2: Regular user config (should get default staging percentages)
echo "2. Testing regular user config (no phone)..."
curl -s "$API_URL/config/features" \
  -H "x-geo-location: IN" \
  -H "x-device-type: android" | jq '{
    MISSED_CALL_ACTIONS: .MISSED_CALL_ACTIONS.cohort.percentage,
    enableTemplates: .enableTemplates.cohort.percentage,
    enableRiskScoring: .enableRiskScoring.cohort.percentage,
    kid: .kid,
    signature: .signature | if . then "present" else "missing" end
  }'
echo ""

# Test 3: Override user 1
echo "3. Testing override user +919233600392..."
curl -s "$API_URL/config/features?phone=%2B919233600392" \
  -H "x-geo-location: US" \
  -H "x-device-type: android" | jq '{
    MISSED_CALL_ACTIONS: .MISSED_CALL_ACTIONS,
    enableTemplates: .enableTemplates,
    enableRiskScoring: .enableRiskScoring,
    overrideActive: .overrideActive,
    geo: .geo,
    kid: .kid,
    signature: .signature | if . then "present" else "missing" end
  }'
echo ""

# Test 4: Override user 2  
echo "4. Testing override user +917575854485..."
curl -s "$API_URL/config/features?phone=%2B917575854485" \
  -H "x-geo-location: GB" \
  -H "x-device-type: ios" | jq '{
    MISSED_CALL_ACTIONS: .MISSED_CALL_ACTIONS,
    enableTemplates: .enableTemplates,
    enableRiskScoring: .enableRiskScoring,
    overrideActive: .overrideActive,
    geo: .geo,
    kid: .kid,
    signature: .signature | if . then "present" else "missing" end
  }'
echo ""

# Test 5: Non-India user (should be geo-blocked)
echo "5. Testing geo-blocked user (US location, no override)..."
curl -s "$API_URL/config/features" \
  -H "x-geo-location: US" \
  -H "x-device-type: android" | jq '{
    MISSED_CALL_ACTIONS: .MISSED_CALL_ACTIONS,
    enableTemplates: .enableTemplates,
    enableRiskScoring: .enableRiskScoring,
    geoBlocked: .geoBlocked,
    geo: .geo
  }'
echo ""

# Test 6: Health check
echo "6. Config service health check..."
curl -s "$API_URL/config/health" | jq .
echo ""

echo "================================="
echo "Test complete!"
echo ""
echo "Expected results:"
echo "- Override users should have MISSED_CALL_ACTIONS=100, enableTemplates=true, enableRiskScoring='shadow'"
echo "- Override users should bypass geo restrictions (geo='OVERRIDE')"
echo "- Regular IN users get default staging percentages"
echo "- Non-IN users without override get blocked features"
echo "- All responses should have KID='staging-2025-001' and signature present"