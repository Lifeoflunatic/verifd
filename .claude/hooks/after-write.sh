#!/usr/bin/env bash
# Purpose: run light, non-blocking hygiene after Claude edits and emit a concise STDERR summary

set -u  # no 'set -e' to keep this hook non-fatal

# --- Gather changed files ---
if [ -n "${CLAUDE_CHANGED_FILES:-}" ]; then
  # space-separated list expected
  FILES="$(echo "${CLAUDE_CHANGED_FILES}" | tr '\n' ' ' | sed 's/  */ /g')"
else
  # modified + untracked, excluding ignored
  FILES="$(git ls-files -m -o --exclude-standard | tr '\n' ' ' | sed 's/  */ /g')"
fi

trim() { sed 's/^ *//;s/ *$//'; }
nl_to_sp() { tr '\n' ' '; }

# Normalize
FILES="$(echo "${FILES}" | trim)"

prettier_count=0
eslint_count=0
ts_status="skipped"
android_status="skipped"
ios_status="skipped"

# --- Web/TS/JS formatting ---
if command -v pnpm >/dev/null 2>&1; then
  prettier_files="$(echo "${FILES}" | tr ' ' '\n' | grep -E '\.(ts|tsx|js|jsx|json|md|yml|yaml|css|scss|html)$' || true)"
  if [ -n "${prettier_files}" ]; then
    # run per-file to avoid arg length limits
    while IFS= read -r f; do
      [ -f "$f" ] && pnpm -s exec prettier -w "$f" >/dev/null 2>&1 || true
    done <<<"${prettier_files}"
    prettier_count="$(echo "${prettier_files}" | wc -w | tr -d ' ')"
  fi

  eslint_files="$(echo "${FILES}" | tr ' ' '\n' | grep -E '\.(ts|tsx|js|jsx)$' || true)"
  if [ -n "${eslint_files}" ]; then
    # batch is okay for eslint; non-fatal
    pnpm -s exec eslint --fix ${eslint_files} >/dev/null 2>&1 || true
    eslint_count="$(echo "${eslint_files}" | wc -w | tr -d ' ')"
  fi

  # --- Quick TypeScript checks (noEmit), only if tsconfigs exist ---
  ran_ts=""
  if [ -f "packages/shared/tsconfig.json" ]; then pnpm -s exec tsc -p packages/shared/tsconfig.json --noEmit >/dev/null 2>&1 || true; ran_ts="1"; fi
  if [ -f "apps/backend/tsconfig.json" ]; then pnpm -s exec tsc -p apps/backend/tsconfig.json --noEmit >/dev/null 2>&1 || true; ran_ts="1"; fi
  if [ -f "apps/web-verify/tsconfig.json" ]; then pnpm -s exec tsc -p apps/web-verify/tsconfig.json --noEmit >/dev/null 2>&1 || true; ran_ts="1"; fi
  if [ -n "${ran_ts}" ]; then ts_status="ran"; fi
fi

# --- Android Kotlin formatting (Spotless or ktlint), only if needed ---
kotlin_files="$(echo "${FILES}" | tr ' ' '\n' | grep -E '\.(kt|kts)$' || true)"
if [ -n "${kotlin_files}" ] && [ -f "./gradlew" ]; then
  ./gradlew -q :apps:android:spotlessApply >/dev/null 2>&1 \
    || ./gradlew -q :apps:android:ktlintFormat >/dev/null 2>&1 \
    || true
  android_status="formatted"
fi

# --- iOS Swift lint (optional) ---
swift_files="$(echo "${FILES}" | tr ' ' '\n' | grep -E '\.swift$' || true)"
if [ -n "${swift_files}" ] && command -v swiftlint >/dev/null 2>&1; then
  swiftlint --fix >/dev/null 2>&1 || true
  ios_status="linted"
fi

# --- STDERR summary for Claude Code UI ---
echo "after-write: prettier=${prettier_count}; eslint=${eslint_count}; tsc=${ts_status}; android=${android_status}; ios=${ios_status}" >&2

exit 0