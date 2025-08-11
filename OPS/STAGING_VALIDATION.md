# Staging Validation Documentation

## Overview

This document outlines the staging preflight system for verifd, including tester overrides, signed configuration, and validation procedures.

## Staging Override System

### Override Phone Numbers

The following phone numbers have elevated privileges in the staging environment:

1. **+919233600392** (Primary Staging Tester)
2. **+917575854485** (Secondary Staging Tester)

### Override Features

Staging override users receive:

- **MISSED_CALL_ACTIONS**: 100% enabled (always active)
- **enableTemplates**: true
- **enableRiskScoring**: 'shadow' mode (enabled but non-blocking)
- **bypassGeoRestrictions**: true (ignores geo-targeting)

### Default Configuration

**Staging Environment Defaults:**
- Default GEO gate: `IN` (India) via `MISSED_CALL_ACTIONS_GEOS='IN'`
- Override users bypass all GEO restrictions
- Base feature rollout percentages: 50% for most features, 75% for templates/WhatsApp

## Configuration Signing

### Ed25519 Signature System

**Staging Configuration:**
- **KID (Key ID)**: `staging-2025-001`
- **Environment Variable**: `STAGING_ED25519_PRIVATE_KEY` (hex format)
- **Signature Algorithm**: Ed25519
- **Payload**: Deterministic JSON (sorted keys)

**Response Format:**
```json
{
  "GLOBAL_KILL_SWITCH": false,
  "MISSED_CALL_ACTIONS": { ... },
  "enableTemplates": { ... },
  "enableRiskScoring": { ... },
  // ... other config
  "signature": "base64-encoded-signature",
  "kid": "staging-2025-001",
  "signedAt": "2025-01-11T12:00:00.000Z"
}
```

### Verification Process

1. Extract signature and KID from config response
2. Reconstruct payload (sorted JSON without signature fields)
3. Verify signature using staging public key
4. Validate KID matches expected staging identifier

## API Endpoints

### Feature Configuration
```
GET /config/features?phone=+919233600392
Headers:
  x-user-id: optional-user-id
  x-geo-location: IN
  x-device-type: android
  x-app-version: 1.0.0
```

### Staging Override Information
```
GET /config/staging-overrides
```
**Response:**
```json
{
  "overrideNumbers": ["+919233600392", "+917575854485"],
  "environment": "staging",
  "defaultGeoGate": "IN",
  "stagingKID": "staging-2025-001",
  "signingEnabled": true
}
```

### Health Check
```
GET /config/health
```

## Web-Verify Integration

### Staging Environment Detection

**URL Pinning:**
- Staging builds always use: `https://staging.api.verifd.com`
- Triggered by:
  - `NEXT_PUBLIC_FORCE_STAGING=true`
  - `VERCEL_ENV=preview`
  - Hostname contains 'staging'

**UI Indicators:**
- Orange 'STAGING' badge displayed on form
- Badge styling: `bg-orange-100 text-orange-800 border-orange-300`

### Configuration Sources

```typescript
// Environment detection priority:
1. NEXT_PUBLIC_FORCE_STAGING=true → staging
2. VERCEL_ENV=preview → staging  
3. hostname.includes('staging') → staging
4. NODE_ENV=development → development
5. Default → production
```

## Current Configuration Snapshot

### Staging KID
- **Active KID**: `staging-2025-001`
- **Generated**: 2025-01-11
- **Algorithm**: Ed25519
- **Purpose**: Configuration signature verification

### Override Matrix

| Feature | Production | Staging Default | Override Users |
|---------|------------|-----------------|----------------|
| MISSED_CALL_ACTIONS | 0% | 50% | 100% |
| QUICK_TILE_EXPECTING | 0% | 50% | 50% |
| APP_SHORTCUTS_ENABLED | 0% | 50% | 50% |
| IDENTITY_LOOKUP_ENABLED | 0% | 25% | 25% |
| enableTemplates | 0% | 75% | **true** |
| enableWhatsApp | 0% | 75% | 75% |
| enableRiskScoring | OFF | 10% | **shadow** |

### Geographic Targeting

| Feature | Production GEOs | Staging Default | Override Behavior |
|---------|----------------|-----------------|-------------------|
| MISSED_CALL_ACTIONS | US,CA | **IN** | **Bypass** |
| All others | Various | Various | **Bypass** |

## Validation Checklist

### Pre-Deploy Validation

- [ ] Staging override numbers configured correctly
- [ ] Ed25519 private key loaded in environment
- [ ] KID matches expected value
- [ ] Default geo gate set to IN
- [ ] Web-verify pins to staging URL
- [ ] STAGING badge displays correctly

### Runtime Validation

- [ ] Override users receive elevated permissions
- [ ] Configuration signatures validate
- [ ] Geo restrictions bypass for override users
- [ ] Audit logs capture override applications
- [ ] Kill switch functionality works
- [ ] Fallback behavior functions correctly

### Security Verification

- [ ] Private keys secured in environment variables
- [ ] Override functionality limited to staging
- [ ] Audit trails log all config requests
- [ ] Signature validation prevents tampering
- [ ] Override users clearly identified in logs

## Troubleshooting

### Common Issues

1. **Override not working**: Check phone number format normalization
2. **Signature validation fails**: Verify KID and key format
3. **Geo gate not applied**: Check environment detection
4. **STAGING badge missing**: Verify config detection logic

### Debug Endpoints

```bash
# Check override status
curl "https://staging.api.verifd.com/config/staging-overrides"

# Test config with override
curl "https://staging.api.verifd.com/config/features?phone=%2B919233600392" \
  -H "x-geo-location: IN" \
  -H "x-device-type: android"

# Health check
curl "https://staging.api.verifd.com/config/health"
```

### Log Monitoring

Key log events to monitor:
- `Feature config requested` (INFO): All config requests
- `Staging override applied to config` (WARN): Override applications
- `Failed to sign config` (ERROR): Signing issues

---

**Last Updated**: 2025-01-11  
**Next Review**: Before production release  
**Environment**: Staging preflight system