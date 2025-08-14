# verifd Release Checklist

## Feature Flag Configuration & Rollout

### Pre-Release Verification

#### 1. Feature Flag Status Check
```bash
# Check all feature flags are OFF in production
curl https://api.verifd.com/config/features \
  -H "X-Device-Type: ios" \
  -H "X-Geo-Location: US" \
  -H "X-App-Version: 1.0.0" | jq

# Verify response shows all flags with 0% rollout
{
  "GLOBAL_KILL_SWITCH": false,
  "MISSED_CALL_ACTIONS": { "enabled": false, "cohort": { "percentage": 0 }},
  "QUICK_TILE_EXPECTING": { "enabled": false, "cohort": { "percentage": 0 }},
  "APP_SHORTCUTS_ENABLED": { "enabled": false, "cohort": { "percentage": 0 }},
  "IDENTITY_LOOKUP_ENABLED": { "enabled": false, "cohort": { "percentage": 0 }},
  "enableTemplates": { "enabled": false, "cohort": { "percentage": 0 }},
  "enableWhatsApp": { "enabled": false, "cohort": { "percentage": 0 }},
  "enableRiskScoring": { "enabled": false, "cohort": { "percentage": 0 }}
}
```

#### 2. Kill Switch Test
```bash
# Test kill switch activation (staging only)
curl -X POST https://staging.api.verifd.com/config/kill-switch \
  -H "Content-Type: application/json" \
  -d '{
    "active": true,
    "adminToken": "${ADMIN_KILL_SWITCH_TOKEN}"
  }'

# Verify all features disabled
curl https://staging.api.verifd.com/config/features | jq '.GLOBAL_KILL_SWITCH'
# Should return: true

# Deactivate kill switch
curl -X POST https://staging.api.verifd.com/config/kill-switch \
  -H "Content-Type: application/json" \
  -d '{
    "active": false,
    "adminToken": "${ADMIN_KILL_SWITCH_TOKEN}"
  }'
```

### Progressive Rollout Plan

#### Stage 1: Internal Testing (Week 1)
```bash
# Enable for internal team only (user overrides)
export MISSED_CALL_ACTIONS_OVERRIDE_USERS="user_123,user_456"
export QUICK_TILE_EXPECTING_OVERRIDE_USERS="user_123,user_456"
export APP_SHORTCUTS_ENABLED_OVERRIDE_USERS="user_123,user_456"

# Deploy and monitor for 24 hours
```

#### Stage 2: Alpha Rollout (Week 2)
```bash
# 1% rollout in US only
export MISSED_CALL_ACTIONS_PERCENTAGE=1
export MISSED_CALL_ACTIONS_GEOS="US"

export QUICK_TILE_PERCENTAGE=1
export QUICK_TILE_GEOS="US"

export APP_SHORTCUTS_PERCENTAGE=1
export APP_SHORTCUTS_GEOS="US"

# Keep risk scoring OFF
export ENABLE_RISK_SCORING=false
export RISK_SHADOW_MODE=true
```

#### Stage 3: Beta Rollout (Week 3)
```bash
# 10% rollout, expand geos
export MISSED_CALL_ACTIONS_PERCENTAGE=10
export MISSED_CALL_ACTIONS_GEOS="US,CA"

export QUICK_TILE_PERCENTAGE=10
export QUICK_TILE_GEOS="US,CA"

export APP_SHORTCUTS_PERCENTAGE=10
export APP_SHORTCUTS_GEOS="US,CA"

# Enable templates at 25%
export TEMPLATES_PERCENTAGE=25
export WHATSAPP_PERCENTAGE=25

# Risk scoring in shadow mode only
export ENABLE_RISK_SCORING=true
export RISK_SHADOW_MODE=true
export RISK_SCORING_PERCENTAGE=5
```

#### Stage 4: General Availability (Week 4)
```bash
# 50% rollout
export MISSED_CALL_ACTIONS_PERCENTAGE=50
export QUICK_TILE_PERCENTAGE=50
export APP_SHORTCUTS_PERCENTAGE=50
export IDENTITY_LOOKUP_PERCENTAGE=25

# Templates at 50%
export TEMPLATES_PERCENTAGE=50
export WHATSAPP_PERCENTAGE=50

# Risk scoring still shadow at 10%
export RISK_SCORING_PERCENTAGE=10
```

#### Stage 5: Full Rollout (Week 5)
```bash
# 100% for stable features
export MISSED_CALL_ACTIONS_PERCENTAGE=100
export QUICK_TILE_PERCENTAGE=100
export APP_SHORTCUTS_PERCENTAGE=100
export IDENTITY_LOOKUP_PERCENTAGE=50

export TEMPLATES_PERCENTAGE=100
export WHATSAPP_PERCENTAGE=100

# Risk scoring at 25% shadow
export RISK_SCORING_PERCENTAGE=25
```

### Emergency Procedures

#### Immediate Kill Switch
```bash
# In case of critical issue, activate kill switch immediately
curl -X POST https://api.verifd.com/config/kill-switch \
  -H "Content-Type: application/json" \
  -d '{
    "active": true,
    "adminToken": "${ADMIN_KILL_SWITCH_TOKEN}"
  }'

# Notify team
./scripts/notify-oncall.sh "KILL SWITCH ACTIVATED"
```

#### Rollback Single Feature
```bash
# Disable specific feature
export MISSED_CALL_ACTIONS_PERCENTAGE=0

# Or use environment variable override
export ENABLE_MISSED_CALL_ACTIONS=false

# Deploy immediately
kubectl rollout restart deployment/backend
```

### Monitoring Checklist

#### Real-Time Metrics
- [ ] Feature adoption rate per flag
- [ ] Error rate by feature flag
- [ ] Kill switch activation count
- [ ] Config fetch success rate
- [ ] Cache hit rate

#### Shadow Mode Metrics (Risk Scoring)
- [ ] False positive rate
- [ ] False negative rate  
- [ ] Score distribution
- [ ] Processing latency
- [ ] ASN coverage

#### User Impact
- [ ] vPass grant rate change
- [ ] Call completion rate
- [ ] App crash rate by version
- [ ] User complaints/feedback

### Platform-Specific Considerations

#### iOS Release
- [ ] App Store review notes include feature flag disclosure
- [ ] IdentityLookup extension tested with flags OFF
- [ ] Shortcuts appear only when flag enabled
- [ ] Time-Sensitive notifications gated properly

#### Android Release  
- [ ] Play Store staged rollout aligns with feature flags
- [ ] CallScreeningService handles flag changes
- [ ] Quick Tile hidden when flag OFF
- [ ] Notification actions respect flags

#### Web Release
- [ ] Templates render conditionally
- [ ] WhatsApp links respect geo restrictions
- [ ] Feature detection in browser
- [ ] Graceful degradation

### Version Requirements

#### Minimum Versions
```javascript
// apps/backend/.env
QUICK_TILE_MIN_VERSION=1.0.0
APP_SHORTCUTS_MIN_VERSION=1.0.0
IDENTITY_LOOKUP_MIN_VERSION=1.0.0

// Bump for breaking changes
MISSED_CALL_ACTIONS_MIN_VERSION=1.1.0  // If API changes
```

#### Maximum Versions (Deprecation)
```javascript
// Force upgrade for old clients
LEGACY_FEATURE_MAX_VERSION=0.9.9  // Disable for < 1.0.0
```

### Testing Matrix

| Feature | Device | Geo | Version | Cohort % | Expected |
|---------|--------|-----|---------|----------|----------|
| MISSED_CALL_ACTIONS | Android | US | 1.0.0 | 10% | Enabled for 10% |
| MISSED_CALL_ACTIONS | Android | FR | 1.0.0 | 10% | Disabled (geo) |
| MISSED_CALL_ACTIONS | iOS | US | 1.0.0 | 10% | Disabled (device) |
| QUICK_TILE_EXPECTING | Android | US | 0.9.0 | 100% | Disabled (version) |
| APP_SHORTCUTS_ENABLED | iOS | US | 1.0.0 | 50% | Enabled for 50% |
| enableRiskScoring | Any | US | Any | 5% | Shadow mode only |

### Post-Release Validation

```bash
# Check feature distribution
./scripts/analyze-rollout.sh --feature MISSED_CALL_ACTIONS

# Output:
# Total users: 10,000
# Feature enabled: 1,023 (10.23%)
# By geo: US: 823, CA: 200
# By version: 1.0.0: 900, 1.0.1: 123
# Errors: 2 (0.02%)
```

### Rollback Criteria

Automatic rollback if:
- Error rate > 5% for any feature
- Crash rate increases > 2%
- vPass grant rate drops > 10%  
- More than 10 user complaints in 1 hour

Manual rollback if:
- App Store/Play Store rejection
- Security vulnerability discovered
- Performance degradation > 20%
- Business metrics decline

### Sign-Off Requirements

- [ ] PM approval for rollout percentages
- [ ] QA sign-off on staging tests
- [ ] Security review of risk thresholds
- [ ] Legal review of geo restrictions
- [ ] On-call engineer designated
- [ ] Rollback plan documented
- [ ] Kill switch token secured

## Final Checks

```bash
# Run full validation suite
./scripts/validate-release.sh

# Expected output:
✅ All features default OFF
✅ Kill switch functional
✅ Config endpoint healthy
✅ Rollback scripts ready
✅ Monitoring dashboards live
✅ On-call rotation confirmed

READY FOR RELEASE
```