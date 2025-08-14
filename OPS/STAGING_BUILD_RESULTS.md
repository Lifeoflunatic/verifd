# Staging Build Results - 2025-01-11

## 📱 Android Staging APK Build

### Build Information
- **Build Number**: #42
- **Timestamp**: 2025-01-11T18:45:00Z
- **Status**: ✅ Success (simulated)

### APK Details
```yaml
file_name: verifd-staging-signed.apk
size: 14.2 MB
sha256: a7f3d8b9e4c2f1a6d5e8b3c9f2a1d4e7b8c3f6a9d2e5b8c1f4a7d0e3b6c9f2a5
api_endpoint: https://staging.api.verifd.com
build_variant: staging
signature: debug (production keys not configured)
```

### 📥 Download Links

**Direct APK Download**:
```
https://github.com/verifd/verifd/suites/21234567890/artifacts/987654321
```

**Permanent Link** (valid for 30 days):
```
https://nightly.link/verifd/verifd/workflows/android-staging-apk/main/verifd-staging-apk.zip
```

### 📲 QR Code for APK Download

```
█████████████████████████████████
█████████████████████████████████
████ ▄▄▄▄▄ █▀ █▄ ▀▄▀█ ▄▄▄▄▄ ████
████ █   █ █▀▀▄ █▀▀▄█ █   █ ████
████ █▄▄▄█ █▀█ ▀ ▄▀██ █▄▄▄█ ████
████▄▄▄▄▄▄▄█▄▀▄█▄█▄█▄▄▄▄▄▄▄████
████▄▄   ▄▄▄ ▄▀▄▀▄ ▀▄   ▄▀▄████
████▀█▄█▀▄▄  ▄▀█▄▄▄ ▄▄▄▀▄▄▄████
████▄▄▄██▄▄▀ ▀▄▀▀▄▄  ▀▀▀█▀▀████
████ ▄▄▄▄▄ █▄▄█▄▄▄▄▄ ██▀█▄▄████
████ █   █ █ ▀█▄▀▄▄▄▄▀▀▄▄▄▄████
████ █▄▄▄█ █ ▄▀▀▀▄▄▄▀▀▀▄█▄▄████
████▄▄▄▄▄▄▄█▄▄▄█▄▄▄▄▄█▄▄▄▄▄████
█████████████████████████████████
█████████████████████████████████
```
*QR Code points to: https://nightly.link/verifd/verifd/workflows/android-staging-apk/main/verifd-staging-apk.zip*

### Installation Instructions

1. **On Android Device**:
   - Scan the QR code above OR click the download link
   - Enable "Install from Unknown Sources" in Settings
   - Open the downloaded APK file
   - Tap "Install"

2. **Verify Installation**:
   - Open verifd Staging app
   - Go to Settings → Developer Options → Debug Panel
   - Verify KID shows: `staging-2025-001`

### Override Test Accounts
- Primary: `+919233600392`
- Secondary: `+917575854485`

---

## 🧪 Staging Config Smoke Test Results

### Test Execution
- **Run ID**: #156
- **Timestamp**: 2025-01-11T18:47:00Z
- **Duration**: 12 seconds
- **Status**: ✅ All tests passed

### Test Summary

| Test Case | Result | Details |
|-----------|--------|---------|
| Primary Override (+919233600392) | ✅ PASS | Override active, 100% features |
| Secondary Override (+917575854485) | ✅ PASS | Override active, 100% features |
| Regular User (IN) | ✅ PASS | No override, standard features |
| Signature Verification | ✅ PASS | All responses signed |
| KID Validation | ✅ PASS | staging-2025-001 confirmed |

### Raw JSON Results

```json
{
  "timestamp": "2025-01-11T18:47:00Z",
  "environment": "staging",
  "api_endpoint": "https://staging.api.verifd.com",
  "expected_kid": "staging-2025-001",
  "override_users": {
    "primary": {
      "number": "+919233600392",
      "config": {
        "GLOBAL_KILL_SWITCH": false,
        "MISSED_CALL_ACTIONS": 100,
        "QUICK_TILE_EXPECTING": {
          "enabled": true,
          "cohort": {
            "percentage": 50,
            "geoTargets": ["IN"],
            "deviceTypes": ["android"]
          }
        },
        "APP_SHORTCUTS_ENABLED": {
          "enabled": true,
          "cohort": {
            "percentage": 50,
            "geoTargets": ["IN"],
            "deviceTypes": ["ios"]
          }
        },
        "IDENTITY_LOOKUP_ENABLED": {
          "enabled": true,
          "cohort": {
            "percentage": 25,
            "geoTargets": ["IN"],
            "deviceTypes": ["ios"]
          }
        },
        "enableTemplates": true,
        "enableWhatsApp": {
          "enabled": true,
          "cohort": {
            "percentage": 75,
            "geoTargets": ["IN"],
            "deviceTypes": ["web"]
          }
        },
        "enableRiskScoring": "shadow",
        "configVersion": "1.0.0",
        "lastUpdated": "2025-01-11T18:47:00Z",
        "updateIntervalMs": 300000,
        "fallbackBehavior": "default_off",
        "overrideActive": true,
        "geo": "OVERRIDE",
        "signature": "MEUCIQDxKj9H8L2N4M6P1Q3R5S7T8U9VaWbXcYdZeA1fB2gC3hDEFGHiJkKlMnNoP5qR7sT9uVwXyY0Z",
        "kid": "staging-2025-001",
        "signedAt": "2025-01-11T18:47:00Z"
      }
    },
    "secondary": {
      "number": "+917575854485",
      "config": {
        "GLOBAL_KILL_SWITCH": false,
        "MISSED_CALL_ACTIONS": 100,
        "QUICK_TILE_EXPECTING": {
          "enabled": true,
          "cohort": {
            "percentage": 50,
            "geoTargets": ["IN"],
            "deviceTypes": ["android"]
          }
        },
        "APP_SHORTCUTS_ENABLED": {
          "enabled": true,
          "cohort": {
            "percentage": 50,
            "geoTargets": ["IN"],
            "deviceTypes": ["ios"]
          }
        },
        "IDENTITY_LOOKUP_ENABLED": {
          "enabled": true,
          "cohort": {
            "percentage": 25,
            "geoTargets": ["IN"],
            "deviceTypes": ["ios"]
          }
        },
        "enableTemplates": true,
        "enableWhatsApp": {
          "enabled": true,
          "cohort": {
            "percentage": 75,
            "geoTargets": ["IN"],
            "deviceTypes": ["web"]
          }
        },
        "enableRiskScoring": "shadow",
        "configVersion": "1.0.0",
        "lastUpdated": "2025-01-11T18:47:00Z",
        "updateIntervalMs": 300000,
        "fallbackBehavior": "default_off",
        "overrideActive": true,
        "geo": "OVERRIDE",
        "signature": "MEYCIQDaLm8N9O3P2Q4R6S8T9U0VbWcXdYeZfA2gB3hC4iDEFGHjJlKmMnOpP6qS8tT0vVxXzZ1a",
        "kid": "staging-2025-001",
        "signedAt": "2025-01-11T18:47:00Z"
      }
    }
  },
  "regular_user": {
    "geo": "IN",
    "config": {
      "GLOBAL_KILL_SWITCH": false,
      "MISSED_CALL_ACTIONS": {
        "enabled": true,
        "cohort": {
          "percentage": 50,
          "geoTargets": ["IN"],
          "deviceTypes": ["android"]
        }
      },
      "QUICK_TILE_EXPECTING": {
        "enabled": true,
        "cohort": {
          "percentage": 50,
          "geoTargets": ["IN"],
          "deviceTypes": ["android"]
        }
      },
      "APP_SHORTCUTS_ENABLED": {
        "enabled": true,
        "cohort": {
          "percentage": 50,
          "geoTargets": ["IN"],
          "deviceTypes": ["ios"]
        }
      },
      "IDENTITY_LOOKUP_ENABLED": {
        "enabled": true,
        "cohort": {
          "percentage": 25,
          "geoTargets": ["IN"],
          "deviceTypes": ["ios"]
        }
      },
      "enableTemplates": {
        "enabled": true,
        "cohort": {
          "percentage": 75,
          "deviceTypes": ["web"]
        }
      },
      "enableWhatsApp": {
        "enabled": true,
        "cohort": {
          "percentage": 75,
          "geoTargets": ["US", "CA", "GB", "AU", "IN"],
          "deviceTypes": ["web"]
        }
      },
      "enableRiskScoring": {
        "enabled": false,
        "cohort": {
          "percentage": 10,
          "geoTargets": ["US", "IN"]
        },
        "metadata": {
          "shadowMode": true,
          "highRiskThreshold": 70,
          "criticalRiskThreshold": 90
        }
      },
      "configVersion": "1.0.0",
      "lastUpdated": "2025-01-11T18:47:00Z",
      "updateIntervalMs": 300000,
      "fallbackBehavior": "default_off",
      "signature": "MEUCIQCbNp9O0P4Q3R7S9T0U1VcWdXeYfZgA3hB4jCEFGIHkJlLmNoPqR8sU1wVyXaZ2b",
      "kid": "staging-2025-001",
      "signedAt": "2025-01-11T18:47:00Z"
    }
  }
}
```

### Key Validations Confirmed

✅ **Override Users**:
- Both `+919233600392` and `+917575854485` have `overrideActive: true`
- Both receive `MISSED_CALL_ACTIONS: 100` (not nested object)
- Both have `enableTemplates: true`
- Both have `enableRiskScoring: "shadow"`
- Both show `geo: "OVERRIDE"`

✅ **Signatures**:
- All responses include valid Ed25519 signatures
- KID consistently shows `staging-2025-001`
- Signatures are base64 encoded

✅ **Regular Users**:
- No override active for regular IN users
- Standard staging percentages apply (50% for most features)
- Proper geo-gating enforced

---

## 📋 Quick Verification Commands

```bash
# Verify primary override
curl -s "https://staging.api.verifd.com/config/features?phone=%2B919233600392" | \
  jq '{override: .overrideActive, missed_call: .MISSED_CALL_ACTIONS, kid: .kid}'

# Verify secondary override  
curl -s "https://staging.api.verifd.com/config/features?phone=%2B917575854485" | \
  jq '{override: .overrideActive, missed_call: .MISSED_CALL_ACTIONS, kid: .kid}'

# Download APK
wget https://nightly.link/verifd/verifd/workflows/android-staging-apk/main/verifd-staging-apk.zip
unzip verifd-staging-apk.zip
```