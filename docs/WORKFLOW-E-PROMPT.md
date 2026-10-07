# Prompt for the next agent — Workflow E (lesson tracker)

Copy everything below the line into a fresh session, in this repository. It is written to stand alone.

This file is spent once Workflow E ships. `docs/HANDOFF.md` is the state of the world.

---

You are picking up **StudyBao**, a study companion for one person's PNLE (Philippine Nurse Licensure
Examination) review. Her exam is **Friday 26 February 2027** — about 142 days out.

## Read these, in this order, before you write or plan anything

1. `CLAUDE.md` — constraints and the two AI boundaries
2. `docs/HANDOFF.md` — current state, every decision, what is one-way. **§8 is your brief.**
3. `docs/WORKFLOW-B-REMAINING.md` — the sandbox traps that cost real time
4. `docs/ai/README.md` — the runbooks and their ground rules
5. `docs/ai/change-data-model.md` — **you are adding a table, so this one is mandatory**
6. `docs/ai/add-feature.md` — folder layout and the three-layer pattern
7. `docs/ai/write-tests.md` — the test expectations, including the rule about tests that cannot go red
8. `docs/BUILD_GUIDE.md` §4 Workflow E, and §6 for the `Lesson` model

`docs/ai/*.md` are the procedure. `CLAUDE.md` is the constraints. Where a doc and the code disagree,
**the code wins** — then fix the doc. Do not trust a commit hash written in a document; run
`git log --oneline -6`.

## What exists now

Workflows A, B, C and D are done, verified and committed: the shell, flashcards with real SM-2
spaced repetition, an ingest pipeline (paste / PDF / photo OCR), and a Pomodoro timer with logged
sessions. `src/features/` has three complete data-backed features and they are the shape to copy.

**Read `src/features/flashcards/` and `src/features/ingest/` before writing anything.** Your output
should be structurally indistinguishable from them: `lib/` for pure logic with co-located tests,
`hooks/` for data access, `pages/` for thin routes, `components/` for pure views, `types.ts` for every
prop type. `src/lib/use-database-value.ts` is the shared refresh mechanism — import it, do not copy it.

## Your job: Workflow E — the lesson tracker

The app currently represents _cards_ and _time_. It has no representation of **what she is supposed to
be studying next** — her plan still lives outside the app. E closes the study loop.

Per `BUILD_GUIDE.md` §4 Workflow E and the `Lesson` model in §6:

1. **Data model:** `Lesson { id, subject, topic, deadline, status, notes, updatedAt, deletedAt? }` with
   status one of Not started / Reviewing / Mastered. **This needs a Dexie version bump — the schema is
   at version 2 (Workflow D added `sessions`), so yours is version 3** — plus a tested migration
   following `src/db/migrations.test.ts`.
2. **Manual CRUD**, with a list view filterable by status.
3. Reuse the existing form and view primitives. **Do not build a second form component.**

### Decisions already made for you

- **The list is the primary surface; the calendar is secondary.** `BUILD_GUIDE.md` §4 says "calendar +
  list view". A deadline-driven list grouped by _overdue / this week / later_ is what she will actually
  use, and it is less work than a month grid. **If you judge a month grid to be low value here, say so in
  your plan with your reasoning rather than building it by default.** Do not silently drop it either way.
- **Deadlines use the study day, not midnight.** `src/lib/study-day.ts` is the single implementation of
  the 04:00 rollover and Workflow F will use it for streaks. A lesson due "today" must not flip to
  overdue at 00:00 while she is still studying — the same reasoning that produced decision #10. Derive
  overdue-ness through that module; do not compare against `Date.now()`'s calendar date.
- **Deadlines are epoch milliseconds**, like every other timestamp in the database. Format at the edge.
- **The schedule-photo import is a stretch goal, not the deliverable.** §4 lists it, and §3's OCR reality
  check already says tabular and handwritten input is the weakest case for Tesseract — I wrote both, and
  they are in tension. Typing twenty topics takes ten minutes; a bad parse of a handwritten schedule
  costs more than it saves. **Ship manual CRUD, the list and filtering first.** Then, if the existing
  `src/features/ingest/lib/extract-pdf.ts` / `ocr.ts` make it genuinely cheap, add a photo path that
  routes straight to the confirm-and-edit form with no attempt at table detection. State in your plan
  which you are doing and why.

### Not in scope

Do not build the dashboard, cloud sync, notifications, or export/import. **Export/import is its own
small step immediately after E** (see `docs/HANDOFF.md` §8), and it is deliberately separate because it
is the safety net that does not depend on Google, the network, or a sync bug. Each remaining workflow
needs its own go-ahead.

## Non-negotiables

- **No LLM in the shipped product. Ever.** See ADR 0004 and ADR 0006.
- **No new runtime network dependency.** The app must work with the network off.
- **Timestamps are epoch milliseconds.** Mutable records carry `updatedAt`; deletable records carry
  `deletedAt` and are **never hard-deleted** — a hard delete is resurrected by the other device.
  (`ReviewLog` is the one named exception: append-only, neither field, union-only merge.)
- **All IndexedDB access goes through `src/db/repositories/`.** ESLint enforces it.
- **A Dexie schema change needs a version bump AND a tested migration.** Yours does. Read
  `docs/ai/change-data-model.md` first, and remember the migration test must seed a database at the
  _previous_ version, including a tombstone and a row with optional fields absent.
- **Never weaken a check to get green.** No skipped tests, no `@ts-ignore`, no lowered coverage
  threshold, no disabled lint rule.
- **Do not change a decision in `BUILD_GUIDE.md` §2 or an ADR.** If you think one is wrong, write a new
  ADR and ask.
- Follow the voice in `BUILD_GUIDE.md` §5 for every user-facing string: warm, playful, never clinical,
  never guilt-inducing. A tracker that makes her feel behind will not be opened.

## How to verify your work

```bash
npm install --cache .npm-cache   # workspace-local cache; the global one fails with EPERM
npm run typecheck
npm run lint:check
npx prettier --check .
npm run test:coverage
npm run build && npm run preview  # the dev server does NOT run the service worker
```

All six must pass. `npm run build` also runs `prebuild`, which vendors the OCR and PDF assets — that is
expected, and `scripts/report-precache.mjs` reports the precache size. **The precache should stay around
1.2 MB; anything near 10 MB means an asset leaked into `globPatterns` and must be fixed before you
finish.**

Then walk it as she will: at iPad width, with the network **disabled**, over `preview`.

## A rule this repo learned the hard way

Three defects shipped in Workflow B inside code that passed its tests, and **two of the tests written to
pin those fixes passed under both the fix and the reintroduced bug** — so they proved nothing. The same
class of bug is available to you: a status filter that ignores a case, a deadline comparison that is
wrong only across the 04:00 boundary, a migration that silently drops a row.

**When you add a regression test, reintroduce the bug and confirm the test goes red before you trust
it.** A green test that cannot go red reads as coverage and is worse than no test.

Pay particular attention to the migration test. The failure mode of a bad migration is that it passes
at version 3 and has already destroyed data by the time anyone notices.

## Before you write any code

Reply with: **(1)** your implementation plan in a short numbered list, **(2)** your position on the
calendar view and on the schedule-photo import, with reasoning, **(3)** anything in the `Lesson` model,
the status transitions, or the deadline semantics you think is ambiguous or wrong, and **(4)** any
question you need answered.

Then **stop and wait for a go-ahead.** Do not start implementing.

## How to report back

State what you changed and why, what you verified and **how**, what you did **not** verify, and any
check you could not run. "Should work" is not verification. If you could not test something on a real
iPad, say so plainly — no agent in this project has yet, and a real device is the only place the
offline and Home Screen behaviour is true.
