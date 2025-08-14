# Abuse & Rate Limiting Playbook

## Quick Reference

### Immediate Actions
1. **High Rate Limit Violations** → Activate IP blocklist
2. **Config Tampering Attempts** → Rotate signing keys
3. **Telemetry Flooding** → Enable strict mode
4. **Auth Bypass Attempts** → Activate kill switch

## Rate Limiting Thresholds

### Config Endpoints
| Endpoint | Per IP | Per Device | Window | Response |
|----------|--------|------------|--------|----------|
| `/config/features` | 100/min | 50/min | 60s | 429 + retry-after |
| `/config/signed` | 100/min | 50/min | 60s | 429 + retry-after |
| `/config/public-key` | 10/min | - | 60s | 429 |
| `/config/admin/*` | 10/min | - | 60s | 429 + log |

### Telemetry Endpoints
| Endpoint | Per IP | Per Device | Window | Response |
|----------|--------|------------|--------|----------|
| `/telemetry/metrics` | 60/min | 30/min | 60s | 429 |
| `/telemetry/dashboard` | 20/min | - | 60s | 429 |
| Burst protection | 10/sec | 5/sec | 1s | 429 |

### Authentication Failures
| Type | Threshold | Action |
|------|-----------|--------|
| Invalid HMAC | 10/min/IP | 1-hour IP ban |
| Expired timestamp | 20/min/IP | Warning log |
| Missing auth | 50/min/IP | 15-min IP ban |
| Invalid device ID | 5/min/IP | 24-hour device ban |

## Detection Patterns

### Config Abuse
```sql
-- Query for config abuse patterns
SELECT 
  ip_address,
  COUNT(*) as request_count,
  COUNT(DISTINCT device_id) as unique_devices,
  AVG(CASE WHEN status = 429 THEN 1 ELSE 0 END) as rate_limit_ratio
FROM request_logs
WHERE endpoint LIKE '/config%'
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING request_count > 500
  OR unique_devices > 10
  OR rate_limit_ratio > 0.1
ORDER BY request_count DESC;
```

### Telemetry Flooding
```sql
-- Detect telemetry flooding
SELECT 
  device_id,
  COUNT(*) as metric_count,
  SUM(json_array_length(metrics)) as total_metrics,
  MAX(timestamp) - MIN(timestamp) as time_span
FROM telemetry_logs
WHERE timestamp > NOW() - INTERVAL '5 minutes'
GROUP BY device_id
HAVING metric_count > 100
  OR total_metrics > 10000
ORDER BY total_metrics DESC;
```

### Authentication Anomalies
```sql
-- Find auth anomalies
SELECT 
  ip_address,
  COUNT(DISTINCT device_id) as devices_per_ip,
  SUM(CASE WHEN auth_status = 'invalid_hmac' THEN 1 ELSE 0 END) as invalid_hmacs,
  SUM(CASE WHEN auth_status = 'expired' THEN 1 ELSE 0 END) as expired_timestamps
FROM auth_logs
WHERE timestamp > NOW() - INTERVAL '15 minutes'
GROUP BY ip_address
HAVING devices_per_ip > 5
  OR invalid_hmacs > 10
  OR expired_timestamps > 20;
```

## Response Procedures

### Level 1: Automated Response (0-5 min)
```bash
# Rate limiting kicks in automatically
# No manual intervention needed

# Monitor dashboard
watch -n 5 'curl -s localhost:9090/metrics | grep rate_limit'
```

### Level 2: Targeted Blocking (5-15 min)
```bash
# Block specific IP
echo "192.168.1.100" >> /etc/verifd/ip_blocklist.txt
systemctl reload verifd-api

# Block device ID
redis-cli SETEX "blocked:device:${DEVICE_ID}" 86400 "abuse"

# Verify blocks
tail -f /var/log/verifd/blocked.log
```

### Level 3: Service Degradation (15-30 min)
```bash
# Enable strict mode (reduces rate limits by 50%)
export RATE_LIMIT_STRICT_MODE=true
kubectl set env deployment/backend RATE_LIMIT_STRICT_MODE=true

# Disable non-essential endpoints
export DISABLE_TELEMETRY=true
export DISABLE_DASHBOARD=true
kubectl rollout restart deployment/backend

# Monitor impact
curl -s localhost:9090/metrics | grep -E 'request_rate|error_rate'
```

### Level 4: Emergency Kill Switch (30+ min)
```bash
# Activate global kill switch
./scripts/emergency-kill-switch.sh activate

# Notify team
./scripts/notify-oncall.sh "KILL SWITCH ACTIVATED - Abuse detected"

# Begin investigation
./scripts/export-abuse-logs.sh --last-hour > abuse_report.json
```

## Blocklist Management

### IP Blocklist
```bash
# Add IP to blocklist
echo "192.168.1.100 # Added $(date) - Reason: Config flooding" >> /etc/verifd/ip_blocklist.txt

# Remove IP from blocklist
sed -i '/192.168.1.100/d' /etc/verifd/ip_blocklist.txt

# View current blocklist
cat /etc/verifd/ip_blocklist.txt | grep -v "^#" | wc -l
```

### Device Blocklist
```bash
# Block device for 24 hours
redis-cli SETEX "blocked:device:${DEVICE_ID}" 86400 "abuse_detected"

# Permanent device block
redis-cli SET "blocked:device:${DEVICE_ID}" "permanent_ban"

# Check if device blocked
redis-cli GET "blocked:device:${DEVICE_ID}"

# Unblock device
redis-cli DEL "blocked:device:${DEVICE_ID}"
```

### ASN Blocklist (Network-wide)
```bash
# Block entire ASN (use carefully!)
echo "AS13335 # Cloudflare - Suspicious activity" >> /etc/verifd/asn_blocklist.txt

# Emergency: Block all VPN/Proxy ASNs
cat /etc/verifd/vpn_asn_list.txt >> /etc/verifd/asn_blocklist.txt
```

## Testing Procedures

### Test Rate Limiting
```bash
# Test IP rate limit
for i in {1..150}; do
  curl -H "X-Device-Id: test-device" \
       -H "X-Device-Auth: HMAC $(date +%s):nonce:sig" \
       https://api.verifd.com/config/features &
done
wait
# Should see 429 responses after 100 requests

# Test device rate limit
DEVICE_ID="test-device-$(uuidgen)"
for i in {1..60}; do
  curl -H "X-Device-Id: ${DEVICE_ID}" \
       -H "X-Device-Auth: HMAC $(date +%s):nonce:sig" \
       https://api.verifd.com/telemetry/metrics \
       -d '{"metrics":[]}' &
done
wait
# Should see 429 after 30 requests
```

### Test Authentication
```bash
# Test invalid HMAC (should get 401)
curl -H "X-Device-Id: test-device" \
     -H "X-Device-Auth: HMAC $(date +%s):nonce:invalid" \
     https://api.verifd.com/config/features

# Test expired timestamp (should get 401)
OLD_TS=$(($(date +%s) - 400))
curl -H "X-Device-Id: test-device" \
     -H "X-Device-Auth: HMAC ${OLD_TS}:nonce:sig" \
     https://api.verifd.com/config/features

# Test missing auth (should get 401)
curl https://api.verifd.com/telemetry/metrics -d '{}'
```

## Monitoring Queries

### Grafana Alerts
```yaml
# High rate limit violations
alert: HighRateLimitViolations
expr: rate(http_requests_total{status="429"}[5m]) > 10
for: 2m
labels:
  severity: warning
annotations:
  summary: "High rate of 429 responses"

# Authentication failures spike
alert: AuthFailureSpike
expr: rate(auth_failures_total[5m]) > 50
for: 1m
labels:
  severity: critical
annotations:
  summary: "Authentication failures spiking"

# Config signature failures
alert: ConfigSignatureFailures
expr: rate(config_signature_invalid_total[5m]) > 1
for: 2m
labels:
  severity: critical
annotations:
  summary: "Config signature verification failures"
```

### CloudWatch Metrics
```typescript
// Log rate limit violations
putMetricData({
  Namespace: 'Verifd/Abuse',
  MetricData: [{
    MetricName: 'RateLimitViolations',
    Value: 1,
    Unit: 'Count',
    Dimensions: [
      { Name: 'Endpoint', Value: request.url },
      { Name: 'Type', Value: 'IP' }
    ]
  }]
});

// Log auth failures
putMetricData({
  Namespace: 'Verifd/Security',
  MetricData: [{
    MetricName: 'AuthenticationFailures',
    Value: 1,
    Unit: 'Count',
    Dimensions: [
      { Name: 'Reason', Value: 'invalid_hmac' },
      { Name: 'IP', Value: request.ip }
    ]
  }]
});
```

## Incident Response

### Severity Levels
- **SEV1**: Service down, kill switch activated
- **SEV2**: Degraded service, strict mode enabled
- **SEV3**: Elevated abuse, automated blocking active
- **SEV4**: Normal rate limiting, monitoring only

### Escalation Path
1. **0-5 min**: Automated systems respond
2. **5-15 min**: On-call engineer notified
3. **15-30 min**: Team lead involved
4. **30+ min**: Security team engaged

### Communication Template
```
Subject: [SEV2] Abuse Detection - Config Endpoint

Status: Investigating
Impact: Rate limiting activated on /config/*
Started: 2025-08-11 10:00 UTC

Actions Taken:
- Enabled strict rate limiting
- Blocked 3 IP addresses
- Rotated signing keys

Next Steps:
- Analyze traffic patterns
- Review audit logs
- Consider expanding blocklist

ETA: 30 minutes
```

## Recovery Procedures

### After Blocking Abuse
```bash
# 1. Verify abuse has stopped
tail -f /var/log/verifd/access.log | grep -E "429|401"

# 2. Gradually restore service
export RATE_LIMIT_STRICT_MODE=false
kubectl set env deployment/backend RATE_LIMIT_STRICT_MODE=false

# 3. Remove temporary blocks (after 24h)
redis-cli --scan --pattern "blocked:*" | xargs redis-cli DEL

# 4. Generate incident report
./scripts/generate-abuse-report.sh --incident-id $(date +%Y%m%d-%H%M)
```

### Post-Incident Review
1. Timeline of events
2. Detection effectiveness
3. Response time analysis
4. Blocklist accuracy
5. False positive rate
6. Customer impact assessment
7. Process improvements

## Prevention Measures

### Proactive Monitoring
- Daily review of rate limit metrics
- Weekly analysis of auth patterns
- Monthly review of blocklists
- Quarterly security audit

### Hardening Checklist
- [ ] Rate limits configured
- [ ] Device auth enabled
- [ ] Signature verification active
- [ ] Audit logging enabled
- [ ] Blocklists updated
- [ ] Monitoring alerts configured
- [ ] Runbooks tested
- [ ] Team trained

## Contact Information

### On-Call
- Primary: +1-555-ONCALL1
- Secondary: +1-555-ONCALL2
- Escalation: security@verifd.com

### External Resources
- AWS Shield: https://console.aws.amazon.com/shield
- Cloudflare: https://dash.cloudflare.com
- PagerDuty: https://verifd.pagerduty.com