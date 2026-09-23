---
name: write-tests
description: Add or fix tests. Use when writing tests for pure logic, when a test fails, or when coverage is short.
---

Read `docs/ai/write-tests.md` and follow it exactly. Prioritise the SM-2 and parser cases it lists
before touching UI coverage. Inject time — never call the real clock inside a test. Report failures
honestly instead of weakening the assertion. The user's request: $ARGUMENTS
