# Branch Protection Rules

## Current Protection on `main` branch

### ✅ Active Rules

1. **Require pull request before merging**
   - Required approving reviews: 1
   - Dismiss stale reviews on new commits: Yes
   - Require review from CODEOWNERS: Yes
2. **Status checks**
   - Required check: "Build Staging APK"
   - Strict mode: Yes (must be up-to-date with base branch)

3. **Conversation resolution**
   - All conversations must be resolved before merging

4. **Linear history**
   - Enforce linear history (no merge commits)

5. **Force push protection**
   - Force pushes disabled
   - Branch deletion disabled

### ⚠️ Bypass Capability

- Currently bypassing protection for direct pushes from `release/staging-*` branches
- This allows rapid staging deployments

### Recommended Adjustments

For better security while maintaining agility:

1. **Keep current rules for `main`** - They're appropriately strict

2. **Add protection for `release/*` branches**:

   ```
   - Allow direct pushes from CI only
   - Require "APK Reality Check" status
   - No force pushes
   ```

3. **Consider adding**:
   - Required status check: "CI" (unit tests)
   - Automated security scanning (Dependabot)

## How to Modify

1. Go to Settings → Branches
2. Edit rule for `main`
3. Or add rule for `release/*` pattern

## Current CODEOWNERS

Check `.github/CODEOWNERS` file:

- Currently requires review from @Lifeoflunatic for all changes

## Why These Rules Matter

- **PRs required**: Ensures code review and discussion
- **Status checks**: Prevents broken builds from merging
- **Linear history**: Keeps git history clean and bisectable
- **CODEOWNERS**: Ensures key maintainers review critical files
- **No force push**: Prevents history rewriting accidents
