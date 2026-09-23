---
name: cleanup
description: Delete dead code, speculative abstraction, and leftovers — deletions only. Use when a feature has landed, when a file has grown messy, or when the user asks to clean up.
---

Read `docs/ai/cleanup.md` and follow it exactly. This pass **only deletes and simplifies**: no new
features, no renames for taste, no reformatting. If a deletion would change behaviour, revert it and
raise it separately. The user's request: $ARGUMENTS
