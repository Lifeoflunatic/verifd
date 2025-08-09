#!/usr/bin/env bash
# Reads JSON from stdin (Claude provides tool + file paths).
PAYLOAD=$(cat)
if echo "$PAYLOAD" | grep -q '"file_path":'; then
  if echo "$PAYLOAD" | grep -E '"file_path":.*OPS/(DECISIONS\.md|HANDOFF_HISTORY\.md|SYNC\.md)'; then
    echo "Edits to OPS decision/history files must be PM-approved. Use RELAY.md or code paths instead." 1>&2
    exit 2  # blocks the tool call
  fi
fi
exit 0