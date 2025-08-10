# rule2hook Setup for verifd

## Overview

rule2hook is integrated into verifd to automatically enforce code quality standards through Claude Code hooks. Every file edit triggers platform-specific linting, formatting, and validation.

## Current Configuration

### Installed Components

1. **Submodule**: `OPS/vendor/claudecode-rule2hook` (commit: a4f07a6)
2. **Rules File**: `OPS/HOOK_RULES.md` - Natural language rules for each platform
3. **Router Script**: `.claude/hooks/after-write.sh` - Routes edits to appropriate toolchain
4. **Settings**: `.claude/settings.json` - PostToolUse hook configuration

### Platform Rules

#### iOS (Swift)
- **Trigger**: `apps/ios/**/*.swift`
- **Actions**:
  - SwiftFormat for consistent formatting
  - SwiftLint with strict mode
  - Fast compile check for CallDirectoryExtension

#### Android (Kotlin)
- **Trigger**: `apps/android/**/*.kt`
- **Actions**:
  - ktlint formatting with auto-fix
  - detekt static analysis
  - Gradle validation

#### Backend (TypeScript)
- **Trigger**: `apps/backend/src/**/*.ts`
- **Actions**:
  - ESLint with zero warnings tolerance
  - TypeScript type checking (no emit)
  - Vitest quick run with output logging

#### Web (Next.js)
- **Trigger**: `apps/web-verify/**/*.{ts,tsx}`
- **Actions**:
  - ESLint with zero warnings
  - TypeScript type checking

#### Stop/Handoff
- **Trigger**: Session stop without `---HANDOFF---`
- **Action**: Auto-generate handoff documentation

## How It Works

1. **File Edit**: Claude Code edits a file via Edit/Write/MultiEdit tools
2. **Hook Trigger**: PostToolUse hook fires with file path in JSON payload
3. **Router Script**: `after-write.sh` extracts path and routes to toolchain
4. **Quality Check**: Platform-specific tools validate the changes
5. **Exit Codes**:
   - `0`: Success, changes accepted
   - `2`: Validation failure, Claude must fix

## Testing the Setup

```bash
# Test iOS hook
echo '{"tool_input":{"file_path":"apps/ios/test.swift"}}' | .claude/hooks/after-write.sh

# Test Android hook  
echo '{"tool_input":{"file_path":"apps/android/test.kt"}}' | .claude/hooks/after-write.sh

# Test Backend hook
echo '{"tool_input":{"file_path":"apps/backend/src/test.ts"}}' | .claude/hooks/after-write.sh
```

## Adding New Rules

1. Edit `OPS/HOOK_RULES.md` with natural language rule
2. Update `.claude/hooks/after-write.sh` with implementation
3. Test with sample file edit

## Troubleshooting

### Hook Not Firing
- Check `.claude/settings.json` exists and is valid JSON
- Verify `after-write.sh` is executable: `chmod +x .claude/hooks/after-write.sh`
- Ensure tool matchers include your edit tool

### Tool Not Found
- Hooks use `command -v` to check tool availability
- Missing tools are skipped gracefully
- Install required tools per platform:
  ```bash
  # iOS
  brew install swiftformat swiftlint
  
  # Android
  brew install ktlint
  ./gradlew detekt
  
  # TypeScript
  pnpm install
  ```

### Timeout Issues
- Default timeout is 120 seconds
- Adjust in `.claude/settings.json` if needed
- Consider using faster/incremental checks

## Benefits

1. **Consistent Code Style**: Automatic formatting on every edit
2. **Early Error Detection**: Type checking and linting before commit
3. **Store Compliance**: Prevents dangerous patterns from entering codebase
4. **Developer Experience**: Claude self-corrects issues immediately
5. **CI/CD Protection**: Fewer failures in GitHub Actions

## Maintenance

- **Update rule2hook**: `git submodule update --remote OPS/vendor/claudecode-rule2hook`
- **View logs**: Check `OPS/.last_test_output.txt` for backend test results
- **Monitor performance**: Hooks should complete within 10 seconds typically

## Related Documentation

- [HOOK_RULES.md](./HOOK_RULES.md) - Natural language rule definitions
- [STORE_CHECKS.md](./STORE_CHECKS.md) - Store compliance requirements
- [MCP_PLAYBOOK.md](./MCP_PLAYBOOK.md) - Agent orchestration patterns