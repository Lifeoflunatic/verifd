---
description: Save the most recent ---HANDOFF--- you just produced into OPS.
---
If the current assistant message contains a `---HANDOFF---` block, extract it and:
1) Overwrite `OPS/LAST_HANDOFF.txt` with the block.
2) Append to `OPS/HANDOFF_HISTORY.md` with a `## <UTC ISO>` header.
3) Update `OPS/SYNC.md` Last Handoff + State: WAITING_FOR_PM.
If no block is present, STOP and ask to run `/handoff:prep`.