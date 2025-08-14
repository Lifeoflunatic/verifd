# Disabled Workflows

These workflows have been temporarily disabled as they require infrastructure that isn't ready yet.

## Re-enable Steps

### nightly-smoke.yml.disabled

1. Ensure SQLite database and schema exist at correct paths
2. Update package names to match actual structure
3. Set USE_MOCK_DB=true for testing
4. Rename back to `nightly-smoke.yml`

### staging-smoke.yml.disabled

1. Set up actual staging environment
2. Fix package references (use correct workspace names)
3. Update server start paths
4. Rename back to `staging-smoke.yml`

### update-badges.yml.disabled

1. Create CI workflow that generates coverage artifacts
2. Configure maintainers team for PR reviews
3. Update workflow trigger to use actual CI workflow
4. Rename back to `update-badges.yml`

## Required Checks for Branch Protection

After re-enabling, ensure branch protection uses only these checks:

- `Build Staging APK` (from android-staging-apk.yml)
- `APK Stamp Verification` (from android-staging-apk.yml)
