# Branch Protection Rules Applied

Date: 2025-08-14
Applied to: https://github.com/Lifeoflunatic/verifd

## 1. Main Branch Protection

**Pattern:** `main`

### Required Status Checks
- [x] **CI / Store Compliance Check** (Required)
  - This is the only required status check for main branch
  - Ensures Android permissions compliance
  - Runs on all PRs regardless of file changes

### Pull Request Settings
- [x] Require pull request reviews before merging
  - [x] Required approving reviews: 1
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [x] Require review from CODEOWNERS
  - [ ] Restrict who can dismiss pull request reviews

### Additional Settings
- [x] Require status checks to pass before merging
- [x] Require branches to be up to date before merging
- [ ] Require conversation resolution before merging
- [ ] Require signed commits
- [ ] Require linear history
- [x] Include administrators
- [ ] Restrict who can push to matching branches
- [x] Allow force pushes (Disabled)
- [x] Allow deletions (Disabled)

## 2. Release Branch Protection

**Pattern:** `release/*`  
**Additional Pattern:** `release/staging-*`

### Required Status Checks
- [x] **Android Staging APK Build / Build Staging APK** (Required)
  - Only runs when Android code changes
  - Path filters: `apps/android/**`, `.github/workflows/android-staging-apk.yml`
  
- [x] **APK Artifact Reality Check / Verify APK Artifact Exists** (Required)
  - Verifies APK artifacts are properly stored
  - Runs on schedule or manual trigger

### Pull Request Settings
- [x] Require pull request reviews before merging
  - [x] Required approving reviews: 1
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [x] Require review from CODEOWNERS
  - [ ] Restrict who can dismiss pull request reviews

### Additional Settings
- [x] Require status checks to pass before merging
- [x] Require branches to be up to date before merging
- [ ] Require conversation resolution before merging
- [ ] Require signed commits
- [x] **Require linear history** (Enforced for release branches)
- [x] Include administrators
- [ ] Restrict who can push to matching branches
- [x] **Allow force pushes** (Disabled - Critical for release branches)
- [x] **Allow deletions** (Disabled - Critical for release branches)

## Implementation Notes

### Why These Rules?

1. **Main Branch (Lightweight)**
   - Only requires Store Compliance Check
   - Allows fast iteration on web-only changes
   - Android builds only trigger when Android code changes

2. **Release Branches (Strict)**
   - Requires full Android build verification
   - Linear history for clean release tracking
   - No force pushes or deletions to preserve release integrity
   - APK verification ensures artifacts are properly stored

### Path-Based CI Optimization

The Android workflows have been updated with path filters:
```yaml
paths:
  - 'apps/android/**'
  - '.github/workflows/android-staging-apk.yml'
```

This ensures:
- Web-only PRs don't trigger Android builds
- Android changes always trigger Android builds
- Workflow changes trigger rebuilds

### How to Apply These Rules

1. Navigate to: `Settings` → `Branches` in the GitHub repository
2. Edit the existing rule for `main` branch:
   - Remove all required status checks except "CI / Store Compliance Check"
   - Keep CODEOWNERS review requirement
3. Add a new rule for `release/*`:
   - Click "Add rule"
   - Set branch name pattern to `release/*`
   - Configure all settings as listed above
4. Add another rule for `release/staging-*`:
   - Click "Add rule"
   - Set branch name pattern to `release/staging-*`
   - Configure all settings as listed above (same as release/*)

### Verification

After applying these rules:
1. Web-only PRs to main should only require Store Compliance Check
2. Android PRs to main should trigger Android workflow but not block merge
3. Any PR to release/* branches must pass Android builds
4. Force pushes and deletions should be blocked on release branches

## Status Check Names

**Important:** Use these exact status check names in GitHub:
- `CI / Store Compliance Check`
- `Android Staging APK Build / Build Staging APK`
- `APK Artifact Reality Check / Verify APK Artifact Exists`

The format is: `Workflow Name / Job Name`