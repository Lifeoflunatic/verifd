# Fixing Failed Workflow Runs

## Quick Fixes

### 1. Disable Non-Essential Workflows

Until the infrastructure is ready, disable these workflows by renaming them:

```bash
# In .github/workflows/
mv nightly-smoke.yml nightly-smoke.yml.disabled
mv staging-smoke.yml staging-smoke.yml.disabled
mv update-badges.yml update-badges.yml.disabled
```

### 2. Fix nightly-smoke.yml (when ready to enable)

**Problem**: Missing database schema file
**Fix**: Create the schema file or update the path

```yaml
# Change line 59 from:
sqlite3 var/db/test.sqlite < src/db/schema.sql

# To:
sqlite3 var/db/test.sqlite < ../../packages/backend/src/db/schema.sql
```

**Problem**: Server won't start without proper environment
**Fix**: Update environment variables (lines 87-91)

```yaml
env:
  USE_MOCK_DB: "true" # Use mock DB instead of real SQLite
  NODE_ENV: test
  PORT: 3002
```

### 3. Fix staging-smoke.yml (when ready to enable)

**Problem**: Build commands reference wrong packages
**Fix**: Update package names (lines 27-34)

```yaml
# Change from:
pnpm -F @verifd/shared build
pnpm -F @verifd/backend build

# To:
pnpm -F shared build
pnpm -F backend build
```

**Problem**: Server start path is wrong
**Fix**: Update directory path (line 47)

```yaml
# Change from:
cd apps/backend

# To:
cd packages/backend
```

### 4. Fix update-badges.yml (when ready to enable)

**Problem**: Depends on non-existent CI workflow
**Fix**: Either create the CI workflow or change the trigger

```yaml
# Change lines 4-7 from:
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]

# To:
on:
  workflow_dispatch:  # Manual trigger only
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
```

## Recommended Actions

### Immediate (to stop failures):

1. **Disable workflows** that aren't ready:

   ```bash
   cd .github/workflows
   for file in nightly-smoke.yml staging-smoke.yml update-badges.yml; do
     mv $file $file.disabled
   done
   ```

2. **Create placeholder CI workflow** if badges are needed:
   ```bash
   # Create .github/workflows/ci.yml with basic tests
   ```

### When Ready to Enable:

1. **For nightly-smoke.yml**:
   - Ensure SQLite and database schema exist
   - Use mock DB for testing
   - Fix all path references

2. **For staging-smoke.yml**:
   - Set up actual staging environment
   - Fix package references
   - Add proper deployment steps

3. **For update-badges.yml**:
   - Create CI workflow that generates coverage
   - Configure badge generation properly
   - Set up maintainers team for PR reviews

## Alternative: Simplified Smoke Test

Create a minimal working smoke test:

```yaml
name: Basic Smoke Test
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install
      - run: pnpm -F backend test
```

This will at least verify the build works without complex infrastructure.
