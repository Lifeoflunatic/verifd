---
description: Run the full feature flow using the correct MCP order.
---
**Follow OPS/MCP_PLAYBOOK.md order.** Steps:
1) Read RELAY.md & OPS/SYNC.md to scope the task.
2) Research with **tavily** (overview) then **context7** (official APIs). Produce a 5-bullet summary with URLs.
3) Plan with **serena** (diff & entrypoints). Append the plan to RELAY.md.
4) Implement with **filesystem** edits ONLY in the scoped files.
5) After each edit, run **ide** diagnostics. Stop and fix on first error.
6) Run tests: `pnpm test:api` or `pnpm test:web` via **ide**.
7) If UI changed, capture with **kapture** (save under handoff/artifacts/).
8) Update **memory** with any durable decisions.
9) Generate `---HANDOFF---` via `/handoff:prep`.