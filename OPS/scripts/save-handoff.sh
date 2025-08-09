#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
mkdir -p OPS
# Expect HANDOFF content in STDIN
CONTENT=$(cat)
echo "$CONTENT" > OPS/LAST_HANDOFF.txt
echo -e "\n\n## $STAMP\n\n$CONTENT" >> OPS/HANDOFF_HISTORY.md
# keep a simple roll-up
printf "Last: %s\nBranch: %s\n" "$STAMP" "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'main')" > OPS/SYNC.md