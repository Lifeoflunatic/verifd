# verifd Backend

## Prerequisites

### macOS Build Requirements
For native SQLite compilation with better-sqlite3:

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Verify installation
xcode-select -p
# Should output: /Library/Developer/CommandLineTools

# If you have full Xcode, switch to it:
# sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

### Linux/Docker Requirements
For containerized builds:
- Docker Desktop or Docker Engine
- Build essentials included in container

## Installation

### Standard Install (with native build)
```bash
pnpm install
```

### Mock Testing (skip native build)
For environments where better-sqlite3 won't compile:

```bash
# Install without running native build scripts
pnpm install --ignore-scripts

# Run tests with mock database
DB_DRIVER=mock pnpm test
```

## Running the Backend

### Development Mode
```bash
# Default port 3000
pnpm dev

# Custom port
PORT=3001 pnpm dev

# With mock database (no SQLite)
USE_MOCK_DB=true pnpm dev
```

### Production Mode
```bash
pnpm build
pnpm start
```

## Testing

### Run All Tests
```bash
# With real SQLite database
pnpm test

# With mock database (no SQLite required)
DB_DRIVER=mock pnpm test

# Run database E2E tests
RUN_DB_E2E=1 pnpm test
```

### Docker Testing
```bash
# Build and test in container
docker build -t verifd-backend .
docker run --rm verifd-backend pnpm test
```

## API Endpoints

### Health & Metrics
- `GET /health` - Basic health check
- `GET /health/health` - Health check alias
- `GET /healthz` - Kubernetes-style readiness
- `GET /health/metrics` - Application metrics

### Device Management
- `POST /device/register` - Register new device for HMAC auth

### Pass Management
- `GET /pass/check?number_e164=+1234567890` - Check if number has active pass
- `POST /passes/grant` - Grant new pass (requires HMAC auth)
- `GET /passes/since?ts=0` - Get passes since timestamp (requires HMAC auth)

### Verification Flow
- `POST /verify/start` - Begin verification process
- `POST /verify/submit` - Submit verification token

## Environment Variables

```bash
# Server
PORT=3000                    # API port (default: 3000)
NODE_ENV=development         # Environment mode

# Database
DB_PATH=./data/verifd.db     # SQLite database path
USE_MOCK_DB=false           # Use in-memory mock (testing)
DB_DRIVER=sqlite            # Database driver (sqlite|mock)

# CORS
WEB_VERIFY_DEV_ORIGIN=http://localhost:3001  # Allowed origin for web-verify

# Testing
RUN_DB_E2E=1                # Enable database E2E tests
```

## Troubleshooting

### better-sqlite3 Build Failures

If you see `'climits' file not found` or similar C++ errors:

1. **macOS**: Ensure Xcode CLT is installed and selected properly
2. **Node version**: Try Node 18 or 20 (not 24)
3. **Skip build**: Use `pnpm install --ignore-scripts` + mock testing
4. **Docker**: Use the provided Dockerfile for consistent builds

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Database Locked

If you see "database is locked" errors:
- Ensure only one backend instance is running
- Check for hung test processes
- Delete `data/verifd.db-shm` and `data/verifd.db-wal` if present