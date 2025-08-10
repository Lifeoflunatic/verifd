# verifd hook rules

## iOS (Swift)
- After editing Swift files under apps/ios/**, run SwiftFormat and SwiftLint strictly.
- For files under apps/ios/CallDirectoryExtension/**, after edit, attempt a fast compile check of the extension target.

## Android (Kotlin)
- After editing Kotlin files under apps/android/**, run ktlint --format and detekt; fail on violations.

## Backend (TypeScript)
- After editing apps/backend/src/**/*.ts, run eslint --max-warnings=0, tsc --noEmit, and vitest (quick); tee output to OPS/.last_test_output.txt.

## Web (Next.js)
- After editing apps/web-verify/**/*.{ts,tsx}, run eslint --max-warnings=0 and tsc --noEmit.

## Stop/Handoff
- On Stop, if no ---HANDOFF--- present, run $CLAUDE_PROJECT_DIR/.claude/hooks/auto_handoff.sh (fallback) and print OPS/LAST_HANDOFF.txt.