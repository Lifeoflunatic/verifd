# Development Setup

## Prerequisites

### SQLite Build Dependencies

The backend uses `better-sqlite3` which requires native compilation. Install build tools:

**macOS:**
```bash
xcode-select --install
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install build-essential python3 make g++
```

**Alpine Linux:**
```bash
apk add --no-cache make gcc g++ python3
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests  
pnpm test
```

## Environment Variables

Create `.env` in the backend directory:

```bash
NODE_ENV=development
PORT=3001
DATABASE_URL=./dev.db
WEB_VERIFY_DEV_ORIGIN=http://localhost:3000
PASSCHECK_RPM_IP=5
PASSCHECK_RPM_NUMBER=10
```