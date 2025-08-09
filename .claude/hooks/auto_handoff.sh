#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
mkdir -p "$ROOT/OPS"

# Read last assistant turn (if provided by Claude); may be empty
LAST=$(mktemp)
cat > "$LAST" || true

if grep -q '---HANDOFF---' "$LAST"; then
  # Save the explicit handoff
  cp "$LAST" "$ROOT/OPS/LAST_HANDOFF.txt"
  { printf "\n\n## %s\n\n" "$STAMP"; cat "$LAST"; } >> "$ROOT/OPS/HANDOFF_HISTORY.md"
  exit 0
fi

# Fallback: synthesize a minimal handoff from repo state
BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
DIFF_FILES=$(git -C "$ROOT" diff --name-only || true)
DIFF_STAT=$(git -C "$ROOT" diff --stat || true)
LAST_COMMIT=$(git -C "$ROOT" log -1 --pretty='%h %s' 2>/dev/null || echo "n/a")

TEST_OUT=""
if [ -f "$ROOT/OPS/.last_test_output.txt" ]; then
  TEST_OUT=$(tail -n 200 "$ROOT/OPS/.last_test_output.txt" || true)
fi
PW_OUT=""
if [ -f "$ROOT/OPS/.last_playwright_output.txt" ]; then
  PW_OUT=$(tail -n 120 "$ROOT/OPS/.last_playwright_output.txt" || true)
fi

cat > "$ROOT/OPS/LAST_HANDOFF.txt" <<EOF
---HANDOFF---
Task: (auto) Fallback handoff — assistant reply had no explicit ---HANDOFF---
When: $STAMP
Branch: $BRANCH

Diff Summary:
$DIFF_STAT

Files Touched:
$DIFF_FILES

Last Commit:
$LAST_COMMIT

Commands/Tests Run (tail):
$TEST_OUT

Playwright (tail):
$PW_OUT

Open Risks:
- Auto-generated handoff; ask Claude to run /handoff:prep next time for richer details.

Asks for PM:
- Approve or request changes based on diff/test tails; if unclear, ask Claude to regenerate via /handoff:prep.

---END-HANDOFF---
EOF

{ printf "\n\n## %s\n\n" "$STAMP"; cat "$ROOT/OPS/LAST_HANDOFF.txt"; } >> "$ROOT/OPS/HANDOFF_HISTORY.md"
echo "AUTO-HANDOFF GENERATED at $ROOT/OPS/LAST_HANDOFF.txt"