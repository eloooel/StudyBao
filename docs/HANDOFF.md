# Handoff — read this second

You are picking up **StudyBao** mid-build. This file is the state of the world: what exists, what was
decided and why, what is one-way, and what to do next.

**Read order:** [`CLAUDE.md`](../CLAUDE.md) (constraints and the two AI boundaries) → this file → the
runbook for whatever you were asked to do in [`docs/ai/`](ai/README.md).

**State of the tree:** everything through Workflow D is **committed. Workflow E (the lesson tracker) is
implemented in the working tree and is not committed yet** — it is awaiting review, so `git status`
showing it is expected rather than half-finished work. Everything in §1 below was measured on that
working tree.

Do not trust a commit hash written in a document — including this one. The first version of this
paragraph named a checkpoint that went stale within four commits and claimed the work on top of it was
uncommitted when it had in fact been committed, which sent a reader looking for work that did not exist.
Run `git log --oneline -6` and `git status` instead. The Workflow B checkpoint is the commit whose
message begins `feat: Workflow B`.

What Workflow B deliberately left open is in
[`docs/WORKFLOW-B-REMAINING.md`](WORKFLOW-B-REMAINING.md) — read it alongside this file.

---

## 1. The 60-second version

A study companion for one person's **PNLE** (Philippine Nurse Licensure Examination) review. Flashcards
with SM-2 spaced repetition, a Pomodoro timer, a lesson tracker, and in-app attention nudges. Free tools
only, **no backend**, browser-based. Coquette pink-and-white.

|                                                                              |                                                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Her exam**                                                                 | **Friday, February 26, 2027**                                                    |
| **Her devices**                                                              | iPad (as a Home Screen Web App) and a Windows laptop (browser tab)               |
| **Workflow A** (scaffold + design system)                                    | ✅ **Done**                                                                      |
| **Workflow B** (flashcards + SM-2)                                           | ✅ **Done** — reviewed, defects fixed, committed                                 |
| **Workflow C** (ingest pipeline)                                             | ✅ **Done** — all three commits (paste, PDF, photo OCR)                          |
| **Workflow D** (Pomodoro + sessions)                                         | ✅ **Done** — the first schema migration in the project's history                |
| **Workflow E** (lesson tracker)                                              | ✅ **Done, verified** — Dexie version 3; calendar grid and photo import deferred |
| **Reveal-scoped H** (first run + Home Screen prompt, and the Today dead end) | ✅ **Done** on `wip/pre-reveal-two-changes` — **not yet on `main`**              |
| **Export/import** (JSON save + restore)                                      | ✅ **Done** on the same branch. Import **replaces**; merge is S's.               |
| F, S, G                                                                      | ⏸ Not started                                                                    |
| Tests / coverage                                                             | 684 tests, 88.94% lines, 89.27% branches (floor is in `vitest.config.ts`)        |

**The two rows above are committed on a branch, not on `main`.** They were built concurrently, so they
share one branch and will land together. Anything reading this file as "what `main` contains" should
check `git log` first — `main` is two changes behind until that pull request merges.
| Backend | None, by decision. No server, no secrets. |

### Export/import shipped — her only backup that is not Google

**Two buttons in Settings, and they are the whole safety net until S lands.** Settings carries **Save a
backup** and **Restore a backup**: one JSON file with **every table** — decks, cards, review logs,
settings, sessions, lessons — named `studybao-backup-YYYY-MM-DD.json`, and a restore that replaces
everything on the device. Six things about it are load-bearing:

- **Import REPLACES and never merges.** A merge is the correct answer for _sync_, which is S, and S
  owns the union-only rule for `ReviewLog` and its six test cases. A second, weaker merge here would be
  the drift this repo keeps paying for. The screen says so in her words, and a test asserts that a row
  which is not in the file does not survive.
- **`seededAt` is the seeding gate, not "are there any decks".** An import that restored `decks` but not
  the settings row would leave no marker, and the next open would seed **five duplicate PRC decks** —
  resurrecting a deck she had deleted. The settings singleton is required by validation, and
  `withSeededMarker` stamps a missing marker inside the write. The test asserts the **consequence**: a
  simulated next open (`seedInitialData` with a later clock) adds nothing and leaves the tombstone
  deleted.
- **Validation happens before the database is touched, and the write is one transaction across all six
  tables.** A refused file writes nothing — asserted against the database for all eleven refusal cases,
  not against a thrown error — and a write that fails partway (a `bulkPut` spy rejecting on the fifth of
  six) rolls the clears back with it. That atomicity test is the one that proves the transaction is
  doing the job; unwrapping it turns exactly that test red.
- **The envelope is versioned: `formatVersion: 1`.** A newer file is **refused**, not guessed at; the
  counts in the file are a cross-check against the arrays (so a truncated or hand-edited file is caught)
  rather than decoration; unknown tables are refused rather than dropped.
- **The table list lives in `src/lib/backup-format.ts`, and a test asserts it covers every table the
  schema declares.** Adding a seventh table without adding it there turns the suite red instead of
  shipping a backup that silently omits her data — the `sessions` lesson, institutionalised. The
  settings singleton's id is duplicated in that module so it stays free of the Dexie schema, and
  `src/db/repositories/backup.test.ts` asserts the two are equal.
- **What a round trip must preserve, and does:** tombstones (a deleted card stays deleted), optional
  fields that are **absent** rather than blank (a lesson with no `deadline`, a card with no
  `lastReviewedAt`), and `ReviewLog`, which cannot be reconstructed.

**Recorded rather than hidden:** the export/import change ran the repo's six-probe red/green drill (drop
the settings write; per-table writes with no transaction; no version check; a write on the refusal path;
`toISOString()` for the filename; the table list missing `lessons`). All six went red, and each file was
restored from a copy kept **outside** the repository with SHA-256 compared before and after.

**Deliberately not here:** no merge or sync (S), no scheduled or nagging export (D13 — a reminder she
cannot complete is worse than none), no CSV (declined), and no encryption or passphrase. The **import**
is unverified in the same way the export is: one transaction replacing six tables is where a slow or
failed operation would surface, and nobody here has a device.

### Workflow E shipped — and bumped Dexie to version 3

**Her plan finally has a home.** The app represented _cards_ and _time_; it now represents _what she is
supposed to be studying next_, which was the last piece of the loop. `/lessons` is a real screen: add,
edit, filter, mark mastered. Five things about it are load-bearing:

- **`deadline` is optional, and undated lessons are a first-class state** ("No date yet", last). A
  required date forces her to invent one at entry for every topic she has not planned, and an invented
  date is a _wrong_ number — it sorts into "overdue" and shows for a deadline she never meant.
  `BUILD_GUIDE.md` §6 was amended rather than implementing the original required field.
- **Mastered is out of the default view entirely.** The default chip is "To do" (everything not
  mastered); Mastered has its own chip one tap away, and its own flat section rather than date groups.
  A finished topic must never render as outstanding — that is the guilt framing the voice rules forbid,
  and the fastest way to make her stop opening the tracker. `isOverdue` also refuses to call a mastered
  lesson late regardless of its date.
- **Overdue is a study-day question, not a clock question.** A deadline is stored as the **04:00
  study-day start** of the day she means (the same rule as `examDate`), and overdue-ness is
  `studyDaysBetween(deadline, now) < 0`. Comparing `deadline < Date.now()` would mark every lesson late
  from 04:00 on the day it is due. `daysUntilExam` is deliberately the _other_ kind of count and is not
  reusable — both now carry doc comments saying which is which.
- **Statuses are stored as stable keys**, never the labels she reads, so "a filter that ignores a case"
  is not a bug that is tested for but one that cannot be expressed. Both the chip and the row read the
  same literal union.
- **Every chip and every section has its own empty state.** A filter that matches nothing is the normal
  case on a good week, and a blank region under a row of chips is indistinguishable from a bug.

**The migration.** Version 3 adds `lessons` with an **intentionally empty** upgrade, for the same
reason as version 2: it introduces a table and transforms no row, so a retried migration cannot corrupt
anything. `deadline` and `notes` are optional on every row, so no row needs a default written into it.
`src/db/migrations.test.ts` now carries a **v2 → v3** test alongside the v1 test (which now walks
v1 → v3), both built from a bare `Dexie`; the v2 test seeds sessions, including a tombstone and an
abandoned block, because restating "the v1 stores" in the v3 block instead of the v2 ones is exactly
how the `sessions` table would be emptied. `lessons` was also added to `clearDatabaseForTests`'
enumerated table list, which is the list that exists because `sessions` was once missed.

**Two things were deliberately not built, and both are recorded rather than dropped.** The **calendar
grid** is deferred: its cells are calendar days, which fights the 04:00 rule head-on (a grid says
"yesterday" from midnight; the app does not), so the list carries the date _and_ a relative label
instead. The **schedule-photo import** is deferred too: tabular and handwritten input is Tesseract's
weakest case, and the field it would fill is the one that decides which section a lesson lands in — a
wrongly parsed date is invisible because the lesson sorts confidently into the wrong bucket. §8's
definition of done for E ("created, filtered, and completed without touching OCR") is what shipped.

**How E was verified, and how to re-verify it.** All six checks in §4 were run on this working tree and
passed:

- `typecheck`, `lint:check` and `prettier --check .` — green, and they run under the default file sandbox.
- `test:coverage` — **41 files, 552 tests, 0 failures**, 87.4% lines / 88.5% branches / 83.6% functions.
  That is 92 tests and about a point of line coverage more than Workflow D left; the whole feature carries
  its own tests rather than leaning on the floor.
- `build` — green, 155 modules. Precache is **88 entries with zero PDF or OCR entries**, and
  `/lessons` is emitted as its own lazy chunk. `dist/sw.js` and `dist/manifest.webmanifest` exist.
  **E adds no asset, no route and no network call**, so none of that changed shape. The precache byte
  count is deliberately **not** restated here: an earlier version of this line carried a figure that had
  already gone stale by the time it was read. `node scripts/report-precache.mjs` reports it from the
  generated manifest, which is the only place it should come from.
- `preview` — the built app was served and checked over HTTP: `/`, `/lessons` and `/cards` return the
  shell (the SPA fallback works for the deep link), the service worker is served and contains **no**
  `push` or `notificationclick` handler, and the manifest is `application/manifest+json`. The server was
  stopped afterwards.

**The red/green record, which is the part worth keeping.** Eight probes were run, each reintroducing one
specific defect and each expected to turn a test red; all eight did, and every touched file was restored
byte-for-byte (SHA-256 compared before and after):

| Probe (the bug put back)                            | Result   |
| --------------------------------------------------- | -------- |
| `deadline < Date.now()` instead of the study day    | 3 failed |
| A mastered lesson allowed to be overdue             | 1 failed |
| The 7-day "this week" edge moving to `<`            | 1 failed |
| Mastered lessons back in the default view           | 1 failed |
| An unrecognised `?status=` value surviving          | 1 failed |
| The v3 store block omitting `lessons`               | 4 failed |
| Clearing a deadline leaving the stale date          | 2 failed |
| A status write without the data-change notification | 1 failed |

The last one is the one worth noticing: it fails in the **page** test, not a pure one, which is what makes
that file worth its length — it is the only test here that can see Layer 1, Layer 2, Layer 3 and Dexie
disagreeing with each other.

**Two defects were found in that new page test by running it, and both are recorded because the lesson
generalises.** Its first version asserted chip counts _synchronously_, before the asynchronous read had
landed, so it read the pre-load zeroes; and it hard-coded "today" as 2026-09-21 while the app correctly
used the real clock, so a lesson it expected to be three days away was already overdue. It now builds
deadlines relative to `Date.now()` through `addStudyDays`, and its waits carry an explicit timeout with
the same reasoning `src/router.test.tsx` records: a failure there is a finding about speed, not tuning.

**What was not verified, and cannot be from here.** There is no browser and no iPad in this environment,
so: iPad-width layout, touch targets, the offline cold start, the service worker's runtime behaviour and
WebKit's storage behaviour are all untested. `preview` proves bytes are served, not that a screen renders.
The v2 → v3 migration is tested against `fake-indexeddb` only; no database that exists in the world has
been upgraded by hand — and since C, D and E all shipped before she has the app, version 2 may never exist
on her device at all, with version 3 as the first version it sees. The date-input validation branch is
covered as a pure rule rather than through a DOM interaction, because a browser's date input cannot
produce an invalid value.

### Workflow D shipped — and bumped Dexie to version 2

The timer is real: 25/5/15 with a long break after four work blocks, configurable from Settings,
with a sound cue on every transition and each block logged. Five things about it are load-bearing:

- **A session row is written twice per block.** It is created when she presses Start and completed
  when the block ends. Write-once-at-the-end would mean a block interrupted by a closed tab leaves
  _nothing_, and on an iPad closing the tab is normal with no server to notice (ADR 0006). So an
  abandoned row stays, `completed: false` — which is the honest record and is what stops a skipped
  block from earning a long break or inflating a streak.
- **`endedAt` means two things.** Until `completed` is true it is the _planned_ end
  (`startedAt + plannedMs`), which is how an abandoned row is recognised.
- **Remaining time is a subtraction, never a countdown.** A one-second interval only triggers a
  repaint; the arithmetic reads `endsAt`. iOS suspends timers in a backgrounded tab, so a
  decrementing counter would be wrong by exactly the time she was away — the situation she is
  actually in. Tested by jumping the clock in large irregular steps, which a counter fails.
- **The audio context is created inside the first press.** A context created at load starts
  `suspended`, so the first cue would be silent — the failure §4 warns about. `lib/cue.ts` creates it
  lazily on a cue, and every `playCue` call happens inside a press handler.
- **`cyclesCompleted` counts completed work blocks only.** Four presses of Start are not four blocks
  of focus; this is the off-by-one that decides when the long break arrives.

**The migration.** Version 2 adds `sessions` with an **intentionally empty** upgrade — it introduces
a table and transforms no row, so a retried migration cannot corrupt anything. The new `settings`
timer fields are all optional, so a Workflow B settings row reads back unchanged: absent means "use
the default", never "zero minutes". `src/db/migrations.test.ts` now carries a v1 → v2 test that
builds the old database from a bare `Dexie` (opening `StudyBaoDb` would run the migration under
test), seeds a tombstone and a legacy row, reopens, and asserts every field survived — including
that `intervalDays` and `lapses` are byte-for-byte intact.

**One test was loosened deliberately, and it is recorded rather than hidden.** `src/router.test.tsx`
now passes an explicit timeout on its lazy-route waits. It failed once in three coverage runs: the
index route rendered in **1404ms** against `findByRole`'s 1s default. That is contention, not a
break, and the comment in the file says that raising it again should be treated as a finding about
route speed rather than as tuning.

### Workflow C shipped in three commits

Decided by the owner, so the valuable part landed first and the risky part could not block it:

1. **Paste + normalize + parse + review screen** — zero new dependencies.
2. **PDF** (`pdfjs-dist`).
3. **Photo OCR** (`tesseract.js`, assets vendored into `public/`).

Ingest is reachable from a primary **"Add from your notes"** action on the Cards screen, at
`/cards/ingest`, with the review screen at `/cards/ingest/review`. A screen rather than a sixth
bottom-nav item: the bar is already five, which is the practical ceiling on an iPad.

**What the paste path does, and the trap it was built around.** `parse` reports **provenance** — the
input lines each card was assembled from — because that is what makes its one invariant assertable:
every normalized line belongs to exactly one card's span or to the leftover queue, never two, never
none. `assertProvenance` enforces it in code, so a future rule that drops or double-claims a line
throws rather than quietly returning a plausible array. Four separate defects were found by fixtures
during that work, each then confirmed to fail against its reintroduced bug; the full list is in
`docs/ai/write-tests.md`.

**The PDF traps, all of which were live problems rather than theoretical:**

- **PDF.js was being loaded eagerly.** A static `import` put the whole library in the ingest page's
  chunk — **436 KB** fetched by anyone who only wanted to paste text. It is now a dynamic import, and
  that chunk is **10 KB**.
- **The service worker was precaching the lazy PDF chunk**, which defeats the laziness entirely.
  `globPatterns` is an allowlist of _extensions_, so the dynamic chunk re-entered the precache by
  ending in `.js`. It also swept in two `*_nowasm_fallback.js` files (~600 KB) from `public/pdfjs/`.
  Both are now named in `globIgnores`, with the reasoning inline.
- **`quickjs-eval.wasm` is deliberately not copied.** PDF.js uses it to execute JavaScript embedded
  in a PDF. Copying it would enable running code from a document she was sent, on the device holding
  her study history. `scripts/copy-pdf-assets.mjs` uses an allowlist so this stays a decision rather
  than an accident.

**The OCR traps:**

- **The language data is the `tessdata_fast` model, not the default.** The default `tessdata` model
  that `tessdata.projectnaptha.com` serves is **10,923,060 bytes** gzipped; `tessdata_fast`'s
  `eng.traineddata` (4,113,088 bytes raw) gzips to **1,962,155 bytes** — a 5.6× saving. §3 labels
  photo OCR best-effort and points at her phone's Live Text for anything hard, so the trade favours
  the small model. Swapping is one file; `scripts/vendor-ocr-lang.mjs` records the pinned source and
  the sha256.
- **The language data is committed; the rest is not.** `public/pdfjs/` and `public/ocr/worker.min.js`
  - `public/ocr/core/` are regenerated from `node_modules` by `npm run assets` (run by
    `predev`/`prebuild`), because ~45 MB of vendored WebAssembly in git is a diff nobody reads. The
    language file cannot be derived from `node_modules`, so committing it is what keeps the build
    offline.
- **`corePath` must be a directory, and the brief's "four files" is stale.** `tesseract.js-core@7`
  ships **six** capability variants (`tesseract-core`, `-lstm`, `-simd`, `-simd-lstm`,
  `-relaxedsimd`, `-relaxedsimd-lstm`), each a `*.wasm.js` loader plus the `*.wasm` it fetches.
  Pointing at one file is the documented way to break SIMD devices.
  `scripts/copy-ocr-assets.mjs` verifies all twelve files are present.
- **`Content-Encoding: gzip` on the language file would have broken the photo tab on deploy.**
  tesseract.js gunzips the language data **itself**, so a host that gzips a `.gz` makes the browser
  decode it transparently and the library then fails on the inner payload. `vercel.json` sets
  `Content-Encoding: identity` for `/ocr/lang/*`, the asset script asserts the file is really gzip,
  and both halves were verified by reading response headers rather than trusting the extension.
  Local `vite preview` gzips the same way, so this was observable before deploy.
- **`vercel.json` may not contain comments, and that cost a failed deploy.** The file used `//` and
  `//2` keys as JSON comments — an idiom every local tool ignores — and Vercel rejected it with
  _"should NOT have additional property `//`"_, reporting one bad property at a time. **Nothing in the
  repository validated that file**, so the problem was unreachable until a real deploy, days before the
  reveal. `$schema` was removed at the same time: not known-invalid, but a second failure for the same
  class of reason was not worth the editor autocomplete. So **keep the reasons for these headers here
  and in `BUILD_GUIDE.md` §3, not in the file.** `src/lib/deploy-config.test.ts` now guards the
  unknown-key rule and pins the two load-bearing headers, because the file that lost its comments is
  exactly the file someone will try to comment again.
- **The vendored decoders are long-cached because they are fetched on demand.** `/pdfjs/wasm/*` and
  `/ocr/*` are immutable by name, so `max-age=31536000, immutable` is safe and is what makes her
  _second_ use of the PDF or photo tab offline-capable. They are deliberately **absent** from the
  service worker's precache — see `src/pwa.config.ts`'s `globIgnores` comment.
- **Nothing ingest-related is precached.** Zero PDF or OCR assets are in the precache, verified by
  `node scripts/report-precache.mjs`, which reads the generated manifest rather than trusting the
  config. The worker and language data are runtime-cached instead, so the
  **first** photo import needs the network and every one after it does not — which the tab says in
  words rather than leaving a spinner to look broken on a train. (The entry count is deliberately not
  restated here either: see §1 for why a count in prose is not worth keeping.)

Not copied, and why: `cmaps/` (169 files, ~1.4 MB, CJK-only) and PDF.js's standard-font data. Text
extraction works without the latter — only glyph rendering degrades, and PDF.js logs a
`standardFontDataUrl` warning. If a PDF ever reads as boxes, copy those directories lazily rather
than adding them to the precache.

**The ingest draft survives a reload via `sessionStorage`**, one versioned key
(`studybao.ingest.draft.v1`), and deliberately **not** a Dexie table — the unreviewed remainder of a
batch does not justify a schema change. What it does not survive, and what the code and the screen
both say: a browser or Home Screen app restart, iOS private browsing, an ITP eviction, or a different
tab. There is a stated size ceiling (`DRAFT_SIZE_CEILING_BYTES`, measured **before** writing, in
`features/ingest/lib/draft-storage.ts`); above it nothing is written and the batch is held in memory
for the tab instead, with a message that says what is actually still safe — everything she already
accepted is durable in `cards`, so only the unreviewed remainder is at stake.

**What Workflow B deliberately left open is in
[`docs/WORKFLOW-B-REMAINING.md`](WORKFLOW-B-REMAINING.md)** — read it alongside this file. Two items
remain, both deferred to Workflow S by design: the `recordReview` whole-record write, and the
union-only merge rule for `ReviewLog`. Neither blocks anything. The third —
**promoting `useDatabaseValue` out of the flashcards feature — was done in Workflow C**, because
ingest is the third consumer and the standing instruction was to promote it, not copy it. It now lives
at [`src/lib/use-database-value.ts`](../src/lib/use-database-value.ts), with `notifyDataChanged` still
exported alongside it.

The plan of record is [`docs/BUILD_GUIDE.md`](BUILD_GUIDE.md). Its §4 has the workflow DAG with live
status. Everything in it is deliberate; where you think it is wrong, see §7 before changing it.

---

## 2. How the work got here

Worth knowing, because it explains why several decisions look "already settled" and prevents
re-litigating them.

1. The original build guide (written by the owner, before any code) was reviewed line by line. **Six
   blocking flaws** were found. They are still documented with their reasoning in
   [`docs/CRITIQUE.md`](CRITIQUE.md), which is a _dated review_ and is left intact on purpose.
2. The official PRC exam program was obtained and parsed, replacing a guess about the subject taxonomy
   with the real one. See [`docs/reference/pnle-scope.md`](reference/pnle-scope.md).
3. Several decisions **reversed** as facts came in — particularly the notification and installation
   strategy, which changed twice. The reversals are recorded inline in `DECISIONS.md` rather than
   quietly overwritten, so the reasoning is auditable.
4. Then Workflow A was built.

**Implication for you:** if a decision looks odd, it is probably load-bearing and was reached after a
correction. Check the linked ADR before "improving" it.

---

## 3. What exists in the code

```
src/
├── main.tsx                  # entry; applies the theme before first paint
├── App.tsx                   # providers: Toast → BrowserRouter → routes
├── router.tsx                # 9 lazy routes + a real not-found state
├── pwa.config.ts             # manifest + Workbox config (imported by vite.config.ts)
├── styles/theme.css          # ★ ALL design tokens. The only place colours exist.
├── lib/
│   ├── cn.ts                 # className merge (tailwind-merge)
│   ├── logger.ts             # the only place that touches console
│   ├── theme.ts              # pure theme resolution — testable without a DOM
│   ├── theme-store.ts        # tiny external store; useTheme()
│   ├── time.ts               # MS_PER_MINUTE / HOUR / DAY. No bare magic numbers.
│   ├── study-day.ts          # ★ THE 04:00 study-day boundary. Single implementation.
│   └── backup-format.ts      # ★ THE backup envelope: format version, the table list, validation
├── db/                       # ★ the only layer allowed to import dexie
│   ├── types.ts              # Deck, Card, ReviewLog, AppSettings, Grade
│   ├── schema.ts             # Dexie version 1 + the lazily-opened singleton
│   ├── seed-data.ts          # the five PRC parts, verbatim from the reference file
│   ├── migrations.test.ts    # schema + seeding tests
│   └── repositories/         # decks · cards · review-logs · settings · sessions · lessons · backup
├── components/
│   ├── icons.tsx             # inline SVG, no icon dependency
│   ├── layout/app-shell.tsx  # header + nav + skip link
│   └── ui/                   # Button, Card, Input, Modal, Tag, ProgressBar, Toast, EmptyState
├── features/
│   ├── dashboard/            # page + view, placeholder zeroes
│   ├── flashcards/           # ★ Workflow B — lib/ hooks/ components/ pages/ types.ts
│   ├── ingest/               # ★ Workflow C — lib/ hooks/ components/ pages/ types.ts
│   ├── timer/                # ★ Workflow D — lib/ (timer, cue, format) hooks/ components/ pages/
│   ├── tracker/              # ★ Workflow E — lib/ hooks/ components/ pages/ + types.ts
│   └── settings/             # theme, exam date, cram threshold, timer lengths, backup + restore
└── test/                     # setup.ts (jsdom shims + DB reset) and render.tsx
```

`src/db/` is at **Dexie version 3** with six tables (`decks`, `cards`, `reviewLogs`, `settings`,
`sessions`, `lessons`) and seven repositories: `decks`, `cards`, `review-logs`, `settings`, `sessions`,
`lessons`, `backup`.

`src/db/repositories/backup.ts` is the only repository that reads or writes all six tables at once,
which is what a backup is: export in one read transaction (so a file cannot hold a card with no log
row), import as **one `rw` transaction** across every table. Its companion `src/lib/backup-format.ts`
holds the format version, the table list and the validation, and it is pure on purpose — it must not
import the Dexie schema, so the settings singleton's id is duplicated there and
`src/db/repositories/backup.test.ts` asserts the two agree **and** that the table list covers every
table the schema declares. **A new table that is not added there fails the suite** rather than shipping
a backup that silently omits it.

`src/lib/use-database-value.ts` is the shared cross-screen refresh signal, promoted out of
`flashcards/` in Workflow C when ingest became its third consumer. **Do not copy it** — two copies
would mean two screens disagreeing about what is current. Note the contract in its doc comment: `load`
must be stable (wrap it in `useCallback`), or the effect cancels and restarts its own read forever and
`loading` never becomes `false`. That mistake was made once during Workflow C and cost an afternoon.

`src/lib/api-client.ts` is the only place the app may call `fetch` directly, because `eslint.config.js`
bans a bare `fetch` outside `src/lib/` and that message used to name a file that **did not exist**.
Nothing calls it yet — Workflow S is the intended consumer. Note what it deliberately is not: Firestore
goes through the Firebase SDK, not through this.

Root config: `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `prettier.config.mjs`,
`tsconfig.json`, `vercel.json`, `.github/workflows/ci.yml`. `scripts/` holds the icon generator, the two
vendored-asset copiers, the OCR language vendorer, and three PDF/precache checks.

**Everything except the dashboard is wired to real data.** Five seeded PRC decks with real SM-2 review
and cram mode; a three-path ingest pipeline (paste, PDF, photo OCR); a working Pomodoro timer that logs
every block; and a lesson tracker with her real study plan in it. Flashcards, the timer, ingest and the
tracker are usable today. The dashboard screen is still a deliberate empty state — that is Workflow F.

### Architecture rules that are enforced, not just written down

`eslint.config.js` fails the build on: `any`, `console.*` outside `src/lib/logger.ts`, importing
`dexie` anywhere **except `src/db/`**, importing `firebase/*` anywhere outside `src/sync/`, and raw
`fetch()` in feature code. Each error message names the fix. **Do not weaken these to make a change
compile** — if a rule is genuinely wrong, change the rule deliberately and say why.

The `dexie` rule previously also blocked `src/db/` itself, which made the rule unsatisfiable; that was
fixed in Workflow B with a single documented carve-out for that directory. The message now points
feature code at `src/db/repositories/`.

### The three-layer page pattern

Every feature is `pages/{name}.page.tsx` (Layer 1, thin), `hooks/` (Layer 2, aggregation), and
`components/{name}-view.tsx` (Layer 3, pure JSX with typed props, no hooks, no data access). The
current views take props like `deckCount` so they are already testable; Layer 2 gets filled in when the
data exists. See `CLAUDE.md` for the full statement.

---

## 4. How to verify the project is healthy

```bash
npm install                    # must succeed. Also works: npm ci (what CI runs)
npm run typecheck
npm run lint:check
npx prettier --check .
npm run test:coverage
npm run build && npm run preview   # dev does NOT run the service worker
```

All six must be green before you hand anything back. `.github/workflows/ci.yml` runs the same set, plus
an assertion that `dist/sw.js` and `dist/manifest.webmanifest` exist — because a missing service worker
silently stops the app being installable, which on her iPad means it can lose data.

**Standing state as of the Workflow E working tree (uncommitted):** all six were run and passed, with the
numbers and the per-check detail in §1. If you re-run them and something differs, that is a finding about
the tree, not about this paragraph.

### Environment gotchas that cost real time

- **Vitest is pinned to v3 deliberately.** Vitest 4/5 declare `@vitest/browser-playwright` and
  `@vitest/browser-webdriverio` as optional peers and **npm 10 crashes** resolving them
  (`Cannot read properties of null (reading 'edgesOut')`). A lockfile produced with
  `--legacy-peer-deps` then **fails `npm ci`**, which is what CI runs — so that workaround is a trap.
  Verify _both_ `npm install` and `npm ci` before changing any test dependency.
- **TypeScript stays on 5.x** while `typescript-eslint` caps its peer at `<6.1.0`.
- **ESLint is 10**; the 9.x line is past its support window.
- **esbuild needs to spawn its transform service.** In a sandbox that blocks piped child processes,
  `vitest` and `vite build` fail with `spawn EPERM`. That is the sandbox, not the project.
- **In a confined sandbox a child process cannot write _any_ workspace file, even though the agent's own
  file tools can.** Workflow E hit this as `prettier --write` failing with `EPERM` on exactly the files it
  wanted to change, while `typecheck` and `lint:check` were fine. It is worth naming because it looks like
  a per-file permissions problem and is not: a one-line probe (`node -e "require('fs').writeFileSync(...)"`)
  reproduced it for a file that did not exist, and the file attributes were ordinary. The repair is to run
  the write with wider access, or to apply the formatter's own output through the file tools — not to
  touch permissions. The `diagnose-windows-sandbox-acl` skill is for the other case, where a specific
  object's ACL really is wrong; it does not apply to this one.
- The npm cache may need to be workspace-local (`--cache ./.npm-cache`) where the global cache is not
  writable. It is gitignored.
- **jsdom does not implement `HTMLDialogElement.showModal`.** `src/test/setup.ts` shims it, and the
  Modal tests dispatch `cancel` directly. Do not "fix" this by replacing native `<dialog>` with a div —
  the platform behaviour is the reason it was chosen. **The consequence for tests, measured rather than
  assumed:** `Modal` keeps its children _and its `footer`_ mounted while closed, and **role queries and
  text queries disagree about it.** `getByRole` respects accessibility and the `display: none` a closed
  dialog carries, so it finds **nothing** inside a closed dialog; `getByText` and `findByText` **do**
  find the nodes. That asymmetry caused a real flake: a synchronous role query landing in the frame
  between "counts rendered" and `showModal()` fails, and it passes a millisecond later. So **wait for the
  `open` attribute before any role query inside the dialog**, and prefer asserting the _effect_ —
  "nothing was written until the confirm was pressed" — because a query for the dialog's copy, by text,
  passes whether or not it is open. Measured on jsdom 30 with Testing Library; see
  `src/features/settings/components/backup-card.tsx`.
- **`window.localStorage` hands back a _new_ `Storage` instance on every access in jsdom**, so
  `window.localStorage.getItem = fn` does not affect the code under test. Patch
  `Storage.prototype.getItem` with `vi.spyOn` instead. The old form made `theme.test.ts` pass or fail
  depending on file order — it was found by running the suite with `--sequence.shuffle`.
- **The test database is reset in the global `afterEach`** (`src/test/setup.ts` →
  `resetDatabaseForTestsIfUsed`), which wipes **and re-seeds**, so every test starts from the state a
  first launch produces. It is a no-op for tests that never touch IndexedDB. If you add a test that
  writes cards or decks, do not clean up manually — it is already handled.
- **Run the suite with `--sequence.shuffle` occasionally.** It is how the localStorage leak above was
  caught, and the DB reset exists so that shuffling stays green. A failure only under shuffle is a
  real isolation bug, not a flaky test.

**Sandbox note (this machine).** `npm install`, `vitest`, `vite build` and `vite preview` all need to
spawn child processes, which the default file sandbox blocks with `spawn EPERM`; they were run here
with wider access. `npm ci` also fails on its `prepare` script for the same reason — the lockfile is
fine (`npm ci --ignore-scripts` succeeds). This is the environment, not the project.

---

## 5. Every decision, and where it lives

Full register with reasoning and reversal history: [`docs/DECISIONS.md`](DECISIONS.md). This is the
index.

### Product and architecture (all closed)

| #   | Decision      | Outcome                                                                                                                      |
| --- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| D1  | Push backend  | **None.** Notifications are in-app only. See [ADR 0006](adr/0006-in-app-notifications-only.md).                              |
| D1b | Cloud sync    | **Yes** — she uses two devices. Firestore, server-free, client-direct. Workflow S.                                           |
| D2  | Auth          | **Google Sign-In**, one allow-listed email. Required only by sync. [ADR 0005](adr/0005-auth-google-single-user.md)           |
| D3  | Exam date     | **Fri 26 Feb 2027.** Drove the build ordering in `BUILD_GUIDE.md` §9.                                                        |
| D4  | Hosting       | **Vercel**, static, unlisted + `noindex`.                                                                                    |
| D5  | Installation  | **Prompt Share → Add to Home Screen on iPadOS.** Changed twice; final in [ADR 0008](adr/0008-add-to-home-screen-on-ipad.md). |
| D6  | Does she know | **No — it is a surprise.** So the reveal is a deliverable (`BUILD_GUIDE.md` §9.5).                                           |
| D7  | Deck taxonomy | **Five PRC Nursing Practice parts**, verified from the primary source.                                                       |
| D12 | Sync default  | **ON**, per write. You overrode my recommendation; you were right.                                                           |

### The ADRs — six in force, two superseded

| ADR                                                  | Decision                                                | Status                                             |
| ---------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| [0001](adr/0001-local-first-with-indexeddb.md)       | IndexedDB is the source of truth; Firestore syncs to it | Accepted                                           |
| [0002](adr/0002-push-architecture-and-scheduler.md)  | Pre-schedule-then-cancel push with our own cron         | **Superseded by 0006** — kept as the path back     |
| [0003](adr/0003-sm2-scheduler-and-learning-steps.md) | SM-2 + sub-day learning steps, epoch-ms, `ReviewLog`    | Accepted                                           |
| [0004](adr/0004-no-llm-in-runtime.md)                | No LLM in the shipped product                           | Accepted                                           |
| [0005](adr/0005-auth-google-single-user.md)          | Google Sign-In, one email                               | Accepted                                           |
| [0006](adr/0006-in-app-notifications-only.md)        | In-app notifications only: no backend, no push          | Accepted                                           |
| [0007](adr/0007-browser-only-no-install.md)          | Browser-only, no install                                | **Superseded by 0008** — kept for the ITP analysis |
| [0008](adr/0008-add-to-home-screen-on-ipad.md)       | Add to Home Screen on iPad (not an app install)         | Accepted                                           |

### Decisions I made during the build that were not in any plan

- **Tailwind v4, CSS-first.** There is no `tailwind.config.ts`; tokens live only in the `@theme` block
  of `src/styles/theme.css`. This is _better_ than the plan, which assumed a config file and therefore
  two places to drift.
- **`tailwind-merge` is a dependency**, not a nicety: without it, `cn('bg-primary', 'bg-sage')` emits
  both classes and CSS generation order decides the winner, making every `className` override
  unpredictable.
- **`react-router-dom` v7** with lazy routes; `vercel.json` carries the SPA rewrite deep links need.
- **The night theme is implemented** even though D9 is unanswered. The token _structure_ is the
  expensive part to retrofit; removing it later is about ten lines plus a toggle.
- **Icons are generated** (`npm run icons`) from the same geometry as the vector favicon, using only
  Node built-ins — reproducible rather than opaque binaries.
- **ESLint 10 rather than 9**, after npm flagged 9.x as out of support.
- **Deliberately omitted**: no component library, no feature flags, no settings framework, no icon
  package. All would be pure overhead for one user.

### Decisions made during Workflow B (full reasoning in `BUILD_GUIDE.md` §4)

- **`dexie` + `fake-indexeddb` are the only dependencies added**, both MIT, neither with a network call.
  `fake-indexeddb` is dev-only and is what lets the repositories and the seed be tested against a real
  IndexedDB rather than a mock.
- **`repetitions` counts graduated reviews only**; the learning steps do not increment it. This is what
  makes the Workflow B definition of done ("Good four times → ~15 days") true, and there is a test whose
  name says so.
- **A lapse zeroes `intervalDays`**, and mastery is `learningStep === null && intervalDays >= 21`.
  Keeping a stale 38-day interval would have reported a just-failed card as mature.
- **Hard repeats the current learning step; Good advances one; Easy graduates immediately from any
  step.** Easy's reward is the ease factor, deliberately not a longer interval. Easy and Good must
  diverge on a _fresh_ card or the fourth button is arbitrary — that is asserted directly.
- **A new card is due immediately** (`nextReview = now`), and `resetCardProgress` agrees with it. The
  learning step decides when a card comes back after a review, not whether she may review it now.
- **Day-scale intervals snap to the 04:00 study day**, as _calendar_ days from that boundary — not
  `boundary + n × 86_400_000`, which lands an hour early or late across a DST transition.
  `src/lib/study-day.dst.test.ts` pins a DST zone; the main study-day test file covers what holds in any
  zone.
- **The review session freezes its membership but chooses the next card against the clock.** Deciding
  "is it due again?" at grade time cannot work, because `schedule` guarantees `nextReview > now` — the
  check is always false and a 1-minute learning step never arrives. This was a real defect, found in
  review, and it is now covered by a test that fails without the fix.
- **The review session is a route**, not mode state, so a mid-session refresh resumes instead of losing
  the session.
- **One `useDatabaseValue` subscription** drives every data-backed hook, so a write on one screen updates
  the others. Deliberately not `dexie-react-hooks` (a dependency for one behaviour) and deliberately not
  Zustand (mirroring Dexie into a store is exactly the staleness it prevents). Promote it out of
  `flashcards/` when a third feature needs it — do not copy it.
- **`ReviewLog` is append-only**, so it has no `updatedAt`/`deletedAt`; `CLAUDE.md` and
  `change-data-model.md` were corrected to say "every _mutable_ synced record" with this as the named
  exception.

### Decisions made during Workflow C (full reasoning in `BUILD_GUIDE.md` §4)

- **The parser reports provenance**, which is what makes its one invariant assertable: every normalized
  input line belongs to exactly one card's span or to the leftover queue, never two, never none.
  `assertProvenance` enforces it at runtime, so a future rule that drops or double-claims a line throws
  instead of returning a plausible array. The original brief stated this as a line **count**, which was
  wrong twice: it forbade joining a wrapped line, and it passed when one line was dropped and another
  counted twice.
- **Joining runs after the card patterns, never before** — a line matching a card-start pattern starts a
  card and is never joined, even when lowercase. The single exception is a word hyphenated across a line
  break, where the trailing hyphen is the evidence.
- **"Does this line start a card?" is answered in exactly one function.** It was answered in two places
  at first, and the second one ran after the join check — so bare `term: definition` lines had no anchor
  and were glued onto the line above, losing the term into the previous definition. A fixture caught it.
- **A rejected separator line is an anchor, not a continuation.** `"Note: she reported: pain"` was being
  appended to the card above it, producing an answer that read `"ascorbic acid Note: she reported:
pain"` — a card saying something her notes do not say.
- **The ingest draft lives in sessionStorage, not Dexie.** The unreviewed remainder of a batch does not
  justify a schema change, and its limits are stated on screen rather than implied.
- **`useDatabaseValue` was promoted to `src/lib/`**, as the runbook instructed once a third feature
  needed it — a move, not a copy, and not into `src/db/`, which holds the schema and repositories.

### Decisions made during Workflow D

- **A session row is written twice per block**, at Start and at the end. Write-once-at-the-end would mean
  a block interrupted by a closed tab leaves nothing, and on an iPad closing the tab is normal with no
  server to notice (ADR 0006). `endedAt` therefore means the _planned_ end until `completed` is true,
  which is how an abandoned row is recognised.
- **`Session` is a mutable record**, so unlike `ReviewLog` it carries `updatedAt` and `deletedAt`. It is
  not the append-only exception, and adding those fields after sync exists would have been a migration on
  a device with no undo.
- **Remaining time is a subtraction, never a countdown.** The 1-second interval only triggers a repaint.
  iOS suspends timers in a backgrounded tab, so a counter would be wrong by exactly the time she was away
  — the situation she is actually in.
- **`cyclesCompleted` counts completed work blocks only.** Four presses of Start are not four blocks of
  focus, and a skipped block must not earn a long break.
- **The audio context is created inside the first press**, because a context created at load starts
  `suspended` and the first cue would be silent.
- **The Dexie v2 upgrade is intentionally empty.** It adds a table and transforms no row, so a retried
  migration cannot corrupt anything. The new `settings` timer fields are all optional, so a Workflow B
  row reads back unchanged — absent means "use the default", never "zero minutes".

### Decisions made during Workflow E

- **`Lesson.deadline` is optional** (`BUILD_GUIDE.md` §6 amended before implementation, not after). A
  required date makes her invent one for every unplanned topic, and an invented date is a wrong number:
  it sorts into "overdue" and shows for a deadline she never meant. Undated lessons gather in "No date
  yet", placed last.
- **Statuses are stored as stable keys**, with the labels in `features/tracker/lib/status.ts`. That
  designs the "filter that ignores a case" bug class out rather than testing for it, and a copy change
  costs no migration.
- **Mastered is excluded from the default view entirely**, and `isOverdue` refuses to call a mastered
  lesson late. A finished topic rendering as outstanding is the guilt framing the voice rules forbid.
- **Overdue goes through `studyDaysBetween`, never `deadline < Date.now()`** — the deadline is anchored
  at 04:00, so the naive comparison marks every lesson late from 04:00 on the day it is due.
- **A lesson's subject label resolves from `PRC_PARTS`, never the `decks` table.** Decks are
  soft-deletable; a label resolved through them would become unreadable because of an unrelated
  deletion, on a screen with no way to fix it. `schema.ts` re-exports `PRC_PARTS`, `prcPartOrder` and
  `prcPartName`, matching how `INTEGRATED_KNOWLEDGE_AREAS` is already shared.
- **The date helpers moved to `src/lib/study-day.ts`** as `studyDayMsFromDateInput` /
  `dateInputFromStudyDayMs`, with their tests, because the tracker and Settings must not hold two ideas
  of which day "the 3rd" is. A move, not a copy, like `useDatabaseValue` in Workflow C.
- **Every chip and every section has its own empty state**, and the list always renders all four date
  sections. A blank region where a section used to be is indistinguishable from a broken screen.
- **The filter lives in `?status=`** (written with `replace`), matching the ingest tab, so a refresh or
  an iPad tab restore does not move her.
- **The calendar grid and the schedule-photo import were not built**, both deliberately and with the
  reasoning recorded in `BUILD_GUIDE.md` §1 and §4. The grid's cells are calendar days, which fights the
  04:00 rule; a parsed schedule feeds the highest-consequence field with the least reliable input.
- **`lessons` carries only the `updatedAt`/`deletedAt` sync indexes.** No `status` or `deadline` index:
  there is no query behind either, and the list is tens of rows loaded whole and grouped in memory.

### Open, with working defaults

D8 notification cadence and quiet hours · D9 night mode: keep or cut · D10 font (Quicksand chosen) ·
D11 icon/mascot direction · D13 backup behaviour. **None blocks anything.**

---

## 6. Things that are true and easy to forget

These are the sharp edges. Each has cost time or would have.

- **Nothing fires while the app is closed.** No push, no server, no service-worker `push` handler. If
  she closes the tab mid-Pomodoro, the session-end cue never arrives. The timer screen says so
  explicitly. There is no client-side scheduled-notification API to fall back on — Chrome abandoned it.
- **All iPad browsers are WebKit**, so switching browsers does **not** avoid ITP's 7-day storage
  deletion. Only a Home Screen Web App is exempt, which is why we prompt for it.
- **`navigator.storage.persist()` does not exempt an origin against ITP.** WebKit rejected the PR that
  would have made it. Do not add it as a mitigation.
- **Her data can vanish at any time.** Design every screen to survive the local database being deleted:
  empty IndexedDB plus remote data means restore **silently**, never with empty-state onboarding that
  reads as data loss.
- **`ReviewLog`, `lapses`, `updatedAt`, `deletedAt`, `Session.tabHiddenCount` and epoch-ms timestamps
  are non-backfillable.** You cannot reconstruct _when_ something happened, or whether the tab was
  hidden, after the fact. This is the one-way class of decision — see §7.
- **A `.gz` must not be served with `Content-Encoding: gzip`.** The browser decodes it transparently and
  the library — tesseract.js, here — then fails on the inner payload. `vercel.json` pins
  `Content-Encoding: identity` for `/ocr/lang/*`. Found by reading response headers, not by assuming.
  **Re-confirmed while verifying Workflow E:** local `vite preview` still serves
  `/ocr/lang/eng.traineddata.gz` with `Content-Encoding: gzip` (the 4.1 MB of raw data arriving decoded),
  which is the expected local behaviour and is exactly why the deploy header exists — the fix lives in
  `vercel.json`, not in the build. Re-read that file before concluding the photo tab is broken locally.
- **`globPatterns` in `src/pwa.config.ts` is an allowlist of _extensions_**, so an asset is excluded only
  by accident of its suffix. That is how a lazy PDF chunk and 600 KB of `*_nowasm_fallback.js` files
  re-entered the precache. Anything heavy and on-demand belongs in `globIgnores` by name, and the result
  is checked with `node scripts/report-precache.mjs`, which reads the generated manifest rather than the
  config.
- **`useDatabaseValue`'s `load` must be stable.** An inline arrow is a new function every render, so the
  effect cancels and restarts its own read forever and `loading` never becomes `false`. Wrap it in
  `useCallback`. This was made once in Workflow C and cost an afternoon.
- **There are two "days until" notions and they are not interchangeable.** `daysUntilExam`
  (`src/db/repositories/settings.ts`) is a whole-24-hour `ceil` against a date fixed in the world, which
  is what makes the day before the exam read 1. A lesson deadline, a streak and every day-scale interval
  go through `studyDaysBetween` in `src/lib/study-day.ts`, which rolls at 04:00. Substituting one for the
  other is silent in both directions: the exam countdown would move at 04:00, and every lesson would be
  marked late from 04:00 on the day it is due. Both functions carry a doc comment saying which is which.
- **A deadline is anchored at the 04:00 study-day start, and `deadline` is optional.** A lesson with no
  date is a normal lesson in the "No date yet" section, not a late one — and a mastered lesson is never
  overdue whatever its date says.
- **A lesson's subject is a `PrcPart` key whose label comes from `PRC_PARTS`.** Never resolve it through
  the `decks` table: decks are soft-deletable, so deleting one would make a lesson's subject unreadable
  on another screen, with nothing she could do about it.
- **PRC publishes no item weights.** Do not build any "this topic is worth X%" UI. Her own review data
  is the only honest signal, and a fabricated percentage would misallocate her study time.
- **The PRC program should be re-verified around December 2026.** The Feb 2026 program was approved
  2025-12-01 for a 2026-02-26 exam, an 87-day lead, so the Feb 2027 program is expected around early
  December 2026. Checklist in [`reference/pnle-scope.md`](reference/pnle-scope.md).
- **`docs/CRITIQUE.md` is a dated review**, not the current plan. It describes the original guide and
  the corrections, with inline "superseded" notes. Do not treat its recommendations as live.

---

## 7. What is actually one-way

Reversal cost, assuming months of her real data:

| Decision                                           | Reverse now | Reverse later                            | Why                                                                                           |
| -------------------------------------------------- | ----------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| **ADR 0003** — SM-2 + learning steps + `ReviewLog` | free        | **brutal**                               | Cannot be backfilled. Miss the history and FSRS is impossible without starting over.          |
| **ADR 0001** — local-first                         | free        | expensive                                | Every feature's data layer assumes reads never fail.                                          |
| **ADR 0005** — auth provider                       | free        | moderate                                 | Changing the _email_ is trivial; changing the _provider_ re-keys every synced document.       |
| **ADR 0006** — in-app only                         | free        | cheap, by design                         | ADR 0002 is the preserved path back.                                                          |
| **ADR 0004** — no LLM                              | free        | cheap technically, costly in consequence | Adding it later is additive, but it ends the offline guarantee and risks invented flashcards. |

**Conclusion:** the decisions worth being careful about are the ones that _record history_. Everything
else is refactoring, and there were 22 weeks of runway as of Sept 2026.

---

## 8. What to do next

**Workflows A, B, C, D and E are done.** The app is usable today for its whole core loop: notes become
cards (ingest), cards are reviewed with real SM-2 scheduling (flashcards), study blocks are timed and
logged (timer), and her plan for what to study next lives in the tracker. What is missing is the
_presentation_ of that history (F), the second device (S), the nudges (G) — and **her only backup that
does not depend on Google, the network, or a sync bug**, which is next.

**As of 2026-10-07 the exam is 142 days away (~20 weeks).** `BUILD_GUIDE.md` §9.2's weeks 4–8 window was
"C (ingest), then D, then E (tracker)", and all three are done, so **the weeks 4–8 window is complete.**
The project is on schedule.

### First, and not from the plan: the ingest parser mangles real notes

The parser was fitness-tested against two real board-review PDFs — the first time it has seen her
actual material. **It over-joins badly.** `docs/ai/write-tests.md` case 7 permitted a join on the
_absence_ of a signal ("or the previous line does not end a sentence"), and 91% of her lines lack
terminal punctuation because they are note fragments rather than prose, so the clause was effectively
always on. It fired 1,483 times, 60% of all joins, and merged unrelated sections into single cards:
523 cards with only **402 distinct fronts**, 88 carrying a mid-text ALL-CAPS heading, 27 becoming the
running page header, and one spanning **109 source lines**.

**That is a defect in shipped code, so it outranks everything below.** The spec is corrected; the join
rule is not. Measurements, the seven ranked findings, what could not be tested, and the proposed order
are in [`docs/INGEST-FITNESS-RESULTS.md`](INGEST-FITNESS-RESULTS.md), and
**[`docs/INGEST-JOIN-FIX.md`](INGEST-JOIN-FIX.md) is the brief for the fix.** Note what that brief
requires: the fix is judged by **re-running the fitness measurement**, not by unit tests, because the
unit suite was green the entire time the parser was mangling her real notes. The harness is to be
committed as `scripts/ingest-fitness.mjs` this time, taking file paths as arguments so no third-party
content enters the repository.

The same test surfaced one thing that is **not** a bug and is now **decided** (D14 in
[`docs/DECISIONS.md`](DECISIONS.md)): **one of the two sample documents is a rasterized PDF**, so the
PDF tab yields nothing for it. **The in-app OCR fallback is DEFERRED** — because that same file, put
through Select All → Copy, returned the whole 19 pages as text, and the output proves the reader was
running **Live Text OCR**, not reading a text layer: the same watermark reads `Marbie Jade` on one line
and `Marble Jade` on another, and the body carries recognition errors (`four` → `tour`, `feet` → `teet`).
A text layer cannot render one watermark a dozen ways.

So the app's existing copy — "use Live Text and paste into the first tab" — is **already the correct
instruction, costs nothing, and uses a better OCR than Tesseract**. Building ours would redo it worse and
more slowly.

**And that test has now been run, which splits the answer by device.** On the **iPad**, Select All → Copy
gives the whole document, so it is solved with no code. On the **Windows laptop**, nothing comes out —
the PDF viewer has no OCR and there is no Live Text. So the laptop is the only device that needs either a
copy change or the fallback.

**But the reveal is iPad-first** — the install prompt is iPadOS-only, the Home Screen Web App is the
target, and the laptop is a plain tab — so a laptop-only gap is **not on the critical path** and must not
delay the reveal. `DECISIONS.md` D14 carries the three-step order: **fix the copy** (✅ **done** — the three
strings sent her to "your phone" on _every_ device, including the iPad that does not need it, and they
now name the text feature on the device she is holding; see D14 item 1), then **measure** whether this
document type produces usable cards at all, and only then consider building anything.

Two facts survive that reversal:

- **Her material is digital PDFs and screenshots and never handwriting**, which invalidates the guide's
  framing of photo OCR as a _last resort_ — §3's warning is about handwriting, and Tesseract is trained
  on printed text. The copy is to be recalibrated, including the line that sends her to "your phone".
- **Her iPad is 9th generation: A13, 3 GB of RAM.** _If_ it is ever built, a 50-page run is minutes long
  and Safari on 3 GB kills tabs, so it must **persist each page as it completes** and **show partial
  results** — otherwise a killed tab loses the whole run. Measured context: 424 MB peak for an 82 MB
  133-page PDF in Node.

**Answered, and the answer is worse than the question.** A watermark **does** land in the extracted
text — and not as a whole repeated line. Tested by selecting all and copying from a watermarked PDF, the
watermark arrives as **partial-word fragments interleaved at varying positions through the body text**:
`la@gmail.com`, `la@g`, `la @9`, `larbie J`, `bie Jade /`. So:

- **A repeated-line filter does not solve this.** That was the proposed fix and it is wrong: the fragments
  are not a consistent line, so there is nothing for a line-level rule to match. This needs a
  token-or-provenance-level approach, or acceptance that the review screen is where it gets cleaned up.
- **It produces cards, not only leftovers.** `PART 1 - la@gmail.com` and
  `PART 1 - WHAT THE PHILIPPINES ACTUALLY DIES OF` both match the **dash separator** with a short
  left-hand side, so each becomes a card whose front is a page header. A short-line or header-shaped guard
  would help.
- **The watermark carries her name and email**, so the junk cards are conspicuous rather than silent —
  better than invisible noise, still a first-impression cost.

**The same paste confirmed finding 3 is not theoretical.** Two runs on one baseline are serialised
adjacent with no separator — `overstatedprevention, not cure` is `overstated` + `prevention` glued — and a
two-column table interleaves column-wise (`unattended / So the true NCD burden is / understated, not /
The nurse's leverage / overstatedprevention, not cure`). PDF.js exposes x and y per item, so the app can
do better than the reader's own copy — but only once `contentItemsToLines` looks at x, which today it does
not.

**And a signal worth measuring rather than assuming:** that sheet is written as **prose and tables, not
`Term: Definition` pairs**, so most of it would land in the leftover queue even given perfect text. Her
two sample documents have very different shapes, so the leftover rate is **document-dependent**. The
harness should report it per document — a parser tuned on one handout is not evidence about the other.

**One contradiction to resolve before designing the fallback.** The fitness run measured BoardPal as
**zero text operators, 21 full-page images, `looksScanned: true`** — yet the paste above produced a great
deal of selectable text from a BoardPal sheet. Either that paste came from a different file in the set, or
a reader on that device supplied the text itself: iOS and macOS Preview run Live Text invisibly over
image-only pages, which would also explain interleaved fragments and glued words. This changes whether
BoardPal needs the OCR fallback at all, so **ask which file and which reader** first.

### The reveal is mid-October / early November, so it now comes first

**This reorders everything below.** A mid-October reveal gives her **~19 weeks** of spaced repetition
before the exam; the old order put it in mid-January and **~6**. §9.1 exists because the app should be
usable long before it is complete, so the reveal moves ahead of F, S and G.

Critical path, and nothing else starts before it:

1. **The parser join fix** — running now.
2. ~~**Export/import**~~ — **done.** Her only backup that does not depend on Google, the network, or a
   sync bug. See §1 for the state and the four things it had to get right.
3. **H, reveal-scoped** — the install prompt (which is what exempts her local data from ITP) and a first
   run with **no sign-in**, because S is unbuilt. `CLAUDE.md`'s UX rules describe the post-S flow.
4. ~~**The Windows-laptop copy test**~~ — **done, and it failed on the laptop while passing on the
   iPad.** A laptop-only gap, so it is **not** on this path; see D14 for the three-step order. The
   pre-reveal half was the **copy fix**, and **it is now done** — the strings name the tool on the
   device she is holding, with a property test that goes red if a phone reappears in any state.
5. **The reveal.**

**The honest costs, which are accepted rather than hidden:** no laptop sync and no dashboard until S and
F land, and a first run with no sign-in. All three are things she can be given while already using the
app, which is the same trade §9.1 already made.

### After the reveal, in this order: **S → F → G**

Each workflow still needs its own go-ahead. This is the recommendation, with the reasoning, because the
ordering has one dependency that is easy to get wrong.

#### 1. ~~E (lesson tracker)~~ — **done**

Shipped as Dexie version 3. It was the last piece of the study loop rather than an addition to it — the
app represented _cards_ and _time_ and had no representation of what she is supposed to be doing next —
and it is the last input path: C handled her notes, E handles her plan. Everything after it is
presentation or plumbing.

#### 2. ~~Export/import~~ — **done**

Her only backup that does not depend on Google, the network, or a sync bug
([ADR 0007](adr/0007-browser-only-no-install.md)), and the interim way to move cards between the iPad
and the laptop until S lands. It was deliberately its own small step rather than part of S, whose
definition of done includes calendar-time acceptance that cannot be simulated — and **S must not
re-implement it.** Import is a _transfer_ (replace everything, or write nothing), S owns the _merge_
(union-only for `ReviewLog`, newest `updatedAt` elsewhere). Two merges is the drift this repo keeps
paying for. State and evidence in §1.

#### 3. F (dashboard) — after she is using it, and specifically not before

**Because there is almost no history to aggregate yet.** F reads `ReviewLog` and `Session`, and both are
close to empty in the world: `ReviewLog` only accumulates from real reviews, and `Session` — added in
Workflow D — has never recorded a block on her device, because **she does not know the app exists** (D6).
A dashboard built now renders a streak of 1 and empty progress bars, and there is no way to tell a
correct-but-empty screen from a broken one. F wants data to look at.

#### 4. S (cloud sync) — after export/import, with two constraints to plan around

- **`ReviewLog` must merge union-only.** A last-write-wins merge on an append-only table is silent
  history loss. Named in `CLAUDE.md`, `docs/ai/change-data-model.md` and the type's own doc comment.
- **S cannot be _finished_ in one session.** Its definition of done includes "the Home Screen app is
  confirmed exempt by leaving it unopened for 8+ days" — a calendar-time acceptance test that needs her
  real device and cannot be simulated. Schedule it with that gap in mind rather than discovering it at
  the end.
- S is where the deferred `recordReview` whole-record write gets fixed (see
  [`docs/WORKFLOW-B-REMAINING.md`](WORKFLOW-B-REMAINING.md)), and where `src/lib/api-client.ts` either
  finds a use or should be reconsidered.

#### Not yet

- **G (nudges)** is _possible_ now — it needed D's session state, which exists — but §9.2 schedules it
  weeks 13–16, and it is a comfort feature. Nothing depends on it.
- **H (polish)** is last by definition, and its definition of done is a full click-through on real
  devices.
- **The reveal** (`BUILD_GUIDE.md` §9.5) is a deliverable in its own right: she does not know this exists
  (D6), so the first thirty seconds carry most of the adoption risk. Do not leave it to the end.

### A decision this section used to leave open: export/import is its own step

**Resolved: export/import is its own small step immediately after E, and explicitly not inside S.**

It was previously unassigned and the recommendation was to fold it into S. That is wrong for two
reasons:

- **It is the only backup that does not depend on Google, the network, or a sync bug**
  ([ADR 0007](adr/0007-browser-only-no-install.md)). S's own definition of done includes leaving the
  Home Screen app unopened for 8+ days — calendar-time acceptance that cannot be simulated — so S
  cannot be _finished_ in one session. Bundling her only safety net into the slowest workflow in the
  plan delays it for no reason.
- **It is also the interim multi-device story.** She uses an iPad and a Windows laptop. Until S lands,
  export/import is how cards move between them, which makes it load-bearing rather than a nice extra.

The Settings screen carries **Save a backup** and **Restore a backup**, both live; see §1 for what they
do and what they deliberately do not.

### A recommended change to the order, which needs your go-ahead

The recommended order above is export/import → F → S, following §9.2's budget. **Consider
export/import → H (reveal-scoped) → reveal, with F, S and G afterwards, while she is already using the
app.**

- **F wants data that does not exist yet.** It reads `ReviewLog` and `Session`, and both are near-empty
  in the world: `ReviewLog` only accumulates from real reviews, and `sessions` has never recorded a
  block on her device because she does not know the app exists (D6). A dashboard built first renders a
  streak of 1 and empty bars, and a correct-but-empty screen cannot be told from a broken one. This
  section already says so — the conclusion is just that F belongs _after_ she starts using it, not
  before.
- **The reveal is a deliverable, and this section already warns against leaving it to the end.** Under
  the current budget it cannot happen until mid-January, which costs roughly six weeks of spaced
  repetition. §9.1's own argument is that the app must be usable long before it is complete.
- Revealing earlier is safe on data: export covers loss without an account, and H's install prompt is
  what exempts her local database from WebKit's 7-day deletion ([ADR 0008](adr/0008-add-to-home-screen-on-ipad.md)).

**This is a recommendation rather than a decision because the timing of a gift is not purely an
engineering question** — whether December is a good moment to hand it to her is yours. Either way
**export/import is next**, so this does not block the next step; `BUILD_GUIDE.md` §9.2 carries the same
note.

### Read first for any workflow

[`docs/ai/README.md`](ai/README.md) → the matching runbook → [`docs/BUILD_GUIDE.md`](BUILD_GUIDE.md) §4
for that workflow and §6 for the model and contracts.

### What E leaves you, concretely

- `src/db/` — **Dexie version 3**, six tables, seven repositories. **Any further change needs a version
  bump and a tested migration**; `src/db/migrations.test.ts` carries two tests to copy — a v1 → current
  walk and a v2 → v3 test — including the trick of building the old database from a **bare `Dexie`** so
  opening it does not run the migration under test. **Add every new table to the enumerated list in
  `clearDatabaseForTests`** (which exists because `sessions` was missed there once) **and to
  `BACKUP_TABLES` in `src/lib/backup-format.ts`** — the second has a test that fails if you forget, so a
  backup cannot silently omit her data.
- `src/features/tracker/lib/deadline.ts` — the deadline rules, pure and clock-injected: overdue-ness,
  the four sections, the sort order and the date labels. The rules are here, not in the hook or the
  view; keep it that way.
- `src/features/tracker/lib/status.ts` — the status vocabulary and the chips, with the stored keys and
  the labels deliberately in different places.
- `src/lib/study-day.ts` — the single 04:00 boundary **and** the date-input ↔ epoch-ms conversion that
  Settings and the tracker both use. F's streak must call it, never reimplement it.
- `src/db/repositories/lessons.ts` — the tombstone rules for her plan, and the two optional fields that
  are _removed_ rather than blanked when she clears them.

### What export/import leaves you, concretely

- `src/lib/backup-format.ts` — the envelope: `BACKUP_FORMAT_VERSION` (**1**), `BACKUP_TABLES`,
  `parseBackup` (pure, returns refusal **codes**, never prose), `withSeededMarker`, `countRows`.
- `src/db/repositories/backup.ts` — `listTableCounts`, `exportBackup` (one read transaction) and
  `importBackup` (**takes the file's text and re-parses it**, so what the dialog showed and what is
  written are one reading; clears and rewrites all six tables in one `rw` transaction).
- `src/features/settings/` — `hooks/use-backup.ts` (the state machine, `busy`, the hidden file input),
  `lib/backup-messages.ts` (every string, one place), `lib/backup-file.ts` (the filename and the
  download), `components/backup-card.tsx` (the card + confirmation dialog).
- **Two behaviours that are load-bearing and easy to "fix" away:** the file input is cleared after every
  pick (otherwise choosing the same refused file twice fires no `change` event and the button looks
  broken), and `savedFirst` keeps the "that file is your way back" note in the dialog after the toast
  has gone.
- **In tests:** `URL.revokeObjectURL` is deferred by a timer on purpose; the download test therefore
  fakes timers and runs the pending one in `afterEach`, because on real timers the callback fires after
  the stub is removed and throws into an unrelated file's run.

### The contracts that must not be improvised

**SM-2.** Grades map Again=0, Hard=3, Good=4, Easy=5. Ease factor updates on _every_ grade **and is
floored at 1.3**. `q < 3` resets repetitions, zeroes the interval, records a lapse, and re-enters sub-day
learning steps (1 min → 10 min) — it does **not** jump to one day. Mastery is
`learningStep === null && intervalDays >= 21`, not a repetition count. Full statement in
`BUILD_GUIDE.md` §6 and [ADR 0003](adr/0003-sm2-scheduler-and-learning-steps.md).

**Deck seeds:** the five PRC Nursing Practice parts, verbatim from
[`reference/pnle-scope.md`](reference/pnle-scope.md). The integrated knowledge areas (pharmacology,
pathophysiology, A&P, nutrition, parasitology/microbiology) are **tags, not decks**.

**The parser's invariant.** Every normalized input line belongs to exactly one card's span or to the
leftover queue. `assertProvenance` enforces it at runtime — do not weaken it to accommodate a new
pattern; that is the mechanism that stops a dropped line becoming a card she never reviews.

**Lesson deadlines and statuses.** A deadline is the 04:00 study-day start of the day she means, and
overdue-ness is `studyDaysBetween(deadline, now) < 0` — never `deadline < Date.now()`, which marks every
lesson late from 04:00 on the day it is due. A mastered lesson is never overdue and is out of the default
view entirely. Statuses are compared as the stored keys, never as the labels she reads.

**The backup's two contracts.** (1) **Import replaces; it never merges.** A merge belongs to S, and S
owns the union-only rule for `ReviewLog` — a second one here would resurrect deleted cards or discard
edits, and S would have to remove it. (2) **`seededAt` is the seeding gate, not "are there any decks".**
Any future path that restores `decks` without the settings singleton will make the next open seed five
duplicate PRC decks on top of hers; `backup.test.ts` asserts the consequence of that, so reintroducing
it turns the suite red rather than her device.

**On scope discipline:** do not start a workflow because it looks small. The remaining workflows are
sequential by design and each needs its own go-ahead.

**A note on why this section keeps going stale:** it has now three times argued for a workflow that has
since shipped — first C, then D, then E — because the recommendation was written as "the current one is
X" rather than as a standing order. Update the _state_ line in §1 and the DAG in `BUILD_GUIDE.md` §4 when
a workflow lands, and rewrite the paragraph above rather than adding a correction below it.

---

## 9. Working agreements

- **Never weaken a check to get green.** Do not skip a test, add `@ts-ignore`, lower a coverage
  threshold, or disable a lint rule. A failing check is a defect report.
- **Report what you verified and what you did not.** "Should work" is not verification. If you could not
  test on a real iPad, say so.
- **A number lives in one place.** Do not restate the coverage threshold in prose — point at
  `vitest.config.ts`. (The original repo this governance came from had five documents claiming 60% while
  the config enforced 50%.)
- **When the docs and the code disagree, the code wins** — then fix the doc.
- **Prefer deleting code to adding abstraction.** No speculative generality; the third consumer
  justifies an abstraction, not the imagined second.
- **Update the docs in the same change.** Stale runbooks are worse than none, because agents trust them.
