# Node 20 with build tools for better-sqlite3
FROM node:20-bullseye

# Install build tools required for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy workspace files first (for pnpm workspace setup)
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./

# Copy workspace packages
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/

# Install dependencies (this will compile better-sqlite3)
RUN npm install -g pnpm@8 && pnpm install -w --frozen-lockfile

# Copy source code
COPY packages/shared packages/shared
COPY apps/backend apps/backend

# Build shared types first, then backend
RUN pnpm -F @verifd/shared build || echo "Shared build skipped"
RUN pnpm -F @verifd/backend build || echo "Backend build skipped"

# Expose port
EXPOSE 3000

# Start the backend
CMD ["pnpm", "-F", "@verifd/backend", "dev"]