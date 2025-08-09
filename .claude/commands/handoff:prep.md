---
description: Prepare and SAVE a complete ---HANDOFF--- (then echo it here).
---
**Goal:** Generate a full `---HANDOFF---` and **persist it** to OPS.

**Assemble the block exactly like this (fill every section):**

```
---HANDOFF---
Task: <short>
Branch: <branch>
Status: READY FOR PM

Diff Summary:

* <plain english changes>

Files Touched:

* <path> — <note>

Commands/Tests Run:

* vitest: <summary>
* playwright: <summary if run>

Test Output (concise tail):
<last 60–120 lines if useful>

Artifacts:

* <screenshots/paths>

Open Risks:

* <bullets>

Asks for PM:

* <bullets>

ENV/Config Notes:

* <keys or defaults>

Checksum: <git short sha> | When: <UTC ISO>
---END-HANDOFF---
```

**Then persist it (REQUIRED):**
1) Using the **filesystem** tool, write the exact block to `OPS/LAST_HANDOFF.txt` (overwrite).
2) Append to `OPS/HANDOFF_HISTORY.md` with a timestamp header like:  
   `## <UTC ISO>` then the same block.
3) Update/create `OPS/SYNC.md` with:
   - `Last Handoff: <UTC ISO> (sha:<short>)`
   - `Branch: <branch>`
   - `State: WAITING_FOR_PM`
4) After saving, **print the same handoff block here**.