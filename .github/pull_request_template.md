## Summary

<!-- Describe the changes in this PR -->

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Refactoring

## Android Changes (if applicable)

- [ ] APK builds successfully with staging variant
- [ ] Build fingerprint embedded (GIT_SHA, BUILD_TAG, etc.)
- [ ] QA Panel shows "IN SYNC" badge
- [ ] Staging release tested on device
- [ ] Release tag: `v1.3.0-rc1-staging.___`

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Handoff Documentation

- [ ] Updated `OPS/HANDOFF_*.md` with feature details
- [ ] Updated `OPS/LAST_HANDOFF.txt` with latest changes
- [ ] Documented any errors/issues in handoff for PM review
- [ ] Included testing recommendations

## CI Status

- [ ] All GitHub Actions workflows pass
- [ ] No TypeScript/ESLint errors
- [ ] Android build succeeds (if Android changes)
- [ ] Tests pass (backend, web-verify)

## Testing Evidence

<!-- Include screenshots, logs, or other evidence of testing -->

### Device Testing (Android)

- Device/Emulator:
- Android Version:
- QA Panel Status: [ ] IN SYNC / [ ] DRIFT

### Backend Testing

```bash
# Include test commands and results
pnpm -F @verifd/backend test
```

## Related Issues

<!-- Link any related issues -->

Closes #

## Additional Notes

<!-- Any additional information that reviewers should know -->
