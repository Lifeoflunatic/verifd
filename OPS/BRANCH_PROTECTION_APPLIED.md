# Branch Protection Applied

## Timestamp
2025-08-13T19:45:00Z

## Protected Branches

### main
- **Status Checks Required**: Build Staging APK
- **Strict Status Checks**: Yes (must be up-to-date with base branch)
- **PR Reviews Required**: 1 approval
- **Code Owner Reviews**: Required
- **Dismiss Stale Reviews**: Yes
- **Linear History**: Required
- **Force Pushes**: Disabled
- **Deletions**: Disabled
- **Conversation Resolution**: Required

### release/staging-17
- **Status Checks Required**: Build Staging APK, APK Stamp Verification
- **Strict Status Checks**: Yes
- **PR Reviews Required**: 1 approval
- **Code Owner Reviews**: Required
- **Dismiss Stale Reviews**: Yes
- **Linear History**: Required
- **Force Pushes**: Disabled
- **Deletions**: Disabled

## Applied Via
GitHub API using `gh` CLI

## Commands Used
```bash
# Main branch
gh api repos/Lifeoflunatic/verifd/branches/main/protection -X PUT --input protection.json

# Release branch
gh api repos/Lifeoflunatic/verifd/branches/release%2Fstaging-17/protection -X PUT --input protection.json
```

## Verification
Run: `gh api repos/Lifeoflunatic/verifd/branches/{branch}/protection`