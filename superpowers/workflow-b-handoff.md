# Workflow B handoff — what was built, what was decided, what comes next

**Audience:** the agent or human picking up StudyBao after Workflow B. Everything here is a summary
and a pointer; the authoritative sources are `CLAUDE.md`, `docs/HANDOFF.md`,
`docs/BUILD_GUIDE.md` and the ADRs. **Where this file and those disagree, they win and this file is
wrong.**

Written at commit `662af0b`. Verify with `git log --oneline -6` before trusting the hash table below.

---

## 1. The 60-second version

Workflow B (flashcards + real SM-2 spaced repetition) is **finished, reviewed, and verified**.
Workflows C, D, E, F, S, G and H are **not started**.

|              |                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Exam         | **Friday 26 February 2027**                                                                                       |
| Devices      | iPad as a Home Screen Web App; Windows laptop in a browser tab                                                    |
| User         | one non-technical person; she has never read a stack trace and never will                                         |
| Backend      | none, by decision (ADR 0006). No server, no secrets, no LLM in the runtime (ADR 0004)                             |
| Tests        | **261 passing**, 23 files                                                                                         |
| Coverage     | **83.94% lines, 91.72% branches** against a **70%** floor in `vitest.config.ts`                                   |
| Commits      | `aa978a5` (Workflow A) → `3eb1fd2` (B) → `520290b` (review fixes) → `91afb24` (follow-up) → `2d603f2` → `662af0b` |
| Working tree | **clean**                                                                                                         |

All six required checks are green at `662af0b`: `typecheck`, `lint:check`,
`prettier --check .`, `test:coverage`, `build`, and `preview` (service worker served 200 with no
`push` handler; manifest 200). Also verified: three `--sequence.shuffle` runs and one full run under
`TZ=Europe/London`.

**Read next:** `docs/WORKFLOW-B-REMAINING.md` (the working list), then the runbook for whatever you
were asked to do in `docs/ai/`.

---

## 2. What Workflow B delivered

### The data layer — `src/db/`

Dexie **version 1**, four tables: `decks`, `cards`, `reviewLogs`, `settings`.

- `src/db/types.ts` — `Deck`, `Card`, `ReviewLog`, `AppSettings`, `Grade`. Every timestamp is epoch
  milliseconds. Mutable synced records carry `updatedAt` and `deletedAt?`; **`ReviewLog` is the
  named exception** — append-only, so it has neither.
- `src/db/schema.ts` — the schema, the lazily-opened singleton, the `populate` seed hook, and the
  test-only reset helpers. **Any change here needs a version bump and a tested migration.**
- `src/db/seed-data.ts` — the five PRC Nursing Practice parts, transcribed verbatim from
  `docs/reference/pnle-scope.md`.
- `src/db/repositories/` — `decks`, `cards`, `review-logs`, `settings`. **All IndexedDB access goes
  through here**; ESLint enforces it.
- `recordReview` writes the card **and** its `ReviewLog` row **in one transaction**, so grading can
  never leave a hole in history.

### The scheduler — `src/features/flashcards/lib/sm2.ts`

A pure `schedule(state, grade, now)`, with `src/lib/study-day.ts` holding the **single**
implementation of the 04:00 study-day boundary (the scheduler uses it now, the streak logic in
Workflow F will use it next).

### The UI

Deck list → deck detail (add / edit / delete / reset-progress) → review session at `/cards/review`
and `/cards/:deckId/review`, plus cram mode and an exam-date setting in Settings.

### Files worth knowing about

| Path                                                  | why it matters                                                |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `src/features/flashcards/lib/sm2.ts`                  | the scheduler. Read the contract at the top before editing it |
| `src/lib/study-day.ts`                                | the 04:00 boundary. **Never re-derive it elsewhere**          |
| `src/db/repositories/cards.ts` → `recordReview`       | the only legitimate writer of SM-2 state                      |
| `src/features/flashcards/hooks/use-database-value.ts` | the shared refresh mechanism (see §5)                         |
| `src/features/flashcards/hooks/use-review-session.ts` | the session state machine, and the subtlest file in the repo  |
| `src/features/flashcards/lib/queue.ts`                | due filtering, cram ordering, and `pickNextCard`              |

---

## 3. Every decision made during Workflow B

These are the ones a future agent could plausibly "fix" by accident. Each has a test that fails if it
is changed, and each is in `BUILD_GUIDE.md` §4/§6 and `docs/DECISIONS.md` §C.

### Scheduling

| Decision                                                                                                            | Why                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repetitions` counts **graduated** reviews only — the learning steps do not increment it                            | Otherwise "Good four times → ~15 days" (the Workflow B definition of done) is false, and §6 has two readings                                          |
| A lapse **zeroes `intervalDays`** as well as `repetitions`                                                          | Mastery is `intervalDays >= 21`, so a stale 38 would report a just-failed card as mature                                                              |
| Mastery is **`learningStep === null && intervalDays >= 21`**                                                        | Cannot be true mid-learning by any route. Derived on read, never stored                                                                               |
| **Hard repeats the step. Good advances one. Easy graduates immediately from any step**                              | Easy must diverge from Good on a _fresh_ card or the fourth button is arbitrary. Easy's reward is the ease factor, deliberately not a longer interval |
| A **new card is due immediately** (`nextReview = now`), matching `resetCardProgress`                                | The step governs when a card comes _back_, not whether she may review it now. Also two routes to "brand-new" must not disagree                        |
| Day-scale intervals are **calendar days from the 04:00 boundary** (`addStudyDays`), not `boundary + n × 86_400_000` | A fixed offset lands at 03:00 across a DST transition — the _previous_ study day. Learning steps stay rolling minutes                                 |
| `learningStep` names the step the card is **waiting on**, not the one it passed                                     | Keeps `schedule` a pure function of `(state, grade, now)`; the alternative needed a clock comparison inside it                                        |
| The session **freezes membership but chooses the next card against the clock**                                      | Deciding "is it due again?" at grade time always answers no, because `schedule` guarantees `nextReview > now`. This was a real defect — see §4        |

### Ease factor

`EF' = EF + (0.1 − (5−q) × (0.08 + (5−q) × 0.02))`, applied on **every** grade including failures
and learning steps, floored at **1.3**. The deltas are **Again −0.80 · Hard −0.14 · Good 0.00 ·
Easy +0.10**, so the floor is reached on the _second_ consecutive Again (2.5 → 1.7 → 1.3).

> A review message asserted Again was −0.90. That was arithmetic slip: `0.1 − 5 × (0.08 + 5 × 0.02)`
> is `0.1 − 0.90`, so 0.90 is the inner product and the delta is −0.80. Reaching −0.90 needs the
> inner coefficient changed from 0.02 to 0.024, which breaks Hard. **The formula stands; there is no
> ADR.** The delta is rounded before summing, because IEEE-754 puts residue in the expression itself.

### Architecture and process

| Decision                                                                                                               | Why                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dexie is imported only by `src/db/`**                                                                                | One audit point for migrations and sync. The original ESLint rule blocked the one directory it told you to import from — fixed                                                                             |
| `fake-indexeddb` is a **devDependency** and is lint-restricted everywhere, including `src/db/`                         | Test infrastructure must not be able to reach the bundle. Noticing it in a diff is not a control                                                                                                           |
| **One `useDatabaseValue` subscription** drives every data-backed hook                                                  | A write on one screen updates the others. Deliberately not `dexie-react-hooks` (a dependency for one behaviour) and deliberately not Zustand (mirroring Dexie into a store _is_ the staleness it prevents) |
| The review session is a **route**, not mode state                                                                      | She will hard-refresh mid-session one day — a tab restore, a swipe, ITP — and a route resumes from the database where React state would be lost                                                            |
| Seeding is gated on a **`seededAt` marker**, not on "are there any decks"                                              | A deck she deletes must stay deleted. "Seed if empty" resurrects it every launch                                                                                                                           |
| **Deletes are tombstones** (`deletedAt`), and deleting a deck tombstones its cards in the same transaction             | A hard delete is resurrected by the other device; orphaned live cards would appear from nowhere                                                                                                            |
| Cram mode is **automatic** inside a configurable threshold (default 30 days), with a "show due cards instead" override | The normal schedule is counterproductive in the last weeks. The override means cram is never the only way to review                                                                                        |
| Cram ordering is `(lapses + 1) × daysSinceLastReview`, ties broken by official deck order then id                      | PRC publishes no item weights, so any percentage would be invented. Never-reviewed cards measure staleness from `createdAt` and are **never** `Infinity` (that makes the comparator produce `NaN`)         |
| Card edits **preserve** scheduling state; "reset this card's progress" is explicit                                     | Cards arrive from OCR in Workflow C, so editing is the normal case. Resetting on every typo fix would destroy weeks of spacing                                                                             |
| `ReviewLog` has no `updatedAt`/`deletedAt`                                                                             | It is never mutated. **Workflow S must merge it union-only** — a last-write-wins merge on an append-only table is silent history loss                                                                      |

### Two dependencies added

`dexie` (runtime) and `fake-indexeddb` (dev). Both MIT, no network call, no paid tier, no API key.
Nothing else was added.

---

## 4. The three defects found in review, and what to learn from them

These were all in code that passed its tests. Read this before trusting a green run.

**A. The learning steps did not work.** `schedule` guarantees `nextReview > now`, so the
`dueAgain = fresh.nextReview <= Date.now()` check — evaluated immediately after the write — was
_always false_. A card graded Again was scheduled 1 minute out and never came back, which quietly
made `LEARNING_STEPS_MINUTES` unenforceable and defeated a core part of ADR 0003. **Fix:** decide
when the next card is _chosen_, against the clock. Two follow-on bugs surfaced only during the fix:
excluding everything ever served collapses the ladder to a single repeat, and reading the shared
snapshot instead of the database means a poll re-evaluates against a stale card forever.

**B. Easy did not graduate immediately.** It advanced a step exactly like Good, so on a fresh card
the fourth button did nothing distinguishable — while its own docstring said otherwise.

**C. A new card was not reviewable for 60 seconds.** Add a card, tap Review, "nothing to do for a
minute". Also internally inconsistent: `resetCardProgress` set `nextReview = now`.

**And the meta-lesson, which cost the most time.** Two of the tests written _for_ these fixes passed
under both the fix and the reintroduced bug, so they proved nothing:

- the cram deck-order test needed a card in a deck whose id sorts before `deck-practice-i`, because
  string-sorting the real deck ids coincidentally gives the right answer;
- the DST test needed **its own file**, because setting `process.env.TZ` part-way through a suite
  changes nothing.

Both now fail against the bug and pass against the fix. **When you add a regression test here,
reintroduce the bug and confirm the test goes red before you trust it.** A green test that cannot go
red reads as coverage and is worse than no test. `docs/ai/write-tests.md` says this explicitly now.

---

## 5. What is verified, and what is not

**Verified (run, not reasoned about):** all six checks; 261 tests; three shuffled runs; the whole
suite under `TZ=Europe/London`; `dist/sw.js` served 200 with no `push`/`notificationclick` handler;
`dist/manifest.webmanifest` 200; the `fake-indexeddb` lint rule firing in both `src/db/` and
`src/lib/` by probe; the DST and cram-order tests failing against reintroduced bugs.

**NOT verified — do not assume these work:**

- **No real iPad, no real Windows browser, no touch.** Everything is jsdom plus one HTTP fetch of the
  preview build. iPadOS Home Screen behaviour, ITP eviction, and the service worker's offline cold
  start are untested here.
- **No offline-with-network-disabled walkthrough** of the add-card → review loop.
- **No upgrade from a pre-existing database**, because version 1 is the first version — there is no
  v0 in the world. `src/db/migrations.test.ts` seeds and reopens at v1 and asserts nothing is lost,
  including tombstones and a row with optional fields absent. That is the pattern for version 2, not
  a substitute for it.

---

## 6. What to do next

### Recommendation: **Workflow C — the ingest pipeline** (`BUILD_GUIDE.md` §4)

**Why C first.** Workflow B shipped manual card entry, and that is now the app's real bottleneck: she
has to hand-type every card from her notes. C removes that tax, and it is the only remaining workflow
that makes the _core loop_ better rather than adding a second one. It also has no prerequisites
beyond what exists — the `Card` model it writes into is already there, and its parser is pure logic
with a test list already written in `docs/ai/write-tests.md`.

**Why D (Pomodoro) is the strong alternative.** `BUILD_GUIDE.md` §9.1 argues B and D were the only
two things that needed to exist early, and D is independent of everything. Pick it if you want a
self-contained win with no data-model work.

**Why not the others yet.** F (dashboard) wants review history to display, and though B now captures
`ReviewLog` from the first review, the history is currently one commit old and nearly empty. S (sync)
is the highest-risk workflow in the project and interacts with the data model — schedule it when
there is data worth protecting, but know that `ReviewLog`'s union-only merge rule is waiting for it.
E (tracker) and G (nudges) are additive; H (polish) is the add-to-Home-Screen prompt and the
export/import screen, which `CLAUDE.md` calls the highest-value screen in the app — worth doing before
she depends on the app for weeks of data.

### Constraints that apply to whatever you pick

- **Do not start a workflow without its own go-ahead.** Phases are sequential by design.
- **No LLM in the shipped product** (ADR 0004) — C's card generation is Tesseract.js OCR plus a
  deterministic parser. No model call, ever.
- **No backend, no push service, no API key, no server-side secret** (ADR 0006).
- **Any Dexie change is a version bump plus a tested migration** — read `docs/ai/change-data-model.md`
  first; there is no undo on her device.
- **Never weaken a check to get green.** A failing check is a defect report.
- Follow the matching runbook in `docs/ai/`, and copy `src/features/flashcards/` as the canonical
  feature shape — it is the only complete data-backed feature in the repo.

### Three known items for whoever does S (sync)

1. **`ReviewLog` must merge union-only.** Named in `CLAUDE.md`, `change-data-model.md` and the type's
   doc comment, because it is easy to forget.
2. **`recordReview` does a whole-record `put`.** Fine with one writer; it will revert a concurrent
   text edit once there is a second tab or sync. The fix — a field-level `update` inside the same
   transaction — is documented at the function. Do it as part of S, not before: narrowing the write
   now would silently ignore any SM-2 field added later.
3. **`useDatabaseValue` lives under `features/flashcards/hooks/`.** Promote it to `src/lib/` or
   `src/db/` when a third feature needs it. **Do not copy it**, or two screens will disagree about
   what is current.

---

## 7. Environment notes that cost real time

- **Sandbox:** the default file sandbox blocks child processes, so `npm install`, `npm ci`, `vitest`,
  `vite build`, `vite preview` and `git commit` (Husky's hooks) all fail without wider access —
  `spawn EPERM`, or a pipe-creation Win32 error for git. That is the environment, not the project.
- **`npm ci --ignore-scripts` resolves every package but strips esbuild's binary**, after which the
  build dies with `Cannot find module` until a full `npm install` runs. This trap cost time twice.
- **The npm cache may need to be workspace-local:** `npm install --cache .npm-cache`. On this machine
  the global cache at `C:\Users\Raphael\AppData\Local\npm-cache` failed with `EPERM`.
- **The preview server binds IPv6:** `http://127.0.0.1:<port>` is refused, `http://localhost:<port>`
  works. `web_fetch` refuses loopback, so check the service worker with `Invoke-WebRequest`.
- **The service worker does not run under `npm run dev`.** Verify PWA behaviour only with
  `npm run build && npm run preview`.
- **Vitest is pinned to v3 and TypeScript to 5.x on purpose.** Vitest 4/5 make npm 10 crash during
  peer resolution, and the `--legacy-peer-deps` workaround produces a lockfile that fails `npm ci`.
  Confirm **both** `npm install` and `npm ci` before touching a test dependency.
- **A workspace file-permission fault was repaired during this session** (`writeOwner` was missing on
  `D:\repos\StudyBao`, which blocked every workspace operation). Backups and a rollback script are in
  `D:\repos\StudyBao-acl-recovery\` — that directory is outside the repo and can be deleted once you
  no longer want the rollback. It is not part of the project.

---

## 8. Where the authoritative detail lives

| Question                                                   | File                                          |
| ---------------------------------------------------------- | --------------------------------------------- |
| Constraints, the two AI boundaries, commands, design rules | `CLAUDE.md`                                   |
| Current state of the world, all decisions and reversals    | `docs/HANDOFF.md`                             |
| The plan of record, workflow definitions, the data model   | `docs/BUILD_GUIDE.md`                         |
| Open questions with working defaults                       | `docs/DECISIONS.md`                           |
| How to run a workflow safely                               | `docs/ai/README.md` and the per-task runbooks |
| Why the plan looks like this (a dated review)              | `docs/CRITIQUE.md`                            |
| The PRC scope the decks are seeded from                    | `docs/reference/pnle-scope.md`                |
| Workflow B's own working list                              | `docs/WORKFLOW-B-REMAINING.md`                |

**One thing to check in December 2026:** PRC should publish the February 2027 program around then.
Re-run the five-point check in `docs/reference/pnle-scope.md` before she has thousands of cards filed
under the current taxonomy.
