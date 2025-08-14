# Backend Development Environment

## Overview
The verifd backend uses better-sqlite3 which requires native compilation. This can be challenging on some systems (especially macOS with Node 24+). This guide provides solutions.

## Quick Start

### Option 1: Use Mock DB (Recommended for Development)
```bash
# Always use mock DB for development
cd apps/backend
USE_MOCK_DB=true pnpm dev

# Run tests with mock DB
USE_MOCK_DB=true pnpm test
```

### Option 2: Docker Development Environment
For native SQLite support without local build issues:

```bash
# From project root
docker compose up backend-dev

# Or build and run directly
cd apps/backend
docker build -f Dockerfile.dev -t verifd-backend-dev .
docker run -it -p 3000:3000 -v $(pwd):/app verifd-backend-dev
```

### Option 3: Fix Native Build (macOS)
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install build dependencies
brew install python sqlite3

# Rebuild
cd apps/backend
pnpm rebuild better-sqlite3
```

## Docker Development Setup

### Dockerfile.dev
Located at `apps/backend/Dockerfile.dev`:
```dockerfile
FROM node:20-bookworm-slim

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/

# Install dependencies (including native builds)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build shared package
RUN pnpm -F @verifd/shared build

WORKDIR /app/apps/backend

EXPOSE 3000

CMD ["pnpm", "dev"]
```

### docker-compose.yml
Add to root `docker-compose.yml`:
```yaml
version: '3.8'

services:
  backend-dev:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - ./apps/backend/src:/app/apps/backend/src
      - ./apps/backend/var:/app/apps/backend/var
      - ./packages/shared/src:/app/packages/shared/src
    environment:
      - NODE_ENV=development
      - DB_PATH=/app/apps/backend/var/db/verifd.sqlite
    command: pnpm dev
```

## Environment Variables

### Database Selection
- `USE_MOCK_DB=true` - Force mock database (no SQLite required)
- `DB_DRIVER=mock` - Alternative way to use mock DB
- `DB_PATH=/path/to/db.sqlite` - SQLite database path (default: `var/db/verifd.sqlite`)

### CI Configuration
GitHub Actions workflows default to mock DB:
```yaml
env:
  USE_MOCK_DB: true
```

## Troubleshooting

### Error: Could not locate the bindings file
**Solution**: Use mock DB or Docker environment
```bash
USE_MOCK_DB=true pnpm dev
```

### Error: 'climits' file not found (macOS)
**Solution**: Install Xcode Command Line Tools
```bash
xcode-select --install
```

### Error: No prebuilt binaries found
**Solution**: Use Docker or install build tools
```bash
docker compose up backend-dev
```

## Testing

### Unit Tests (Always Mock)
```bash
cd apps/backend
USE_MOCK_DB=true pnpm test
```

### Integration Tests (SQLite)
```bash
# Using Docker
docker compose run backend-dev pnpm test

# Or with local SQLite
RUN_DB_E2E=1 pnpm test
```

## Production
Production uses PostgreSQL, not SQLite. The Docker production build handles all dependencies:
```bash
docker build -f apps/backend/Dockerfile -t verifd-backend .
```