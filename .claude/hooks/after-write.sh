#!/usr/bin/env bash
set -euo pipefail
payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // ""')
[ -z "$file" ] && exit 0

case "$file" in
  *apps/ios/*swift)
    command -v swiftformat >/dev/null && swiftformat "$(dirname "$file")" >/dev/null
    command -v swiftlint   >/dev/null && swiftlint --strict --quiet || exit 2
    [[ "$file" == *CallDirectoryExtension/* ]] && \
      xcodebuild -project apps/ios/verifd.xcodeproj \
        -scheme "CallDirectoryExtension" \
        -sdk iphonesimulator -quiet -destination "platform=iOS Simulator,name=iPhone 15" build | tail -n +1 >/dev/null || exit 2
    ;;
  *apps/android/*kt)
    command -v ktlint >/dev/null && ktlint -F "apps/android/**/*.kt" || exit 2
    ./gradlew -q detekt || exit 2
    ;;
  *apps/backend/src/*ts)
    (pnpm -C apps/backend exec eslint . --max-warnings=0 && \
     pnpm -C apps/backend exec tsc -p tsconfig.json --noEmit && \
     pnpm -C apps/backend exec vitest run --reporter=dot 2>&1 | tee OPS/.last_test_output.txt) || exit 2
    ;;
  *apps/web-verify/*.ts|*apps/web-verify/*.tsx)
    pnpm -C apps/web-verify exec eslint . --max-warnings=0 && \
    pnpm -C apps/web-verify exec tsc -p tsconfig.json --noEmit || exit 2
    ;;
esac