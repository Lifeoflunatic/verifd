# verifd — MCP Playbook (authoritative)

## Servers in this workspace
- **filesystem** – read/write/edit/grep/glob project files
- **ide** – diagnostics, run scripts/commands in project
- **serena** – static/code analysis, refactor proposals
- **memory** – persist architecture facts & decisions
- **tavily** – open-web search/crawl for APIs, docs, policy
- **context7** – fetch official library/framework docs
- **playwright** – headless browser E2E tests (web-verify)
- **kapture** – take UI screenshots of running app/site
- **zen** – orchestrate multi-step tasks across tools

## Default order of operations (feature work)
1. **Scope**: read RELAY.md + OPS/SYNC.md + issue/DoD.
2. **Research**: `tavily` (web), then `context7` (official docs).
3. **Plan**: `serena` suggest diff/entrypoints; write Plan to RELAY.md.
4. **Implement**: `filesystem` edits; check with `ide` diagnostics.
5. **Refactor**: `serena` quick review (nits/perf/safety).
6. **Test**:
   - Web: `playwright` E2E (apps/web-verify)
   - Node: `ide` run test scripts (vitest)
7. **Capture**: `kapture` screenshot success state(s) if UI changed.
8. **Memory**: `memory` upsert key facts (APIs, decisions).
9. **Handoff**: run `/handoff:prep`, then save to OPS/LAST_HANDOFF.txt.

## When to use which server
- **tavily vs context7**: Use `tavily` for *what & why* (concepts, platform policies), `context7` for *how* (exact method signatures).
- **serena**: Before large edits (surface affected modules), after edits (smell check).
- **ide**: After each meaningful save—compile/test, show TypeScript/Xcode/Gradle errors.
- **playwright**: On any change to apps/web-verify form or verify flow.
- **kapture**: When UI/UX changed and a screenshot helps the HANDOFF.
- **memory**: Only durable facts/decisions; no secrets/PII.

## Guardrails
- **iOS**: Never propose auto-messaging. Respect temp-contact policy (30-day passes only).
- **Rate limits**: Backoff when tavily throttles; prefer context7 if primary docs exist.
- **Filesystem safety**: Don't edit OPS/DECISIONS.md or OPS/HANDOFF_HISTORY.md directly.

## Canonical prompts Claude should follow
- Research: "Use **tavily** to find platform constraints for X, then **context7** for exact API usage. Summarize 5 bullets. Cite sources inline."
- Implement: "Edit only the listed files. After each edit, run **ide** diagnostics and stop on first error."
- Test: "Run **ide** script `pnpm test:api` (backend) or `pnpm test:web` (web-verify). Paste failing output."
- Review: "Use **serena** to propose 3 concrete improvements with diffs."
- Capture: "Use **kapture** to screenshot page '/success' at 1280×800 and save to /handoff/artifacts/DATE-success.png."
- Memory: "Store decision: <one sentence>. Scope: verifd."