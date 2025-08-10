# Health Check Setup

## Overview
The verifd backend now provides unified health check endpoints with clear PORT environment configuration.

## Health Endpoints

### Simple Health Check
- **GET /health** → `{ ok: true }`
- **GET /health/health** → `{ ok: true }` (alias)
- Use for basic liveness checks

### Readiness Check  
- **GET /healthz** → `{ status: 'ready' | 'not_ready' }`
- **GET /z** → `{ status: 'ready' | 'not_ready' }` (alias)
- Includes database connectivity check
- Use for Kubernetes readiness probes

### Metrics Endpoint
- **GET /health/metrics** → Returns active passes, pending verifications, and recent call stats

## PORT Configuration

The server reads the PORT from environment variables with a default of 3000:

```bash
# Default port (3000)
pnpm -F @verifd/backend dev

# Custom port
PORT=8080 pnpm -F @verifd/backend dev
```

## Startup Logging

The server now logs clear startup information:
```
[verifd] DB: /path/to/verifd.sqlite
[verifd] Server listening on PORT=3000
[verifd] Health check: curl http://localhost:3000/health
[verifd] Environment: development
```

## Testing Health Checks

```bash
# Simple health check (port 3000)
curl http://localhost:3000/health
# Response: {"ok":true}

# Simple health check (port 3001)
curl http://localhost:3001/health
# Response: {"ok":true}

# Readiness check
curl http://localhost:3000/healthz
# Response: {"status":"ready"}

# Health alias
curl http://localhost:3000/health/health
# Response: {"ok":true}

# Metrics (note: under /health/metrics)
curl http://localhost:3000/health/metrics
# Response: {"metrics":{"active_passes":0,"pending_verifications":0}}
```

## Docker/Kubernetes Configuration

For containerized deployments:

```yaml
# Kubernetes readiness probe
readinessProbe:
  httpGet:
    path: /healthz
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10

# Liveness probe
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
```

## Environment Variables

```bash
# .env file
PORT=3000
DB_PATH=var/db/verifd.sqlite
NODE_ENV=production
LOG_LEVEL=info
```

## Strict Typing

All route handlers now use proper TypeScript types:
- Request bodies use `z.infer<>` for parsed schemas
- Database results have explicit row types
- No more `{}` property errors
- Clean `pnpm -F @verifd/backend build` passes

## E2E Testing

New comprehensive E2E test suite covers:
- Full verification flow (/health → /verify/start → /verify/submit → /pass/check)
- Database file creation and TTL enforcement
- Single-use token validation
- Health endpoint aliases

Run with:
```bash
RUN_DB_E2E=1 pnpm -F @verifd/backend test e2e.full-flow.test.ts
```

Note: Requires better-sqlite3 native module to be built (`pnpm rebuild better-sqlite3`)