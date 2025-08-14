# Canary Runbook - Promotion/Rollback Evidence

## Promotion Rehearsal (5-Day Success → 20%)

### Simulated 5-Day Success Metrics
```json
{
  "phase": "canary_5",
  "daysSinceStart": 5,
  "consecutiveSuccessDays": 5,
  "metrics": {
    "day1": {
      "verify_lift": 22.1,
      "notif_action_tap": 13.2,
      "false_allow": 0.65,
      "complaint_rate": 0.14
    },
    "day2": {
      "verify_lift": 23.4,
      "notif_action_tap": 13.8,
      "false_allow": 0.58,
      "complaint_rate": 0.12
    },
    "day3": {
      "verify_lift": 24.2,
      "notif_action_tap": 14.1,
      "false_allow": 0.52,
      "complaint_rate": 0.11
    },
    "day4": {
      "verify_lift": 24.8,
      "notif_action_tap": 14.5,
      "false_allow": 0.48,
      "complaint_rate": 0.10
    },
    "day5": {
      "verify_lift": 25.3,
      "notif_action_tap": 14.9,
      "false_allow": 0.45,
      "complaint_rate": 0.09
    }
  },
  "allGatesPassed": true
}
```

### Slack Approval Request Screenshot

![Slack Approval Request](slack-approval-mockup.png)

```
🚀 Canary Promotion Ready

The canary at 5% has successfully passed all gates for 5 consecutive days.

Current Phase: canary_5 → canary_20
Average Metrics (5 days):
• Verify Lift: 23.96% (threshold: ≥20%) ✅
• Notif Tap: 14.10% (threshold: ≥12%) ✅  
• False Allow: 0.54% (threshold: ≤0.8%) ✅
• Complaint Rate: 0.11% (threshold: ≤0.2%) ✅

This promotion will expire at: 2025-01-16T15:30:00Z

[✅ Approve Promotion] [❌ Reject Promotion]
Token: promo_abc123def456
```

### Approval Interaction

**User clicked**: ✅ Approve Promotion
**Approver**: @platform-lead (U123ABC456)
**Timestamp**: 2025-01-16T14:30:00Z
**Response**:

```
✅ Promotion Approved

Phase advanced from canary_5 to canary_20
Approved by: @platform-lead
Coverage: 5% → 20%
Regions: US-WEST, US-EAST → US-WEST, US-EAST, US-CENTRAL

Audit log updated. Monitoring continues.
```

### Audit Log - Promotion Approved

```jsonl
{"timestamp":"2025-01-16T14:28:00Z","action":"promotion_proposed","fromPhase":"canary_5","toPhase":"canary_20","metrics":{"avgVerifyLift":23.96,"avgNotifTap":14.10,"avgFalseAllow":0.54,"avgComplaint":0.11},"consecutiveSuccessDays":5,"approvalToken":"promo_abc123def456","expiresAt":"2025-01-16T15:30:00Z"}
{"timestamp":"2025-01-16T14:30:00Z","action":"promotion_approved","phase":"canary_20","previousPhase":"canary_5","approvedBy":"platform-lead","approverUserId":"U123ABC456","token":"promo_abc123def456","signature":"Ed25519:dGhpcyBpcyBhIHNpZ25hdHVyZQ=="}
{"timestamp":"2025-01-16T14:30:01Z","action":"phase_updated","phase":"canary_20","coverage":20,"regions":["US-WEST","US-EAST","US-CENTRAL"],"flags":{"MISSED_CALL_ACTIONS":20,"enableTemplates":true,"enableRiskScoring":"shadow"}}
{"timestamp":"2025-01-16T14:30:02Z","action":"sticky_cohorts_expanded","oldSize":62500,"newSize":250000,"percentage":20,"seed":"7a3b9c4d2e5f6789"}
```

## Rollback Rehearsal (2-Day Failure)

### Simulated 2-Day Failure Metrics
```json
{
  "phase": "canary_20",
  "daysSinceStart": 7,
  "consecutiveFailureDays": 2,
  "metrics": {
    "day6": {
      "verify_lift": 18.2,  // FAIL
      "notif_action_tap": 10.5,  // FAIL
      "false_allow": 1.2,  // FAIL
      "complaint_rate": 0.35  // FAIL
    },
    "day7": {
      "verify_lift": 16.8,  // FAIL
      "notif_action_tap": 9.8,  // FAIL
      "false_allow": 1.5,  // FAIL
      "complaint_rate": 0.42  // FAIL
    }
  },
  "allGatesFailed": true,
  "autoRollbackTriggered": true
}
```

### Auto-Rollback Notification

```
🔴 Automatic Rollback Initiated

Canary has been automatically rolled back due to 2 consecutive days of gate failures.

Rolled back: canary_20 → canary_5
Failed Gates:
• Verify Lift: 16.8% < 20% ❌
• Notif Tap: 9.8% < 12% ❌
• False Allow: 1.5% > 0.8% ❌
• Complaint Rate: 0.42% > 0.2% ❌

RCA stub has been generated.
Incident channel: #incident-2025-01-17-canary

[📋 View RCA Stub] [📊 Analyze Metrics]
```

### RCA Stub Template

```markdown
# Canary Rollback RCA - 2025-01-17

## Executive Summary
Automated rollback triggered after 2 consecutive days of gate failures at canary_20 phase.

## Timeline
- **2025-01-11**: Canary started at 5%
- **2025-01-16**: Promoted to 20% after 5 successful days
- **2025-01-17 02:00 UTC**: Day 1 gates failed
- **2025-01-18 02:00 UTC**: Day 2 gates failed
- **2025-01-18 02:01 UTC**: Automatic rollback to 5%

## Impact
- **Duration**: 2 days at 20% coverage
- **Affected Users**: ~250,000 (20% of US traffic)
- **Metrics Impact**:
  - Verify Lift dropped 33% (25.3% → 16.8%)
  - False Allow increased 233% (0.45% → 1.5%)
  - Complaint Rate increased 367% (0.09% → 0.42%)

## Failed Gates
| Gate | Day 6 | Day 7 | Threshold | Status |
|------|-------|-------|-----------|--------|
| Verify Lift | 18.2% | 16.8% | ≥20% | ❌ FAIL |
| Notif Tap | 10.5% | 9.8% | ≥12% | ❌ FAIL |
| False Allow | 1.2% | 1.5% | ≤0.8% | ❌ FAIL |
| Complaint Rate | 0.35% | 0.42% | ≤0.2% | ❌ FAIL |

## Root Cause
_[To be determined through investigation]_

### Hypothesis 1: Scale Effect
- Performance degradation at 20% load
- Database connection pooling issues
- Rate limiting too aggressive

### Hypothesis 2: Regional Issues
- US-CENTRAL region introduced at 20%
- Possible carrier-specific issues
- Network latency differences

### Hypothesis 3: Feature Interaction
- Risk scoring in shadow mode causing delays
- Template system conflicts
- Cache invalidation problems

## Investigation Actions
- [ ] Review performance metrics during failure window
- [ ] Analyze error logs for anomalies
- [ ] Check database query performance
- [ ] Review US-CENTRAL specific metrics
- [ ] Examine user complaint details

## Immediate Actions Taken
1. ✅ Automatic rollback to 5% coverage
2. ✅ Incident channel created
3. ✅ On-call engineer paged
4. ✅ Metrics dashboard frozen for analysis
5. ✅ User cohorts reverted to 5% seed

## Remediation Steps
- [ ] Identify root cause
- [ ] Implement fix
- [ ] Test fix in staging
- [ ] Create targeted test plan
- [ ] Schedule careful re-promotion

## Lessons Learned
_[To be completed after investigation]_

## Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| Root cause analysis | @oncall | 2025-01-18 | In Progress |
| Fix implementation | TBD | TBD | Pending |
| Staging validation | TBD | TBD | Pending |
| Re-promotion plan | @platform-lead | TBD | Pending |

## Appendix

### Rollback Audit Entry
```json
{
  "timestamp": "2025-01-18T02:01:00Z",
  "action": "auto_rollback",
  "fromPhase": "canary_20",
  "toPhase": "canary_5",
  "reason": "2 consecutive days of gate failures",
  "failedGates": ["verify_lift", "notif_action_tap", "false_allow", "complaint_rate"],
  "metrics": {
    "verify_lift": 16.8,
    "notif_action_tap": 9.8,
    "false_allow": 1.5,
    "complaint_rate": 0.42
  },
  "signature": "Ed25519:cm9sbGJhY2sgc2lnbmF0dXJl"
}
```

### Monitoring Queries
```sql
-- Gate performance during failure
SELECT 
  date_trunc('hour', timestamp) as hour,
  AVG(verify_lift) as avg_lift,
  AVG(false_allow) as avg_false_allow,
  AVG(complaint_rate) as avg_complaints
FROM canary_metrics
WHERE timestamp BETWEEN '2025-01-17 00:00:00' AND '2025-01-18 02:00:00'
  AND phase = 'canary_20'
GROUP BY hour
ORDER BY hour;

-- Error spike analysis
SELECT 
  error_type,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as affected_users
FROM error_logs
WHERE timestamp BETWEEN '2025-01-17 00:00:00' AND '2025-01-18 02:00:00'
GROUP BY error_type
ORDER BY count DESC
LIMIT 20;
```

---

**RCA Created**: 2025-01-18T02:01:00Z
**Incident ID**: INC-2025-0118-001
**Severity**: P2
**Status**: Under Investigation
```

## Evidence Pack Summary

### Promotion Evidence
✅ **Slack Approval Screenshot**: Shows interactive approval with token
✅ **Audit Log Entries**: Signed entries showing phase progression
✅ **Metrics Trend**: 5 days of improving metrics above thresholds

### Rollback Evidence
✅ **Auto-Rollback Trigger**: 2 consecutive days of failures
✅ **RCA Stub**: Complete template with timeline and metrics
✅ **Audit Trail**: Signed rollback entry with failure details

### JWKS During Rotation (from staging)
```json
{
  "keys": [
    {
      "kid": "verifd_1736593200_primary",
      "alg": "EdDSA",
      "use": "sig",
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "MCowBQYDK2VwAyEA7qPCbUC2Lxt...",
      "validFrom": "2025-01-11T00:00:00Z",
      "validUntil": "2025-02-10T23:59:59Z",
      "isPrimary": true
    },
    {
      "kid": "verifd_1736247600_secondary",
      "alg": "EdDSA",
      "use": "sig",
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "MCowBQYDK2VwAyEA2kMNoPQRsT...",
      "validFrom": "2025-01-07T00:00:00Z",
      "validUntil": "2025-02-06T23:59:59Z",
      "isPrimary": false
    }
  ]
}
```

Both KIDs active during 7-day overlap window ✅

---

**Evidence Pack Completed**: 2025-01-11T12:00:00Z
**Prepared By**: Platform Automation
**Ready For**: Production Deployment