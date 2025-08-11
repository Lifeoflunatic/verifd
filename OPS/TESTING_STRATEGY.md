# verifd Testing Strategy

![Coverage](https://img.shields.io/badge/coverage-75%25-green)
![Tests](https://img.shields.io/badge/tests-25%20passing-success)
![CI](https://img.shields.io/github/actions/workflow/status/verifd/verifd/ci.yml?branch=main)

## Overview
Multi-layer testing approach with mock DB for speed, real DB for integration confidence, coverage aggregation, and release safety gates.

## Test Execution Modes

### 1. Mock DB Tests (Fast, No Dependencies)
```bash
USE_MOCK_DB=true pnpm -F @verifd/backend test
```
- **Implementation**: Pure JavaScript in-memory database (`src/db/pure-mock.ts`)
- **Speed**: <500ms total execution
- **Use cases**: Unit tests, CI on macOS, rapid development iteration
- **Files**: `*.mock.test.ts`, `*.simple.test.ts`

### 2. SQLite Integration Tests (Full Coverage)
```bash
pnpm -F @verifd/backend test
```
- **Implementation**: better-sqlite3 with actual SQLite engine
- **Speed**: ~2-3s total execution
- **Use cases**: Integration tests, CI on Linux, pre-deployment validation
- **Files**: All `*.test.ts` when `RUN_DB_E2E=1`

### 3. E2E Tests (Dockerized)
```bash
docker-compose up -d
RUN_DB_E2E=1 pnpm -F @verifd/backend test
```
- **Implementation**: Full stack with PostgreSQL
- **Speed**: ~5-10s including container startup
- **Use cases**: Release validation, migration testing

## CI/CD Matrix

### GitHub Actions Configuration
```yaml
# .github/workflows/ci.yml
strategy:
  matrix:
    include:
      - name: "Mock DB (macOS)"
        os: macos-latest
        test_cmd: "USE_MOCK_DB=true pnpm test"
      - name: "SQLite (Linux)"
        os: ubuntu-latest
        test_cmd: "pnpm test"
```

### Benefits
- **macOS**: Avoids native build issues with better-sqlite3
- **Linux**: Tests actual database behavior with Docker support
- **Parallel execution**: Both paths run simultaneously

## Pure Mock Design

### Architecture
```typescript
class PureMockDatabase {
  private tables: Map<string, MockRow[]> = new Map();
  
  prepare(sql: string) {
    // Pattern matching on SQL strings
    // Returns synchronous API matching better-sqlite3
  }
}
```

### Supported Operations
- INSERT INTO (passes, verification_attempts, devices, call_logs)
- SELECT with WHERE, ORDER BY, LIMIT
- UPDATE with SET, increments
- DELETE with pattern matching

### Limitations
- No transactions
- No complex JOINs
- No triggers or constraints
- In-memory only (resets per test)

## Test Categories

### 1. Simple Tests (`*.simple.test.ts`)
- Pure logic tests
- No database interaction
- Schema validation with Zod
- Rate limiting logic

### 2. Mock Tests (`*.mock.test.ts`)
- Database interaction with mock
- API endpoint testing
- HMAC token validation
- Pass lifecycle

### 3. Integration Tests (`*.test.ts`)
- Full database features
- Concurrent operations
- Transaction handling
- Migration verification

## Rate Limiting & Backoff Testing

### Test Helper Routes (`/__test__/*`)
Only available when `NODE_ENV=test`:
- `POST /__test__/reset` - Reset test state
- `GET /__test__/sometimes429` - Simulates rate limiting
- `GET /__test__/status` - Check current state

### 429 Response Testing
```javascript
// First 3 calls return 429 with increasing Retry-After
// 4th call succeeds
for (let i = 0; i < 4; i++) {
  const res = await fetch('/__test__/sometimes429');
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    await sleep(retryAfter * 1000);
  }
}
```

## Mobile Build Variant Testing

### Android (`BuildVariantUrlTest.kt`)
```kotlin
@Test
fun `debug build should use local backend URL`() {
  if (BuildConfig.BUILD_TYPE == "debug") {
    assertEquals("http://10.0.2.2:3000", BuildConfig.BASE_URL)
  }
}
```

### iOS (`BuildVariantURLTests.swift`)
```swift
func testDebugSchemeUsesLocalURL() {
  #if DEBUG
  XCTAssertEqual(Config.backendURL, "http://localhost:3000")
  #endif
}
```

### Build Configurations
| Environment | Android URL | iOS URL | Features |
|------------|-------------|---------|----------|
| Debug | http://10.0.2.2:3000 | http://localhost:3000 | Logging, URL override |
| Staging | https://staging-api.verifd.com | https://staging-api.verifd.com | Limited logging |
| Release | https://api.verifd.com | https://api.verifd.com | Crash reporting only |

## Troubleshooting

### Native Build Issues
```bash
# better-sqlite3 won't build
USE_MOCK_DB=true pnpm test  # Use mock instead

# Rebuild native modules
pnpm rebuild better-sqlite3

# Clear and reinstall
rm -rf node_modules
pnpm install
```

### Mock DB Limitations
```javascript
// Not supported in mock:
db.prepare("SELECT * FROM a JOIN b ON a.id = b.id")  // JOINs
db.prepare("BEGIN TRANSACTION")  // Transactions
db.prepare("CREATE TRIGGER...")  // Triggers

// Use simple queries instead:
const a = db.prepare("SELECT * FROM a WHERE id = ?").get(id);
const b = db.prepare("SELECT * FROM b WHERE id = ?").get(id);
```

### CI Failures
```yaml
# Check which matrix job failed
- name: "Mock DB (macOS)"  # Native build issues?
- name: "SQLite (Linux)"   # Docker not running?

# Debug with artifacts
- uses: actions/upload-artifact@v4
  with:
    name: test-results-${{ matrix.name }}
    path: coverage/
```

## Coverage Aggregation

### Configuration
```javascript
// vitest.config.ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov', 'html'],
  thresholds: {
    lines: 70,
    functions: 70,
    branches: 65,
    statements: 70
  }
}
```

### CI Coverage Merge
```yaml
# .github/workflows/ci.yml
coverage-merge:
  needs: backend-tests
  steps:
    - Download all coverage artifacts
    - Merge with lcov-result-merger
    - Generate summary
    - Comment on PR with coverage delta
```

### Running Coverage Locally
```bash
# Generate coverage report
USE_MOCK_DB=true pnpm -F @verifd/backend vitest run --coverage

# View HTML report
open apps/backend/coverage/index.html
```

## Release URL Safety Gates

### Android Release Validation
```kotlin
// ReleaseUrlValidationTest.kt
@Test
fun testReleaseUrlIsProduction() {
  if (BuildConfig.BUILD_TYPE == "release") {
    assertEquals("https://api.verifd.com", BuildConfig.API_BASE_URL)
  }
}
```

### iOS Release Validation
```swift
// ReleaseURLValidationTests.swift
func testReleaseURLIsProduction() {
  #if RELEASE
  XCTAssertEqual(Config.apiBaseURL, "https://api.verifd.com")
  #endif
}
```

### CI Gates
The CI workflow will:
1. Check Android BuildConfig for release URL
2. Validate iOS Info.plist for production endpoint
3. Fail the build if any non-production URLs detected
4. Run unit tests to verify configurations

## Staging Smoke Tests

### Workflow Trigger
```yaml
# .github/workflows/staging-smoke.yml
on:
  push:
    branches: [main]
```

### Test Sequence
1. **Health Check**: `GET /health` → expect 200
2. **Verify Start**: `POST /verify/start` → get token
3. **Verify Submit**: `POST /verify/submit` → grant pass
4. **Pass Check**: `GET /pass/check` → verify allowed:true

### Artifacts
- `smoke-results.json` - Test execution details
- Request/response logs for debugging
- Gates production deployment on success

## CI Notifications

### Slack Integration (Robust)
```yaml
# .github/workflows/notify.yml
- Triggers on CI/Staging workflow completion
- Fetches artifacts via workflow_run.id (not name-dependent)
- Graceful degradation if artifacts missing
- Deep links to run, artifacts, and logs
```

### Robustness Features
1. **ID-Based Fetching**: Uses `workflow_run.id` not workflow names
2. **Permissions**: `actions: read` for artifact API access
3. **Deep Links**: Direct URLs to run, artifacts, logs, commits
4. **Degraded Mode**: Shows `⚠️ Artifacts unavailable` if missing
5. **Self-Test**: `notify-self-test.yml` simulates payloads

### Secret Management
```bash
# GitHub Secrets Required
SLACK_WEBHOOK_URL     # Slack incoming webhook
GITHUB_TOKEN          # Auto-provided (permissions: actions: read)

# Self-Test Command
gh workflow run notify-self-test.yml \
  -f workflow_name=CI \
  -f conclusion=success
```

### Notification Format
- **CI Success**: ✅ Coverage 75% (+2%), with deep links
- **CI Failure**: ❌ Shows reason, links to logs
- **Degraded**: ⚠️ Artifacts unavailable, basic info only
- **Links**: `Run | Artifacts | Logs` in every message

## Nightly Real-DB Tests

### Schedule
- Runs at 02:00 UTC daily (7:30 AM IST)
- Tests with actual SQLite database
- Verifies migrations and expiry sweeper
- **Concurrency**: Single run enforced (no overlaps)

### Build & Setup Guarantees
1. **Full Build**: `pnpm install && pnpm build` for all packages
2. **DB Path Safety**: `mkdir -p var/db` ensures directory exists
3. **Absolute Paths**: Uses `realpath` for DB_PATH to avoid relative path issues
4. **Server Stability**: `nohup` prevents SIGHUP, logs to `server.log`
5. **Readiness Check**: 10 retries @ 1s intervals on `/health`
6. **Fail Fast**: Server exit non-zero immediately fails workflow

### Test Coverage
1. Database connectivity
2. Full verify flow with persistence
3. Pass grants and checks
4. Expiry sweeper operation
5. Transaction support
6. Server crash detection between tests

### Artifacts
- `nightly-results.json` - Test execution details
- `nightly-junit.xml` - JUnit format for CI tools
- `nightly-report.html` - Human-readable report
- `server.log` - Backend startup logs (on failure)

## PR Auto-Comments & Badge Consistency

### Coverage Report
Every PR receives an automated comment with:
- Current coverage percentage (matches README badges)
- Delta vs main branch baseline
- Badge preview showing exact color/percentage
- Links to detailed reports
- Pass/fail status for thresholds

### Badge Auto-Update Flow
1. CI completes on main branch
2. `update-badges.yml` workflow triggers
3. Downloads coverage artifact via `workflow_run.id`
4. Calculates same percentages as PR comments
5. Updates README.md and OPS/TESTING_STRATEGY.md
6. Creates PR via `peter-evans/create-pull-request`
7. Auto-merge or manual review

### Consistency Guarantees
- **Same Calculation**: CI and badge updater use identical LCOV parsing
- **Color Mapping**: <40% red, 40-60% yellow, 60-80% green, >80% brightgreen
- **No Manual Edits**: Badges only updated via automation
- **PR Not Push**: Uses PR to avoid direct pushes to main

### Example Comment
```markdown
## 📊 Coverage Report 🟢

| Metric | Coverage | Delta | Details |
|--------|----------|-------|---------|
| **Lines** | 72% | +2% | 1823/2532 |
| **Functions** | 68% | - | 145/213 |

### 📈 Badge Preview
`![Coverage](https://img.shields.io/badge/coverage-72%25-green)`

### 📁 Artifacts
- [Coverage Report](link)
- [Detailed LCOV](link)
```

## Roadmap

### Now (Implemented)
- ✅ Pure JS mock database
- ✅ CI matrix (macOS/Linux)
- ✅ 429/Retry-After tests
- ✅ Build variant URL tests
- ✅ Coverage aggregation across matrix
- ✅ Release URL safety gates
- ✅ Staging smoke tests
- ✅ CI notifications (Slack)
- ✅ Nightly real-DB tests
- ✅ PR auto-comments

### Soon
- [ ] Coverage trend graphs
- [ ] Performance benchmarks
- [ ] Automated migration testing

### Later
- [ ] Property-based testing
- [ ] Chaos engineering tests
- [ ] Load testing with k6

### Never
- Complex SQL in mock (use real DB)
- Cross-platform native builds in CI
- Production data in tests