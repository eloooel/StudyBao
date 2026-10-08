# Workflow B — status and what is left

> **Mostly spent.** The state of the world is [`HANDOFF.md`](HANDOFF.md) — read that first.
>
> Done since this file was last accurate: item 3 (`useDatabaseValue` promoted to `src/lib/`, during
> Workflow C), and the whole of Workflows C, D and E.
>
> Still open: item 2, the `recordReview` whole-record write, and item 4, the union-only merge rule for
> `ReviewLog`. Both belong to Workflow S, and both are repeated in `HANDOFF.md` §8. Workflow S must also
> sync `lessons`, the sixth table — see `BUILD_GUIDE.md` §4 Workflow S.
>
> **The hashes and test counts in the table below are historical and were stale within days of being
> written.** Run `git log --oneline` instead — the file's own warning applies to it.

This file was a working list while Workflow B was being finished. Most of it is done; what remains is
small, and none of it blocks the next workflow.

Use `git log --oneline -4` for the real hashes — this file is not rewritten on every commit.

|           |                                                                                           |
| --------- | ----------------------------------------------------------------------------------------- |
| `3eb1fd2` | **feat: Workflow B** — data model, SM-2, repositories, CRUD UI, review session, cram mode |
| `520290b` | **fix:** the learning steps actually work — defects A, B and C from review                |
| `91afb24` | **feat:** surface the waiting state, DST coverage, cram-order test, lint hardening        |
| tests     | 261 passing, 23 files                                                                     |
| coverage  | 83.9% lines, 91.7% branches against a 70% floor (`vitest.config.ts`)                      |

**All six checks are green on `91afb24`**: typecheck, lint, prettier, `test:coverage`, `build`, and
`preview` (service worker served 200 with no `push` handler; manifest 200). Also verified: three
`--sequence.shuffle` runs, and the whole suite under `TZ=Europe/London`.

---

## Done since the first review

- **Defect A, including the UI half.** The session chooses the next card against the clock, so a card
  graded Again returns inside the same session. `waitingToReturn` and `finished` are surfaced: the
  review screen says "One card is coming back" / "N cards are coming back" instead of "That's the lot"
  while work is still outstanding. Covered in `flashcards-views.test.tsx`.
- **Defect B.** Easy graduates immediately from any learning step; Easy and Good diverge on a fresh
  card, asserted directly.
- **Defect C.** A new card is due immediately, matching `resetCardProgress`. The whole ladder is
  asserted end to end against the real repository: 10 minutes → 1 day → 6 days → 15 days.
- **The `fake-indexeddb` lint hardening.** Present in both the main config and the `src/db/` override,
  and the override no longer switches `no-restricted-imports` off wholesale — which would have left the
  very hole the rule exists for. Verified by probe in both directories.
- **The four minors**: `LearningStep` documented rather than narrowed (with the reason), `addStudyDays`
  for calendar-day arithmetic, tombstone queries using the `deletedAt` index, and the `recordReview`
  read-modify-write limitation written down beside the code.
- **The DST fix is verified, not asserted.** `src/lib/study-day.dst.test.ts` pins `Europe/London` in its
  own file and asserts both transitions; it fails against the old fixed-offset form (05:00 and 03:00
  instead of 04:00). The full suite passes under that timezone too.

## What is left

**Nothing in Workflow B.** What remains is for whoever picks this up:

1. **Two behavioural tests are worth re-reading before trusting them.** Both were wrong on first write —
   passing under the fix _and_ under the bug. The cram deck-order test needed a phantom deck whose id
   sorts before `deck-practice-i`; the DST test needed its own file, because setting `TZ` mid-suite does
   nothing. Both were then confirmed to fail against the reintroduced bug.
   `docs/ai/write-tests.md` now says this explicitly, because a green test that cannot go red reads as
   coverage and is not.
2. **`recordReview` still does a whole-record `put`.** Fine with one writer; it will revert a concurrent
   text edit once there is a second tab or sync. The limitation and the fix (a field-level `update`
   inside the same transaction) are documented at the function. **Worth doing as part of Workflow S, not
   before** — with one writer it costs nothing, and narrowing the write now would silently ignore any
   SM-2 field added later.
3. ~~**`useDatabaseValue` lives under `features/flashcards/hooks/`.**~~ **Done in Workflow C.** Ingest
   is the third consumer, so it was promoted rather than copied, as instructed — to
   `src/lib/use-database-value.ts` and not to `src/db/`, because `src/db/` holds the schema and the
   repositories and a React hook there would mix layers. `notifyDataChanged` is still exported
   alongside it, and all six former importers now point at `@/lib/use-database-value`.
4. **`ReviewLog` must merge union-only** when Workflow S lands. Named in `CLAUDE.md`,
   `docs/ai/change-data-model.md` and the type's own doc comment, because a last-write-wins merge on an
   append-only table is silent history loss and the rule is easy to forget.

## Not verified by me, and why

- **No real iPad, no real Windows browser, no touch.** Everything is jsdom plus one HTTP fetch of the
  preview build. iPadOS Home Screen behaviour, ITP eviction, and the service worker's offline cold start
  are all untested here.
- **No offline-with-network-disabled walkthrough** of the add-card → review loop.
- **No upgrade from a pre-existing database**, because version 1 is the first version — there is no v0
  in the world. `src/db/migrations.test.ts` seeds and reopens at v1 and asserts nothing is lost,
  including tombstones and a row with optional fields absent. That is the pattern for version 2, not a
  substitute for it.

## Sandbox notes

The default file sandbox blocks child processes, so these needed wider access:

- `npm install`, `npm ci`, `vitest`, `vite build`, `vite preview`, and `git commit` (Husky's hooks) all
  fail without it — `spawn EPERM`, or a pipe-creation Win32 error for git.
- `npm ci --ignore-scripts` resolves every package, **but strips esbuild's binary**, after which the
  build dies with `Cannot find module` until a full `npm install` runs. That trap cost time twice.
- The preview server binds IPv6: `http://127.0.0.1:<port>` is refused, `http://localhost:<port>` works.
- `web_fetch` refuses loopback, so the service worker was checked with `Invoke-WebRequest`.

## Not in scope, still not started

Workflows F (dashboard), S (sync), G (nudges), H (polish). C, D and E have since shipped. Each
remaining workflow needs its own go-ahead, per `CLAUDE.md` and `BUILD_GUIDE.md` §4.
