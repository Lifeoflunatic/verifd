# verifd

A privacy-preserving call verification system that bridges unknown callers with recipients through secure, temporary verification passes.

## Core Concepts

### vPass (verifd Pass)
A temporary 24-hour allowlist entry that enables direct calls to pass through without additional verification. Recipients can grant vPasses after successful identity verification.

### Identity Ping
A pre-formatted SMS template that unknown callers can send to identify themselves before calling. Contains:
- Caller's name
- Reason for calling
- Expiring verification link

### Voice Ping
Optional 3-second voice message included with verification requests, adding a human touch to identity verification.

## Architecture

- **Android**: CallScreeningService + SMS Power Mode for intelligent call filtering
- **iOS**: Call Directory Extension + Shortcuts for seamless verification flows
- **Backend**: Fastify (TypeScript) managing passes and verification endpoints
- **Web Verify**: Lightweight form for 6-second identity verification

## API Endpoints

### GET /pass/check

Check if a vPass exists for a phone number.

**Example:**
```bash
curl "http://localhost:3000/pass/check?number_e164=%2B15551234567"
```

**Rate Limiting:** 5 requests/minute per IP, 10 requests/minute per number. When exceeded:
```bash
# Example that triggers 429 (run 6 times rapidly)
for i in {1..6}; do curl "http://localhost:3000/pass/check?number_e164=%2B15551234567"; done

# Response:
{"error":"rate_limited"}
```

## Environment Variables

### Backend Configuration
- `PASSCHECK_RPM_IP` - Rate limit for /pass/check per IP (default: 5)
- `PASSCHECK_RPM_NUMBER` - Rate limit for /pass/check per number (default: 10)  
- `WEB_VERIFY_DEV_ORIGIN` - Allowed origin for CORS on /pass/check (e.g., http://localhost:3000)

### Example .env
```bash
PASSCHECK_RPM_IP=5
PASSCHECK_RPM_NUMBER=10
WEB_VERIFY_DEV_ORIGIN=http://localhost:3000
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

## License

MIT