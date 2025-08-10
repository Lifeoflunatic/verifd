# verifd Demo Artifacts

This directory contains artifacts from the vertical demo implementation.

## Screenshots

### Android SMS Composer
- **Path**: `android-sms-composer.png`
- **Description**: Post-call sheet "Send Identity Ping" button opens SMS composer with prefilled message
- **Features**: ACTION_SENDTO intent, dual-SIM support, store-compliant

### iOS Message Composer  
- **Path**: `ios-message-composer.png`
- **Description**: MFMessageComposeViewController with prefilled verification message
- **Features**: User-initiated sending, backend integration for vanity links

### Web Success Page
- **Path**: `web-success-page.png` 
- **Description**: Success page showing "vPass granted (scope, expires) — try calling me now!"
- **Features**: Dynamic messaging based on pass type, clear CTA

## Implementation Notes

Screenshots represent the actual demo flow:

1. **Android**: Post-call sheet → SMS composer → User sends manually
2. **iOS**: Demo button → Message composer → User sends manually  
3. **Web**: Form submission → Success page with vPass details

All flows maintain store compliance with user-initiated messaging only.

## Test Evidence

- Playwright E2E tests prove `/v/<token>` redirect → submit → `allowed:true`
- Android unit tests verify allowlist integration
- iOS copy clarifies 24h label vs 30d contact behavior
- API contract unified with `number_e164` and `PassCheckResponse`

## Security Features

- HMAC-bound single-use vanity tokens (≤15min expiry)
- Per-number rate limiting (3 attempts per 10 minutes)
- No dangerous permissions used
- Privacy-first design throughout