# Handoff — read this second

You are picking up **StudyBao** mid-build. This file is the state of the world: what exists, what was
decided and why, what is one-way, and what to do next.

**Read order:** [`CLAUDE.md`](../CLAUDE.md) (constraints and the two AI boundaries) → this file → the
runbook for whatever you were asked to do in [`docs/ai/`](ai/README.md).

**Last known good commit:** `20aa6c9` — "feat: Workflow A — installable, offline app shell with the
design system".

---

## 1. The 60-second version

A study companion for one person's **PNLE** (Philippine Nurse Licensure Examination) review. Flashcards
with SM-2 spaced repetition, a Pomodoro timer, a lesson tracker, and in-app attention nudges. Free tools
only, **no backend**, browser-based. Coquette pink-and-white.

|                                           |                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| **Her exam**                              | **Friday, February 26, 2027**                                          |
| **Her devices**                           | iPad (as a Home Screen Web App) and a Windows laptop (browser tab)     |
| **Workflow A** (scaffold + design system) | ✅ **Done**                                                            |
| **Workflow B** (flashcards + SM-2)        | ⏸ **Not started — this is the next work**                              |
| C, D, E, F, S, G, H                       | ⏸ Not started                                                          |
| Tests / coverage                          | 76 tests, 96.8% lines, 89.6% branches (floor is in `vitest.config.ts`) |
| Backend                                   | None, by decision. No server, no secrets.                              |

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
├── router.tsx                # 5 lazy routes + a real not-found state
├── pwa.config.ts             # manifest + Workbox config (imported by vite.config.ts)
├── styles/theme.css          # ★ ALL design tokens. The only place colours exist.
├── lib/
│   ├── cn.ts                 # className merge (tailwind-merge)
│   ├── logger.ts             # the only place that touches console
│   ├── theme.ts              # pure theme resolution — testable without a DOM
│   └── theme-store.ts        # tiny external store; useTheme()
├── components/
│   ├── icons.tsx             # inline SVG, no icon dependency
│   ├── layout/app-shell.tsx  # header + nav + skip link
│   └── ui/                   # Button, Card, Input, Modal, Tag, ProgressBar, Toast, EmptyState
├── features/
│   ├── dashboard/            # page + view, placeholder zeroes
│   ├── flashcards/           # page + view, honest empty state
│   ├── timer/                # page + view, static clock + the "keep tab open" warning
│   ├── tracker/              # page + view, empty state
│   └── settings/             # page + view; working theme toggle + storage notice
└── test/                     # setup.ts (jsdom shims) and render.tsx (the ONLY render entry point)
```

Root config: `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `prettier.config.mjs`,
`tsconfig.json`, `vercel.json` (SPA rewrite), `scripts/generate-icons.mjs`, `.github/workflows/ci.yml`.

**Nothing is wired to real data.** Cards, Timer and Lessons are deliberate empty states; the disabled
"New deck" button is honest, not a stub. There is no `src/db/` yet — that arrives in Workflow B.

### Architecture rules that are enforced, not just written down

`eslint.config.js` fails the build on: `any`, `console.*` outside `src/lib/logger.ts`, importing
`dexie` anywhere outside `src/db/`, importing `firebase/*` anywhere outside `src/sync/`, and raw
`fetch()` in feature code. Each error message names the fix. **Do not weaken these to make a change
compile** — if a rule is genuinely wrong, change the rule deliberately and say why.

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

## 8. What to do next — Workflow B

**Scope:** the flashcard system with real spaced repetition, usable standalone. Do **not** start C, D, E
or later.

**Read first:** [`docs/ai/README.md`](ai/README.md) → [`docs/ai/change-data-model.md`](ai/change-data-model.md)
→ [`docs/ai/write-tests.md`](ai/write-tests.md) → [`docs/ai/add-feature.md`](ai/add-feature.md).
Then [`docs/BUILD_GUIDE.md`](BUILD_GUIDE.md) §4 Workflow B and §6 (the data model and SM-2 contract).

**Order that avoids rework:**

1. `src/db/schema.ts` + `src/db/types.ts` — Dexie tables and the model. Get `updatedAt`/`deletedAt` in
   from the first version even though nothing syncs yet, and include the sync-only fields now.
2. `src/features/flashcards/lib/sm2.ts` — a **pure** `schedule(cardState, grade, now)`. Write the tests
   from `docs/ai/write-tests.md` **before** any UI. This is the highest-value test suite in the project.
3. `src/db/repositories/` — all Dexie access behind repositories, so `no-restricted-imports` stays
   satisfied and migrations have one audit point.
4. Manual CRUD UI (deck list, add/edit/delete card) following `docs/ai/add-feature.md`.
5. The review session UI: due cards (`nextReview <= Date.now()`), flip to reveal, 4-button grading.
6. Cram mode behind the exam-date setting.

**The SM-2 contract — do not improvise this.** Grades map Again=0, Hard=3, Good=4, Easy=5. Ease factor
is updated on _every_ grade **and floored at 1.3**. `q < 3` resets repetitions, records a lapse, and
re-enters sub-day learning steps (1 min → 10 min) — it does **not** jump to one day. Mastery threshold
is `intervalDays >= 21`, not a repetition count. Full statement in `BUILD_GUIDE.md` §6 and
[ADR 0003](adr/0003-sm2-scheduler-and-learning-steps.md).

**Deck seeds:** the five PRC Nursing Practice parts, verbatim from
[`reference/pnle-scope.md`](reference/pnle-scope.md). The integrated knowledge areas (pharmacology,
pathophysiology, A&P, nutrition, parasitology/microbiology) are **tags, not decks**.

**Definition of done for B:** SM-2 unit tests cover graduations, lapses and the EF floor; a card graded
Good four times schedules ~15+ days out; and the existing verification suite still passes.

**Do not:** add sync, add the timer, add OCR, or add a backend. Those are separate workflows.

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
