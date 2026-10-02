# Handoff — read this second

You are picking up **StudyBao** mid-build. This file is the state of the world: what exists, what was
decided and why, what is one-way, and what to do next.

**Read order:** [`CLAUDE.md`](../CLAUDE.md) (constraints and the two AI boundaries) → this file → the
runbook for whatever you were asked to do in [`docs/ai/`](ai/README.md).

**State of the tree:** everything through Workflow B is **committed, and the working tree is clean.**

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

|                                           |                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| **Her exam**                              | **Friday, February 26, 2027**                                           |
| **Her devices**                           | iPad (as a Home Screen Web App) and a Windows laptop (browser tab)      |
| **Workflow A** (scaffold + design system) | ✅ **Done**                                                             |
| **Workflow B** (flashcards + SM-2)        | ✅ **Done** — reviewed, defects fixed, committed                        |
| **Workflow C** (ingest pipeline)          | ✅ **Done** — all three commits (paste, PDF, photo OCR)                 |
| **Workflow D** (Pomodoro + sessions)      | ✅ **Done** — the first schema migration in the project's history       |
| E, F, S, G, H                             | ⏸ Not started                                                           |
| Tests / coverage                          | 455 tests, 86.1% lines, 87.7% branches (floor is in `vitest.config.ts`) |
| Backend                                   | None, by decision. No server, no secrets.                               |

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
- **Nothing ingest-related is precached.** Precache is **87 entries / 1154 KiB** with zero PDF or OCR
  assets in it, verified by `node scripts/report-precache.mjs`, which reads the generated manifest
  rather than trusting the config. The worker and language data are runtime-cached instead, so the
  **first** photo import needs the network and every one after it does not — which the tab says in
  words rather than leaving a spinner to look broken on a train.

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
├── router.tsx                # 7 lazy routes + a real not-found state
├── pwa.config.ts             # manifest + Workbox config (imported by vite.config.ts)
├── styles/theme.css          # ★ ALL design tokens. The only place colours exist.
├── lib/
│   ├── cn.ts                 # className merge (tailwind-merge)
│   ├── logger.ts             # the only place that touches console
│   ├── theme.ts              # pure theme resolution — testable without a DOM
│   ├── theme-store.ts        # tiny external store; useTheme()
│   ├── time.ts               # MS_PER_MINUTE / HOUR / DAY. No bare magic numbers.
│   └── study-day.ts          # ★ THE 04:00 study-day boundary. Single implementation.
├── db/                       # ★ the only layer allowed to import dexie
│   ├── types.ts              # Deck, Card, ReviewLog, AppSettings, Grade
│   ├── schema.ts             # Dexie version 1 + the lazily-opened singleton
│   ├── seed-data.ts          # the five PRC parts, verbatim from the reference file
│   ├── migrations.test.ts    # schema + seeding tests
│   └── repositories/         # decks · cards · review-logs · settings
├── components/
│   ├── icons.tsx             # inline SVG, no icon dependency
│   ├── layout/app-shell.tsx  # header + nav + skip link
│   └── ui/                   # Button, Card, Input, Modal, Tag, ProgressBar, Toast, EmptyState
├── features/
│   ├── dashboard/            # page + view, placeholder zeroes
│   ├── flashcards/           # ★ Workflow B — lib/ hooks/ components/ pages/ types.ts
│   ├── ingest/               # ★ Workflow C — lib/ hooks/ components/ pages/ types.ts
│   ├── timer/                # page + view, static clock + the "keep tab open" warning
│   ├── tracker/              # page + view, empty state
│   └── settings/             # page + view; theme toggle + exam date + storage notice
└── test/                     # setup.ts (jsdom shims + DB reset) and render.tsx
```

`src/lib/use-database-value.ts` is the shared cross-screen refresh signal, promoted out of
`flashcards/` in Workflow C when ingest became its third consumer. **Do not copy it** — two copies
would mean two screens disagreeing about what is current. Note the contract in its doc comment: `load`
must be stable (wrap it in `useCallback`), or the effect cancels and restarts its own read forever and
`loading` never becomes `false`. That mistake was made once during Workflow C and cost an afternoon.

Root config: `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `prettier.config.mjs`,
`tsconfig.json`, `vercel.json` (SPA rewrite), `scripts/generate-icons.mjs`, `.github/workflows/ci.yml`.

**Flashcards are wired to real data.** The five PRC decks are seeded on first launch and cards can be
created, edited, deleted and reviewed with real SM-2 scheduling. The Timer and Lessons screens are still
deliberate empty states; the dashboard still shows placeholder zeroes.

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
- The npm cache may need to be workspace-local (`--cache ./.npm-cache`) where the global cache is not
  writable. It is gitignored.
- **jsdom does not implement `HTMLDialogElement.showModal`.** `src/test/setup.ts` shims it, and the
  Modal tests dispatch `cancel` directly. Do not "fix" this by replacing native `<dialog>` with a div —
  the platform behaviour is the reason it was chosen.
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
- **`ReviewLog`, `lapses`, `updatedAt`, `deletedAt` and epoch-ms timestamps are non-backfillable.** You
  cannot reconstruct _when_ something happened after the fact. This is the one-way class of decision —
  see §7.
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

**Workflow B is done.** The flashcards work end to end: seeded decks, manual CRUD, real SM-2, a review
session, and cram mode. Nothing else has started, and each remaining workflow still needs its own
go-ahead.

### The order is decided: **C now, D immediately after**

**C (ingest → flashcards) is next.** The reasoning, because this deviates from `BUILD_GUIDE.md` §9.2,
which schedules D alongside B in weeks 1–3:

- **C is the input path for the whole product.** B shipped manual entry, so without C every card has to
  be typed by hand from her notes. That is not an enhancement to the core loop; it is the only way her
  material reaches it.
- **Spaced repetition compounds, and only over cards that exist.** A card created in December gets less
  spacing than one created in October, and the exam date does not move. A Pomodoro timer added in
  December is exactly as useful in December as it would have been in October. Card creation binds
  earlier than the timer does.
- **C carries the most technical risk left** — OCR, web workers, and a precache-size hazard that would
  slow the first load of the app forever. Risk is cheaper to retire with 21 weeks of runway than with 8.
  If C is going to be hard, that is worth knowing in October.
- **Delaying D costs nothing structurally**, because D is independent of the data model and of C.

The one argument for D first is that it is small, self-contained, and unblocks `SessionLog` for F and
the session state for G. It is a reasonable call, and C is the better one: the exam is failed by missing
cards, not by a missing timer.

**The deviation is recorded in `BUILD_GUIDE.md` §9.2** rather than quietly re-planned.

**A correction to how this section used to read:** it said C removes the card-entry tax "now that she is
actually using the app". She is not — she does not know the app exists (D6: it is a surprise). No
card-entry tax is being paid today, and no adoption clock is running. What C buys is that the app is
ready for the reveal, because a reveal that asks her to type every card from her notes will fail.

**[`docs/WORKFLOW-C-PROMPT.md`](WORKFLOW-C-PROMPT.md) is the self-contained brief to hand the next
agent.** It carries the three OCR traps, the decided reload behaviour, and the test-can't-go-red rule.
It is spent once C ships.

**S (sync) is the one with a hard constraint:** `ReviewLog` must merge union-only, and
`docs/ai/change-data-model.md` names it.

**Read first for any workflow:** [`docs/ai/README.md`](ai/README.md) → the matching runbook →
[`docs/BUILD_GUIDE.md`](BUILD_GUIDE.md) §4 for that workflow and §6 for the model and contracts.

**What Workflow B leaves you, concretely:**

- `src/db/` — Dexie version 1 with `decks`, `cards`, `reviewLogs`, `settings`, four repositories, and a
  seeding path gated on a `seededAt` marker. **Any change here needs a version bump and a tested
  migration**; `src/db/migrations.test.ts` is the pattern to extend.
- `src/features/flashcards/lib/sm2.ts` — the scheduler, with 25 tests. Do not edit it without reading
  the contract at the top of the file and re-running them.
- `src/lib/study-day.ts` — the single 04:00 boundary. The streak logic in Workflow F must call it, not
  reimplement it.
- `src/db/repositories/cards.ts` → `recordReview` — grading and its `ReviewLog` row in one transaction.
  Nothing may write a card's SM-2 state outside it.

**The SM-2 contract — do not improvise this.** Grades map Again=0, Hard=3, Good=4, Easy=5. Ease factor
is updated on _every_ grade **and floored at 1.3**. `q < 3` resets repetitions, zeroes the interval,
records a lapse, and re-enters sub-day learning steps (1 min → 10 min) — it does **not** jump to one day.
Mastery is `learningStep === null && intervalDays >= 21`, not a repetition count. Full statement in
`BUILD_GUIDE.md` §6 and [ADR 0003](adr/0003-sm2-scheduler-and-learning-steps.md).

**Deck seeds:** the five PRC Nursing Practice parts, verbatim from
[`reference/pnle-scope.md`](reference/pnle-scope.md). The integrated knowledge areas (pharmacology,
pathophysiology, A&P, nutrition, parasitology/microbiology) are **tags, not decks**.

**Definition of done for B:** SM-2 unit tests cover graduations, lapses and the EF floor; a card graded
Good four times schedules ~15+ days out; and the existing verification suite still passes. **All three
met** — the counterexample is asserted by name in `sm2.test.ts`, and it is what pinned the meaning of
`repetitions`.

**On scope discipline:** do not start a workflow because it looks small. The remaining workflows are
sequential by design and each needs its own go-ahead. The current one is **C**, and its do-not-build
list — timer, tracker, dashboard, sync, notifications, backend — is in
[`docs/WORKFLOW-C-PROMPT.md`](WORKFLOW-C-PROMPT.md).

This replaces an earlier line here that read "Do not: add sync, add the timer, add OCR, or add a
backend." That was the Workflow B brief's constraint list, and once B shipped it became wrong in the
same section that recommends C — which is OCR. A stale "do not" next to a "do this" is how a reader
talks themselves out of the correct next step.

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
