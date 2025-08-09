#!/usr/bin/env bash
set -euo pipefail
# If the last assistant turn includes ---HANDOFF---, save it.
LAST=$(mktemp)
cat > "$LAST"
if grep -q '---HANDOFF---' "$LAST"; then
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  mkdir -p OPS
  cp "$LAST" OPS/LAST_HANDOFF.txt
  printf "\n\n## %s\n\n" "$ts" >> OPS/HANDOFF_HISTORY.md
  cat "$LAST" >> OPS/HANDOFF_HISTORY.md
fi
rm -f "$LAST"