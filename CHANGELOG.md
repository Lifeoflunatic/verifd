# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-08-10

### Added - Identity Ping → vPass → Ring Vertical Implementation

#### 🎯 Core Identity Verification System
- **Vanity URL System**: Short, shareable verification links (`/v/abc12345`) with automatic expiry
- **HMAC Single-Use Vanity Tokens**: 8-character tokens with rate limiting to prevent link farming
- **API Contract Unification**: Standardized `number_e164` format and `PassCheckResponse` interface
- **Complete E2E Flow**: `/v/<token>` redirect → web form submit → vPass granted → `allowed: true` verification

#### 🤖 Android Implementation
- **Identity Ping Composer**: Store-compliant SMS composer using `ACTION_SENDTO` intent
- **Dual-SIM Support**: Automatic SIM selection with graceful fallback for single-SIM devices
- **Network Security Config**: HTTP development support with production HTTPS readiness
- **Dynamic Message Templates**: Context-aware SMS formatting with verification links

#### 📱 iOS Store-Safe Implementation
- **Contact Service**: User-initiated contact creation with `CNContactStore.requestAccess` compliance
- **Call Directory Network Isolation**: Complete network access guards preventing external API calls
- **Group Creation Fallback**: Alternative contact management for 30-day vPass scenarios
- **Shortcut Integration**: Manual Shortcuts workflow for 15-30m temporary access with comprehensive documentation

#### 🌐 Web Verification System
- **Dual-Mode Web Form**: Context-aware UI for new requests vs token-based approvals
- **Enhanced Success Page**: Dynamic messaging with clear call-to-action ("Try calling me now")
- **Token Parameter Handling**: Seamless integration between vanity URLs and verification forms
- **Visual Status Indicators**: Celebration emojis, scope display, and expiration timestamps

#### 🔒 Security & Rate Limiting
- **IP-Based Rate Limiting**: 10 requests per hour per IP address with hourly reset windows
- **Memory-Based Token Storage**: Efficient in-memory mapping with automatic cleanup
- **Automatic Expiry System**: 15-minute token expiry with background cleanup processes
- **Error Handling**: Comprehensive 404 handling for missing/expired tokens

#### 🧪 Testing & Quality Assurance
- **E2E Playwright Tests**: Complete flow verification from token redirect to final verification
- **Automated Screenshot Capture**: Visual validation of form states and success pages
- **cURL Flow Testing**: Backend API validation with complete request/response cycles
- **Store Compliance Verification**: All implementations maintain App Store and Google Play compliance

#### 📊 API Enhancements
- **POST /verify/start**: Enhanced to return vanity URLs instead of full tokens
- **GET /v/:vanityToken**: New redirect endpoint for seamless token handling
- **GET /pass/check**: Unified response format with `PassCheckResponse` interface
- **Rate Limiting Middleware**: Fastify-based IP tracking with configurable limits

#### 🎨 User Experience Improvements
- **24h/30d UX Clarification**: Clear messaging for different vPass durations
- **Context-Aware Success Messages**: Different content for granted vs pending vPasses
- **Store-Compliant Workflows**: User-initiated flows with explicit permission requests
- **Cross-Platform Consistency**: Unified behavior across Android, iOS, and web platforms

### Technical Details

#### Backend Changes (`apps/backend/`)
- Enhanced `/verify/start` with vanity URL generation and rate limiting
- Added `/v/:vanityToken` redirect handler for seamless token resolution
- Updated version endpoint to reflect current release
- Implemented HMAC-based token security with automatic cleanup

#### Frontend Changes (`apps/web-verify/`)
- Added dynamic route `/v/[token]/page.tsx` for vanity URL handling
- Enhanced main page with token parameter detection and dual-mode logic
- Updated success page with vPass status display and clear call-to-actions
- Integrated Playwright tests for complete E2E flow verification

#### Mobile Applications
- **Android**: Complete SMS composer implementation with dual-SIM support
- **iOS**: Store-safe contact management with Call Directory isolation
- Both platforms maintain complete App Store compliance throughout implementation

#### Shared Packages (`packages/shared/`)
- Unified API contracts with consistent `number_e164` formatting
- Standardized response interfaces across all endpoints
- Type-safe implementation ensuring contract compliance

### Store Compliance Maintained
- ✅ **Android**: No `SEND_SMS` permission required, uses system SMS app
- ✅ **iOS**: User-initiated contact creation with explicit permission flows
- ✅ **Call Directory**: Complete network isolation with offline-only operation
- ✅ **Privacy First**: All data stored locally with user control

### Performance & Security
- Rate limiting prevents abuse with configurable IP-based limits
- Memory-efficient token storage with automatic cleanup
- Comprehensive error handling with proper HTTP status codes
- Security-first design with HMAC token validation

---

**Migration Notes**: This release introduces breaking changes to the `/verify/start` API response format. The `verifyUrl` field now returns a vanity path instead of a full URL. Update client implementations accordingly.

**Testing**: All features have been validated with comprehensive E2E tests, cURL flow verification, and store compliance checks.