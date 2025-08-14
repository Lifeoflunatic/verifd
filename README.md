# verifd

[![CI](https://github.com/verifd/verifd/actions/workflows/ci.yml/badge.svg)](https://github.com/verifd/verifd/actions/workflows/ci.yml)

A privacy-preserving call verification system that bridges unknown callers with recipients through secure, temporary verification passes.

## Core Concepts

### vPass (verifd Pass)
A temporary 24-hour allowlist entry that enables direct calls to pass through without additional verification. Recipients can grant vPasses after successful identity verification.

### Identity Ping
A pre-formatted SMS template that unknown callers can send to identify themselves before calling. Contains:
- Caller's name
- Reason for calling
- Expiring verification link

**iOS Implementation:** Uses `MFMessageComposeViewController` to present a pre-filled message with verification link from `/verify/start`. After sending, the app polls `/verify/status/:token` and offers approval options (24h label-only or 30-day temp contact).

### Voice Ping
Optional 3-second voice message included with verification requests, adding a human touch to identity verification.

## Architecture

- **Android**: CallScreeningService + SMS Power Mode for intelligent call filtering
- **iOS**: Call Directory Extension + Shortcuts for seamless verification flows
- **Backend**: Fastify (TypeScript) managing passes and verification endpoints
- **Web Verify**: Lightweight form for 6-second identity verification

## iOS Identity Ping Implementation

The iOS Identity Ping composer integrates with the backend verification system to provide seamless caller verification:

### Flow
1. **Demo Button**: "Send Identity Ping" button in `ViewController`
2. **Backend Call**: Calls `/verify/start` with caller info (name, reason)
3. **Message Composer**: `MFMessageComposeViewController` pre-filled with verification link
4. **Status Polling**: After sending, polls `/verify/status/:token` for completion
5. **Approval Options**: 
   - **"Approve +24h (temp)"**: Creates label-only pass (no contact creation)
   - **"Approve +30d (contact)"**: Creates temp contact in "verifd Passes" group

### Key Components
- `IdentityPingService`: Backend integration for verification API calls
- `MFMessageComposeViewControllerDelegate`: Handles message composition results
- `VerifdPassManager`: Creates temporary passes with appropriate duration
- No automatic contact creation - all user-initiated for privacy compliance

### Message Format
```
Hi! I'm using verifd to verify callers. Please verify your identity:

https://verifd.app/verify/abc123...

This link expires in 15 minutes.
```

## API Endpoints

### GET /pass/check

Check if a vPass exists for a phone number. Returns unified PassCheckResponse format.

**Query Parameters:**
- `number_e164` (primary): Phone number in E.164 format
- `phoneNumber` (deprecated): Alias for backward compatibility with deprecation notice

**Example:**
```bash
# Primary parameter (recommended)
curl "http://localhost:3000/pass/check?number_e164=%2B15551234567"

# Legacy parameter (deprecated but supported)
curl "http://localhost:3000/pass/check?phoneNumber=%2B15551234567"
```

**Response Format:**
```json
{
  "allowed": true,
  "scope": "24h",
  "expires_at": "2025-08-10T14:35:00.000Z"
}
```

**Rate Limiting:** 5 requests/minute per IP, 10 requests/minute per number. When exceeded:
```bash
# Example that triggers 429 (run 6 times rapidly)
for i in {1..6}; do curl "http://localhost:3000/pass/check?number_e164=%2B15551234567"; done

# Response:
{"error":"rate_limited"}
```

### POST /verify/start

Start a verification request with HMAC-bound single-use tokens and per-number rate limiting.

**Request:**
```json
{
  "phoneNumber": "+15551234567",
  "name": "John Doe", 
  "reason": "Follow-up appointment",
  "voicePing": "optional_base64_audio"
}
```

**Response:**
```json
{
  "success": true,
  "token": "hmac_bound_token_here",
  "vanity_url": "/v/abc12345",
  "number_e164": "+15551234567",
  "expires_at": "2025-08-10T14:35:00.000Z"
}
```

**Security Features:**
- Single-use HMAC-bound tokens (≤15m expiry)
- Per-number rate limiting (3 attempts per 10 minutes)
- `Cache-Control: no-store` and `Vary: Origin` headers

**Example:**
```bash
curl -X POST "http://localhost:3000/verify/start" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+15551234567",
    "name": "John Doe",
    "reason": "Follow-up appointment"
  }'
```

## Environment Variables

### Backend Configuration
- `PASSCHECK_RPM_IP` - Rate limit for /pass/check per IP (default: 5)
- `PASSCHECK_RPM_NUMBER` - Rate limit for /pass/check per number (default: 10)  
- `WEB_VERIFY_DEV_ORIGIN` - Allowed origin for CORS on /pass/check (e.g., http://localhost:3000)
- `LOG_SALT` - Salt for privacy-safe phone number hashing in logs (default: app-level constant)

### Example .env
```bash
PASSCHECK_RPM_IP=5
PASSCHECK_RPM_NUMBER=10
WEB_VERIFY_DEV_ORIGIN=http://localhost:3000
LOG_SALT=your-custom-salt-here
```

## Development

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Run tests
pnpm test
```

## Deployment Notes

### Vercel Monorepo Configuration

This project uses a specific configuration to deploy the web-verify Next.js app from a pnpm monorepo to Vercel:

#### Why Next.js is in Root devDependencies
Vercel's framework detection happens **before** configuration is applied. For monorepos, Vercel only checks the root `package.json` for framework dependencies. Without Next.js in the root, Vercel falls back to the Build Output API instead of using the Next.js builder.

This is a temporary workaround until Vercel improves monorepo framework detection. The Next.js version in root is pinned to match the version in `apps/web-verify/package.json`.

#### Deployment Configuration
- **Deploy from**: Repository root (never set Root Directory in Vercel)
- **Package naming**: `@verifd/web-verify` (must match pnpm filter exactly)
- **Build command**: Uses pnpm workspace filters to build dependencies
- **Install command**: Must use `pnpm install` (not npm/yarn)

See `OPS/WEB_VERIFY_DEPLOYMENT.md` for complete deployment documentation.

## License

MIT