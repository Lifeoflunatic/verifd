# Branch & Tag Policy

## Branch Strategy

### Main Branch

- **Branch:** `main`
- **Purpose:** Source of truth, production-ready code
- **Protection:** Required PR reviews, CI must pass
- **Merges:** Only through PRs with green checks

### Feature Branches

- **Pattern:** `feat/<topic>`
- **Examples:** `feat/zod-row-typing`, `feat/dual-sim-support`
- **Lifetime:** Short-lived, merge to main when complete
- **Cleanup:** Delete after merge

### Release Branches

- **Pattern:** `release/staging-<N>`
- **Examples:** `release/staging-16`, `release/staging-17`
- **Purpose:** Short-lived branches for staging releases
- **Lifetime:** Create from feature branch, tag, build, merge to main

### Hotfix Branches

- **Pattern:** `hotfix/<issue>`
- **Examples:** `hotfix/rate-limit-fix`
- **Base:** Branch from main
- **Merge:** Back to main and any active release branches

## Tag Policy

### Staging Tags

- **Pattern:** `vMAJOR.MINOR.PATCH-rc1-staging.N`
- **Examples:**
  - `v1.3.0-rc1-staging.15`
  - `v1.3.0-rc1-staging.16`
- **Increment:** Sequential N for each staging build
- **Required:** Must match APK versionName (without 'v' prefix)

### Production Tags

- **Pattern:** `vMAJOR.MINOR.PATCH`
- **Examples:** `v1.3.0`, `v1.3.1`
- **Base:** Tag on main after staging validation

## Release Process

### Staging Release

```bash
# 1. Create release branch from feature
git checkout -b release/staging-16

# 2. Create annotated tag
git tag -a v1.3.0-rc1-staging.16 -m "Staging release 16"

# 3. Push branch and tag
git push origin release/staging-16
git push origin v1.3.0-rc1-staging.16

# 4. Run workflow with required input
gh workflow run android-staging-apk.yml \
  --field release_tag=v1.3.0-rc1-staging.16 \
  --ref release/staging-16

# 5. After validation, merge to main
git checkout main
git merge release/staging-16
git push origin main
```

### Production Release

```bash
# 1. Ensure main is clean
git checkout main
git pull origin main

# 2. Create production tag
git tag -a v1.3.0 -m "Production release 1.3.0"

# 3. Push tag
git push origin v1.3.0

# 4. Run production workflow
gh workflow run android-release.yml \
  --field release_tag=v1.3.0 \
  --ref main
```

## CI Enforcement

### Required Checks

- Tag format validation (regex check)
- APK stamp verification (versionName == tag)
- BuildConfig fingerprint present
- CI environment detected (IS_CI == true)

### Workflow Guards

- `android-staging-apk.yml`: Requires `release_tag` input
- Tag format: `^v[0-9]+\.[0-9]+\.[0-9]+-rc[0-9]+-staging\.[0-9]+$`
- Fails if APK_STAMP_MISMATCH detected

## PR Requirements

### Checklist (enforced by template)

- [ ] Updated OPS/HANDOFF\_\*.md
- [ ] Updated OPS/LAST_HANDOFF.txt
- [ ] CI passes (green checks)
- [ ] APK builds successfully
- [ ] No drift detected (if Android changes)

### Review Process

1. Feature complete on feature branch
2. Create staging release and test
3. Open PR to main with evidence
4. Two approvals required
5. Merge when all checks green

## Drift Prevention

### Build Fingerprints

- Every APK contains:
  - GIT_SHA: Commit hash
  - GIT_BRANCH: Branch name
  - BUILD_TAG: Release tag
  - BUILD_TIME: UTC timestamp
  - IS_CI: CI build flag

### In-App Detection

- QA Panel shows "IN SYNC" (green) or "DRIFT" (red)
- Copy fingerprint button for debugging
- Debug notifications include SHA and tag

### CI Verification

- APK stamps checked post-build
- BUILD_ENV.txt uploaded with artifacts
- GitHub Release includes fingerprint

## Commands Reference

```bash
# Check current branch and tags
git branch -v
git tag | grep staging

# Verify APK locally
aapt dump badging app.apk | grep versionName
unzip -p app.apk resources.arsc | strings | grep STAGING

# Run workflow with tag
gh workflow run android-staging-apk.yml \
  --field release_tag=v1.3.0-rc1-staging.16

# Check workflow status
gh run list --workflow=android-staging-apk.yml --limit=5
```

## Anti-Patterns to Avoid

❌ Building from random branches without tags
❌ Hardcoding version names in build.gradle
❌ Skipping staging validation before main merge
❌ Reusing staging numbers
❌ Building without CI stamps
❌ Ignoring drift warnings

## Best Practices

✅ Always tag before building
✅ Use release branches for staging
✅ Verify stamps in QA Panel
✅ Check "IN SYNC" badge on device
✅ Include BUILD_ENV.txt in releases
✅ Document in HANDOFF files
