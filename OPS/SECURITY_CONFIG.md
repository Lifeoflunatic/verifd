# Security Configuration Guide

## Sticky Cohorts & Deterministic Assignment

### Overview
Users are assigned to cohorts deterministically using a hash-based bucketing system that ensures consistency across sessions.

### Implementation
```typescript
bucket = hash(device_id + feature + salt) % 100
```

- **Device ID**: Unique, persistent identifier per device
- **Feature**: Name of the feature flag
- **Salt**: Per-feature salt, rotated every 30 days
- **Bucket**: 0-99, determines cohort membership

### Benefits
- Users stay in same cohort across app restarts
- A/B test validity maintained
- No cohort pollution from reassignments
- Deterministic rollback if needed

### Salt Management
```typescript
// Salt rotation (monthly)
const salt = crypto.randomBytes(16).toString('hex');
localStorage.setItem(`verifd_cohort_salt_${feature}`, salt);
```

## Signed Configuration (Ed25519)

### Key Generation
```bash
# Generate Ed25519 key pair
openssl genpkey -algorithm ED25519 -out config-private.pem
openssl pkey -in config-private.pem -pubout -out config-public.pem

# Extract public key for clients
openssl pkey -in config-private.pem -pubout | tail -n +2 | head -n -1
```

### Configuration Signing Flow

1. **Server generates config payload**:
```json
{
  "config": { /* feature flags */ },
  "timestamp": "2025-08-11T10:00:00Z",
  "validUntil": "2025-08-11T10:05:00Z",
  "version": "1.0.1"
}
```

2. **Server signs with private key**:
```typescript
const signature = crypto.sign(
  'SHA256',
  Buffer.from(JSON.stringify(payload)),
  privateKey
);
```

3. **Client verifies signature**:
```typescript
const isValid = crypto.verify(
  'SHA256',
  Buffer.from(payload),
  publicKey,
  Buffer.from(signature, 'base64')
);
```

### Key Rotation Schedule

- **Current Key**: `verifd-config-key-1`
- **Rotation**: Every 30 days
- **Overlap Period**: 7 days (both keys valid)
- **Emergency Rotation**: Via admin endpoint

### Public Key Distribution
```
GET /config/public-key

{
  "keyId": "verifd-config-key-1",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n...",
  "algorithm": "Ed25519",
  "validUntil": "2025-09-11T00:00:00Z"
}
```

## Admin Audit Log

### Append-Only Log Structure
Location: `./logs/config-audit.jsonl`

Each line is a JSON entry:
```json
{
  "id": "a1b2c3d4e5f6",
  "timestamp": "2025-08-11T10:00:00Z",
  "actor": "admin@verifd.com",
  "action": "kill_switch_activate",
  "target": "GLOBAL_KILL_SWITCH",
  "previousValue": false,
  "newValue": true,
  "reason": "High error rate detected in production",
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0..."
}
```

### Audit Actions
- `kill_switch_activate` - Global kill switch turned ON
- `kill_switch_deactivate` - Global kill switch turned OFF
- `flag_update` - Feature flag configuration changed
- `key_rotation` - Signing key rotated

### Querying Audit Log
```bash
# Get recent actions
curl "https://api.verifd.com/config/admin-audit?adminToken=${TOKEN}&limit=50"

# Filter by actor
curl "https://api.verifd.com/config/admin-audit?adminToken=${TOKEN}&actor=admin@verifd.com"

# Get actions since timestamp
curl "https://api.verifd.com/config/admin-audit?adminToken=${TOKEN}&since=2025-08-11T00:00:00Z"
```

## Device Authentication (HMAC)

### HMAC Format
```
X-Device-Auth: HMAC <timestamp>:<nonce>:<signature>
X-Device-Id: <device_uuid>
```

### Signature Calculation
```typescript
payload = `${deviceId}:${timestamp}:${nonce}`
signature = HMAC-SHA256(payload, secret)
```

### Validation Rules
1. Timestamp must be within 5 minutes
2. Nonce must be unique (prevent replay)
3. Signature must match expected value
4. Rate limits enforced per IP and device

### Rate Limits
- **Per IP**: 100 requests/minute
- **Per Device**: 50 requests/minute
- **Telemetry Burst**: 10 requests/second

## Version Monotonicity

### Rules
1. Config version must be >= current version
2. Timestamp must be recent (< 5 minutes old)
3. ValidUntil must be in future
4. Reject if signature missing or invalid

### Client Behavior
```typescript
if (newVersion < currentVersion) {
  reject('Version rollback detected');
}

if (timestamp > Date.now()) {
  reject('Config timestamp in future');
}

if (validUntil < Date.now()) {
  reject('Config expired');
}
```

## Security Headers

### Config Endpoints
```
Cache-Control: public, max-age=300
X-Config-Signature: <base64_signature>
X-Config-Key-Id: verifd-config-key-1
Vary: X-Device-Id
```

### Telemetry Endpoints
```
Cache-Control: no-store
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```

## Environment Variables

### Required for Production
```bash
# Admin tokens
CONFIG_ADMIN_TOKEN=<random_64_chars>
TELEMETRY_ADMIN_TOKEN=<random_64_chars>
ADMIN_KILL_SWITCH_TOKEN=<random_64_chars>

# Device auth
DEVICE_AUTH_SECRET=<random_64_chars>

# Audit log
AUDIT_LOG_PATH=/var/log/verifd/config-audit.jsonl

# Key management
CONFIG_PRIVATE_KEY_PATH=/secrets/config-private.pem
CONFIG_PUBLIC_KEY_PATH=/secrets/config-public.pem
```

## Emergency Procedures

### Activate Kill Switch
```bash
curl -X POST https://api.verifd.com/config/kill-switch \
  -H "Content-Type: application/json" \
  -d '{
    "active": true,
    "adminToken": "${ADMIN_KILL_SWITCH_TOKEN}"
  }'
```

### Rotate Signing Key (Emergency)
```bash
# Generate new key
openssl genpkey -algorithm ED25519 -out new-config-private.pem

# Extract public key
PUBLIC_KEY=$(openssl pkey -in new-config-private.pem -pubout | tail -n +2 | head -n -1)

# Rotate via API
curl -X POST https://api.verifd.com/config/admin/rotate-key \
  -H "Content-Type: application/json" \
  -d '{
    "oldKeyId": "verifd-config-key-1",
    "newKeyId": "verifd-config-key-2",
    "newPublicKey": "'${PUBLIC_KEY}'",
    "adminToken": "${CONFIG_ADMIN_TOKEN}"
  }'
```

### View Audit Trail
```bash
# Last 100 admin actions
curl "https://api.verifd.com/config/admin-audit?adminToken=${TOKEN}"

# Statistics
curl "https://api.verifd.com/config/admin-audit/stats?adminToken=${TOKEN}"
```

## Monitoring & Alerts

### Key Metrics
- Config signature verification failures
- Rate limit violations (429 responses)
- Invalid device auth attempts
- Audit log write failures
- Key rotation events

### Alert Thresholds
- **Signature Failures**: > 1% of requests
- **Rate Limits**: > 100 violations/minute
- **Auth Failures**: > 50 failures/minute
- **Kill Switch**: Any activation
- **Key Rotation**: Any occurrence

## Security Checklist

### Daily
- [ ] Review audit log for anomalies
- [ ] Check signature verification success rate
- [ ] Monitor rate limit violations

### Weekly
- [ ] Analyze device auth patterns
- [ ] Review cohort distribution
- [ ] Check config cache hit rates

### Monthly
- [ ] Rotate salts for cohort assignment
- [ ] Rotate signing keys
- [ ] Review and update rate limits
- [ ] Audit admin access logs

### Quarterly
- [ ] Security audit of config endpoints
- [ ] Penetration testing
- [ ] Review emergency procedures
- [ ] Update this documentation