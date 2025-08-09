# RELAY.md - verifd Handoff Log

## Decisions
- **2025-08-09**: Initialized verifd monorepo with pnpm workspaces
- **2025-08-09**: Chose Fastify for backend (performance + TypeScript support)
- **2025-08-09**: SQLite for initial development, PostgreSQL for production
- **2025-08-09**: 24-hour expiry for vPasses with hourly cleanup job
- **2025-08-09**: Implemented GET /pass/check with rate limiting (5/min IP, 10/min number)
- **2025-08-09**: Schema uses consistent `number_e164` column naming throughout
- **2025-08-09**: CORS handled via custom plugin with WEB_VERIFY_DEV_ORIGIN allowlist
- **2025-08-09**: All responses include `Vary: Origin` header for proper caching

## Open Questions
- [ ] Should vPasses be renewable before expiry?
- [ ] How to handle international phone number formats?
- [ ] Voice Ping: Store as blob or use external storage (S3)?
- [x] Rate limiting: Per IP or per phone number? → Both: 5/min per IP, 10/min per number

## Next Actions
- [x] Set up backend Fastify server with TypeScript
- [x] Create database schema for passes table
- [x] Implement `/verify/start` and `/verify/submit` endpoints
- [x] Create shared types package
- [x] Implement GET `/pass/check` endpoint with rate limiting
- [ ] Wire web-verify success page to call `/pass/check`
- [ ] Bootstrap Android project with CallScreeningService
- [ ] Bootstrap iOS project with Call Directory Extension
- [ ] Set up Next.js web-verify form
- [ ] Create devcontainer configuration
- [ ] Set up GitHub Actions workflows
- [ ] Implement voice ping storage (S3 or local)

## Blocked By
- None currently

## Change Log
<!-- Latest entries first -->

### 2025-08-09 - Backend Surgical Fixes
- **CORS enhanced:** Fixed origin handling, added OPTIONS preflight with max-age 600, centralized Vary header
- **Headers cleaned:** Removed duplicate Vary from /pass/check, maintained Cache-Control + Content-Type
- **Test upgraded:** Replaced boundary test with real database logic test (seeded pass with expires_at === now)
- **Index optimized:** Kept only composite index `idx_passes_number_exp(number_e164, expires_at)`, dropped redundant single-column indexes
- **Docs standardized:** Added ENV section to README with rate limit and CORS variables, standardized /pass/check path

### 2025-08-09 - Auto-Handoff System Implementation  
- **Airtight handoffs:** Installed fallback auto-handoff system to prevent dead-ends
- **Hook updated:** Changed Stop hook from `save_handoff_on_stop.sh` → `auto_handoff.sh`
- **Fallback generator:** Created `.claude/hooks/auto_handoff.sh` that synthesizes handoffs from git diffs + test outputs when Claude forgets `/handoff:prep`
- **Zero maintenance:** Auto-generates minimal handoff on every session stop if no explicit `---HANDOFF---` found
- **Clear marking:** Auto-handoffs marked as `(auto)` so PM knows when Claude forgot vs intentional handoff

### 2025-08-09 - Backend Polish & CORS Implementation
- **Headers:** Added `Vary: Origin` to all /pass/check responses (Cache-Control: no-store preserved)
- **Boundary test:** Added test case for `expires_at === now` → `allowed:false` edge case
- **Schema alignment:** Renamed `phone_number` column to `number_e164` across database and queries for consistency
- **CORS plugin:** Created custom CORS plugin with WEB_VERIFY_DEV_ORIGIN allowlist, replacing generic @fastify/cors
- **Documentation:** Added 429 rate limit curl example to README and SQLite build requirements to OPS/DEV.md
- **Tests:** 6/6 simple unit tests passing, including new boundary condition test

### 2025-08-09 - GET /pass/check Implementation
- Added PassCheckResponse type to @verifd/shared package
- Created database index idx_passes_number_exp for efficient lookups
- Implemented GET /pass/check endpoint in backend with:
  - E.164 phone number validation
  - Rate limiting: 5 req/min per IP, 10 req/min per number
  - Active pass lookup with expiry check
  - Scope calculation (30m/24h/30d) based on pass duration
  - UTC time handling with ISO8601 response format
  - Cache-Control: no-store header
  - Proper error responses (400 bad_number, 429 rate_limited)
- Created comprehensive test suite with 5 passing unit tests
- Generated technical documentation with API specs and curl examples

### 2025-08-09 - Claude Brief & MCP Setup
- Created CLAUDE.md with concise project brief
- Updated .claude/settings.json to auto-inject context on session start
- Verified MCP_PLAYBOOK.md with authoritative tool order
- Confirmed workflow commands (feature, test-web, research, mem-upsert)
- Confirmed hook scripts (save_handoff_on_stop.sh, protect_ops.sh)
- Confirmed subagent files (android-agent, ios-agent, backend-agent)
- Initialized project memory with core facts and relationships

### 2025-08-09 - Initial Setup
- Created project structure
- Added workspace configuration
- Defined handoff protocol in CLAUDE.md
- Set up contribution guidelines