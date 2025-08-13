# Branch and Tag Policy

## Branch Strategy

### Protected Branches
- **main**: Production-ready code, all features merged here
- **release/staging-***: Staging release branches for QA validation

### Feature Branches
- **feat/**: New features
- **fix/**: Bug fixes
- **chore/**: Maintenance tasks
- **docs/**: Documentation updates

## Tag Naming Convention

### Format
`v{MAJOR}.{MINOR}.{PATCH}-{STAGE}.{BUILD}`

### Examples
- `v1.3.0-rc1-staging.17` - Release candidate 1, staging build 17
- `v1.3.0-staging.18` - Staging build 18
- `v1.3.0` - Production release

### Stages
- **staging**: QA/testing builds
- **rc**: Release candidates
- **prod**: Production releases (no stage suffix)

## Release Process

### 1. Diagnostics Phase
```bash
/workflow:diagnostics
```
- Run comprehensive health checks
- Verify all tests pass
- Check for security vulnerabilities

### 2. Feature Implementation
```bash
/workflow:feature {"title":"...", "paths":["..."], "plan":"..."}
```
- Implement feature on feature branch
- Create PR to main
- Ensure CI passes

### 3. Staging Release
```bash
# Create release branch
git checkout -b release/staging-{N}

# Tag for build
git tag -a v1.3.0-rc1-staging.{N} -m "Staging release {N}"

# Trigger workflow with tag
gh workflow run android-staging-apk.yml \
  --ref release/staging-{N} \
  -f release_tag=v1.3.0-rc1-staging.{N}
```

### 4. QA Validation
- Deploy staging APK
- Run QA test suite
- Verify in-app diagnostics match build

### 5. Production Release
```bash
# After QA approval
git checkout main
git merge release/staging-{N}
git tag -a v1.3.0 -m "Production release v1.3.0"
git push origin main --tags
```

## CI Requirements

### All Builds Must
1. Pass APK stamp verification (version matches tag)
2. Include [STAGING] marker for staging builds
3. Have matching Git SHA in BuildConfig
4. Pass all required status checks
5. Be signed with appropriate keystore

## Enforcement

### Branch Protection Rules
- No direct pushes to main
- PR reviews required (1 minimum)
- Status checks must pass
- Linear history enforced
- No force pushes or deletions

### Tag Protection
- Tags are immutable once pushed
- Release tags trigger CI automatically
- Failed stamp verification blocks release