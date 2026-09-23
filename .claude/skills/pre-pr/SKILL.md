---
name: pre-pr
description: Run the full local CI-equivalent checks and self-review checklist before handing off or deploying. Use when the work is done, on push, or before any deploy.
---

Read `docs/ai/pre-pr.md` and follow it exactly: run every check, walk the self-review checklist
against the actual `git diff`, and report what you verified and what you did not. Never disable a
rule, skip a test, or lower a threshold to make the run green. The user's request: $ARGUMENTS
