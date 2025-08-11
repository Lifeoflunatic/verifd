# Key Rotation Procedures

## Overview
This document outlines the Ed25519 signing key rotation procedures for verifd's configuration system. The system uses dual-key verification with automatic rotation and drift detection.

## Key Lifecycle

### Timeline
- **Day 0-30**: Primary key active
- **Day 23-30**: Dual-key window (both primary and secondary valid)
- **Day 30**: Secondary key promoted to primary
- **Day 30+**: Old primary key expires

### Automatic Rotation Schedule
```
Day 0    Day 23   Day 30   Day 37
  |---------|--------|--------|
  Primary    Dual     New      Next
  Only       Keys     Primary  Rotation
```

## JWKS Endpoint

Public keys are available at:
```
https://api.verifd.com/.well-known/jwks.json
```

Example response:
```json
{
  "keys": [
    {
      "kid": "verifd_1705344000_abc123",
      "alg": "EdDSA",
      "use": "sig",
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "MCowBQYDK2VwAyEA...",
      "validFrom": "2025-01-15T00:00:00Z",
      "validUntil": "2025-02-14T23:59:59Z",
      "isPrimary": true
    }
  ]
}
```

## Manual Rotation Procedures

### 1. Check Current Schedule
```bash
curl -H "Authorization: Bearer ${ADMIN_API_KEY}" \
  https://api.verifd.com/config/keys/schedule | jq '.'
```

Response shows:
- Current primary key and days remaining
- Current secondary key and promotion date
- Next scheduled rotation

### 2. Trigger Manual Rotation
```bash
curl -X POST https://api.verifd.com/config/keys/rotate \
  -H "Content-Type: application/json" \
  -d '{
    "adminToken": "${ADMIN_KEY_ROTATION_TOKEN}",
    "reason": "Scheduled monthly rotation"
  }'
```

### 3. Verify New Keys
```bash
# Test signature with new key
curl -X POST https://api.verifd.com/config/keys/verify \
  -H "Content-Type: application/json" \
  -d '{
    "payload": "test-payload",
    "signature": "base64-signature",
    "kid": "verifd_1705344000_abc123"
  }'
```

## Client Implementation

### Headers Required
```http
X-Config-Signature: base64-encoded-signature
X-Config-KID: verifd_1705344000_abc123
```

### Client Verification Code
```typescript
async function verifyConfig(config: any, signature: string, kid: string) {
  // Fetch current JWKS
  const jwks = await fetch('https://api.verifd.com/.well-known/jwks.json')
    .then(r => r.json());
  
  // Find key by KID
  const key = jwks.keys.find(k => k.kid === kid);
  if (!key) {
    console.error(`Unknown KID: ${kid}`);
    // Try refreshing JWKS cache
    return false;
  }
  
  // Verify signature
  return crypto.verify(
    'sha256',
    Buffer.from(JSON.stringify(config)),
    key.x,
    Buffer.from(signature, 'base64')
  );
}
```

## Drift Detection & Alerts

### Alert Types

#### Critical Alerts (Immediate Action)
- **unknown_kid**: Client using unrecognized key ID
- **signature_verification_failed**: Signature invalid with all keys
- **high_unknown_kid_rate**: >10 unknown KID errors/hour

#### Warning Alerts (Monitor)
- **secondary_key_usage**: Client using older (secondary) key
- **kid_mismatch_primary**: Valid signature but wrong KID
- **high_secondary_usage**: >50 clients using secondary key/hour

#### Info Alerts (Audit)
- **key_rotation_initiated**: New rotation started
- **key_promoted**: Secondary promoted to primary

### Check Drift Report
```bash
curl -H "Authorization: Bearer ${ADMIN_API_KEY}" \
  https://api.verifd.com/config/keys/drift-report | jq '.'
```

Example output:
```json
{
  "period": "24h",
  "totalAlerts": 127,
  "byType": {
    "secondary_key_usage": 95,
    "unknown_kid": 12,
    "kid_mismatch_primary": 20
  },
  "criticalAlerts": [
    {
      "type": "unknown_kid",
      "kid": "invalid_key_123",
      "timestamp": "2025-01-15T10:30:00Z",
      "severity": "critical"
    }
  ]
}
```

## Calendar Reminders

### Monthly Tasks (1st of each month)
1. Review drift report
2. Check rotation schedule
3. Verify JWKS endpoint
4. Update client libraries if needed

### Quarterly Tasks
1. Audit key usage patterns
2. Review alert thresholds
3. Test manual rotation procedure
4. Update this documentation

## Monitoring Queries

### Grafana Dashboard
```promql
# Unknown KID rate
rate(key_drift_alerts_total{type="unknown_kid"}[1h])

# Secondary key usage
sum(key_drift_alerts_total{type="secondary_key_usage"})

# Successful verifications by key
rate(signature_verifications_total[5m]) by (kid, result)
```

### Alert Rules
```yaml
- alert: HighUnknownKIDRate
  expr: rate(key_drift_alerts_total{type="unknown_kid"}[1h]) > 0.1
  for: 5m
  annotations:
    summary: "High rate of unknown KID errors"
    description: "{{ $value }} unknown KID errors per second"

- alert: KeyRotationOverdue
  expr: days_until_key_expiry < 7
  for: 1h
  annotations:
    summary: "Key rotation overdue"
    description: "Primary key expires in {{ $value }} days"
```

## Troubleshooting

### Issue: Clients rejecting valid configs
**Symptoms**: Valid configs with correct signatures being rejected
**Causes**:
1. Client JWKS cache is stale
2. Clock skew between client and server
3. Client using wrong KID

**Resolution**:
```bash
# Force JWKS refresh on client
curl -X POST https://client.example.com/admin/refresh-keys

# Check time sync
ntpdate -q time.google.com

# Verify KID in use
curl -I https://api.verifd.com/config/features | grep X-Config-KID
```

### Issue: High secondary key usage
**Symptoms**: Many clients still using secondary key after rotation
**Resolution**:
1. Check client deployment status
2. Verify JWKS caching headers
3. Consider extending dual-key window
4. Send client update notifications

### Issue: Rotation failed
**Symptoms**: Manual rotation returns error
**Resolution**:
```bash
# Check key storage permissions
ls -la /var/lib/verifd/keys/

# Verify entropy available
cat /proc/sys/kernel/random/entropy_avail

# Check audit logs
tail -f /var/log/verifd/key-rotation.log

# Attempt rotation with debug
DEBUG=crypto:* curl -X POST ...
```

## Security Considerations

### Key Storage
- Private keys stored in HashiCorp Vault
- Accessed via IAM role authentication
- Automatic key backup to S3 with KMS encryption
- Audit logging for all key operations

### Key Distribution
- Public keys via JWKS endpoint only
- 1-hour cache for JWKS responses
- TLS 1.3 required for all endpoints
- Rate limiting on verification endpoint

### Compliance
- Monthly key rotation meets SOC2 requirements
- Dual-key window prevents service disruption
- All rotations logged for audit trail
- Automated alerts for anomalies

## Rollback Procedure

If rotation causes issues:

1. **Revert to previous key**:
```bash
vault kv rollback -version=-1 secret/verifd/signing-keys
```

2. **Update JWKS**:
```bash
kubectl rollout restart deployment/backend
```

3. **Notify clients**:
```bash
# Send webhook to all registered clients
curl -X POST https://api.verifd.com/admin/notify-key-rollback \
  -d '{"adminToken": "${ADMIN_TOKEN}"}'
```

4. **File incident report**:
- Document time of issue
- Capture drift report
- Review client logs
- Update runbook

## Appendix

### Generate Test Keypair
```bash
openssl genpkey -algorithm ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
```

### Convert to JWKS Format
```javascript
const fs = require('fs');
const crypto = require('crypto');

const publicKey = crypto.createPublicKey(
  fs.readFileSync('public.pem')
);

const jwk = publicKey.export({ format: 'jwk' });
console.log(JSON.stringify(jwk, null, 2));
```

### Verify Signature Manually
```bash
echo -n "payload" | \
  openssl dgst -sha256 -sign private.pem | \
  base64
```