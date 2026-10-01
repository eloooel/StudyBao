# Prompt for the next agent — Workflow C (ingest pipeline)

Copy everything below the line into a fresh session, in this repository. It is written to stand alone.

This file is spent once Workflow C ships. It was written at the end of Workflow B; do not treat it as
authoritative afterwards — `docs/HANDOFF.md` is the state of the world.

---

You are picking up **StudyBao**, a study companion for one person's PNLE (Philippine Nurse Licensure
Examination) review. Note the date: her exam is **Friday 26 February 2027**.

## Read these, in this order, before you write or plan anything

1. `CLAUDE.md` — constraints and the two AI boundaries
2. `docs/HANDOFF.md` — current state, every decision, what is one-way
3. `docs/WORKFLOW-B-REMAINING.md` — what Workflow B deliberately left open, **and the sandbox traps**
   that cost real time
4. `docs/ai/README.md` — the runbooks and their ground rules
5. `docs/ai/add-feature.md` — folder layout and the three-layer pattern
6. `docs/ai/write-tests.md` — **the Workflow C parser test cases are specified here**, in full
7. `docs/ai/change-data-model.md` — read it even though you should not need a schema change
8. `docs/BUILD_GUIDE.md` §4 Workflow C and §3 "OCR reality check"
9. `docs/adr/0004-no-llm-in-runtime.md` — why the parser is deterministic, and must stay that way

`docs/ai/*.md` are the procedure. `CLAUDE.md` is the constraints. Where a doc and the code disagree,
**the code wins** — then fix the doc.

Do not trust a commit hash written in a document, including this one. Run `git log --oneline -6`.

## What exists now

Workflow B (flashcards + real SM-2 spaced repetition) is complete, reviewed, verified and committed:
261 tests, ~84% line coverage, all checks green. Deck list, card CRUD, a review session with four-button
grading, and cram mode all work against real IndexedDB. Nothing else is started.

Read `src/features/flashcards/` before writing anything. It is the only complete data-backed feature
in the repo and it is the shape to copy: `lib/` for pure logic with co-located tests, `hooks/` for
data access, `pages/` for thin routes, `components/` for pure views, `types.ts` for every prop type.
Your output should be structurally indistinguishable from it.

## Your job: Workflow C — the ingest pipeline

Turn her notes into cards, so she stops hand-typing every one. Per `BUILD_GUIDE.md` §4:

1. **Ingest UI with three tabs: Paste text · Upload PDF · Upload photo.**
2. Normalize → parse (layered patterns) → produce `proposed` cards plus a `leftover` queue.
3. **Review screen:** accept / edit / delete each proposed card, and manually convert leftover text.
4. On accept, write into the existing `Deck`/`Card` model with fresh SM-2 state.
5. **Output:** notes → an editable flashcard batch, with honest handling of what failed to parse.

Build exactly that. **Do NOT build** the Pomodoro timer, the lesson tracker, the dashboard, cloud
sync, notifications, or any backend. Each is a separate workflow and needs its own go-ahead.

### The parser is the highest-value part, and the riskiest

Write `src/features/ingest/lib/parser.ts` (or `src/features/flashcards/lib/parser.ts` if you judge it
belongs with the cards — say which and why in your plan) as a **pure function**, with the six test cases
in `docs/ai/write-tests.md` written **first**.

The invariant that matters most is test case 6, and it is about **content, not line breaks**: every
normalized input line must belong to exactly one card's provenance span or to the leftover queue —
never two, never none. A dropped line is a card she never reviews and has no way to notice is missing,
and silent data loss is the failure mode here, not an ugly parse. Provenance is required to assert
this, so the parser must report which input lines each card came from.

That also settles the wrapped-line question in test case 7: **join continuation lines.** A definition
that wraps across two lines is still one definition, and refusing to join drowns her in fragments.
Pattern-match first, then consider joining — a line that matches a card-start pattern is never joined,
even if it begins lowercase. An earlier draft of this brief stated the invariant as a literal line
count, which forbade joining; that was wrong and `docs/ai/write-tests.md` now carries the form above.

The other edge cases are enumerated in `BUILD_GUIDE.md` §3 and each one is a real bug in a naive
implementation: colons inside ordinary prose, hyphens inside words (`self-esteem` must not split),
the left-hand term must be short and not end in a period, OCR noise must be stripped first.

### The review screen must survive a reload — this is decided, not open

An earlier draft of this brief said the leftover queue was "transient UI state". That was wrong, and it
contradicted this repo's own precedent: the cards review session is a **route with a
database-derived queue** specifically because a hard refresh mid-session is realistic on an iPad — a tab
restore, an accidental swipe, ITP eviction.

Ingest has the same exposure and more invested: a 30-second OCR pass, and then _minutes_ of curation as
she accepts some cards, edits others, and converts leftover lines by hand. Anything she has already
**accepted is already durable** in `cards`, so the exposure is the unreviewed remainder plus her
position in the batch. That is worth protecting, and it is not worth a schema change.

**Decision: persist the draft so it survives a reload, using the cheapest mechanism that does
(`sessionStorage` or equivalent). Do NOT add a table for it in Workflow C.** A Dexie version bump and a
migration is not justified for the unreviewed remainder of a batch, and this project has a standing
bias against speculative schema. State in your plan which mechanism you chose and what it does _not_
survive, so the limit is honest rather than implied.

**Also decided, because the persistence decision forces them:**

- **A stated size ceiling, checked before writing.** Persist nothing above it rather than a truncated
  draft, and show an honest message instead. A half-restored batch is worse than a stated limit. Name
  the ceiling as one exported constant that both the check and the message read; do not let a magic
  number appear twice.
- **The message is reassuring and true**: everything she has _accepted_ is already saved, so the only
  loss is the unreviewed remainder. Say that rather than apologising.
- **The review screen is therefore a route** — `cards/ingest`. If it lived only in component state, a
  reload would land her on `/cards` with an orphaned draft and nothing to restore it into. Declare it
  **before** `cards/:deckId` in `src/router.tsx`, exactly as `cards/review` already is, or `ingest` is
  parsed as a deck id.

## Non-negotiables — these break real data or the offline guarantee if missed

- **No LLM in the shipped product. Ever.** Parsing is deterministic pattern matching. Do not add a
  model call, an API key, or a server-side secret. See ADR 0004 and ADR 0006. This is not a
  preference you can revisit in a quiet commit.
- **No new runtime network dependency.** The app must work with the network off. Self-host anything
  that would otherwise be fetched from a CDN — this is the whole offline story, and it is also why
  the fonts are self-hosted.
- **All timestamps in the database are epoch milliseconds.** Not dates, not date strings. Any new
  record needs `updatedAt`; anything deletable needs `deletedAt` and is **never hard-deleted**.
- **Any Dexie schema change needs a version bump AND a tested migration.** You should not need one —
  see the reload decision above. If you disagree, read `docs/ai/change-data-model.md` first and come
  back rather than deciding quietly.
- **All IndexedDB access goes through `src/db/repositories/`.** ESLint enforces this; do not disable
  the rule.
- **Never weaken a check to get green.** No skipped tests, no `@ts-ignore`, no lowered coverage
  threshold. A failing check is a defect report, not an obstacle.
- **Do not change a decision in `BUILD_GUIDE.md` §2 or an ADR.** If you think one is wrong, write a
  new ADR and ask.
- Follow the voice in `BUILD_GUIDE.md` §5 for every user-facing string: warm, playful, never clinical,
  never guilt-inducing.

## Three traps specific to this workflow — do not discover these the hard way

1. **Tesseract.js fetches its worker, its WebAssembly core and its language data from a CDN by
   default.** That is 20–30 MB, and it breaks offline use completely. You must self-host all three
   via the `createWorker` options — `workerPath`, `corePath` and `langPath` — and note that
   `corePath` must point at a **directory containing all four** core files
   (`tesseract-core.wasm.js`, `-simd`, `-lstm`, `-simd-lstm`); Tesseract picks between them by device
   capability, so pointing at one specific file is a documented mistake.
2. **Do not let the service worker precache the language data.** `src/pwa.config.ts` currently globs
   everything under `workbox.globPatterns`, and a 20 MB precache would make the **first load** of the
   app far slower for every user forever — for a feature she may rarely use. Fetch it on demand when
   she opens the photo tab, and let runtime caching make it offline-capable _after_ first use.
   Verify the resulting precache size in the build output and report what it became.
3. **PDF parsing needs its worker wired up or it fails at runtime while typechecking fine.**
   `pdfjs-dist` needs `GlobalWorkerOptions.workerSrc` set to a bundled worker URL. Get this working
   under `npm run preview`, not just `npm run dev` — a worker path that only resolves in dev is a bug
   that ships.

**Ask before adding dependencies.** `tesseract.js` and `pdfjs-dist` are both named in
`BUILD_GUIDE.md` §3 as the intended tools and are free with no API key, so they are very likely fine
— but every dependency needs an explicit yes first. If the install fails, read the sandbox notes in
`docs/WORKFLOW-B-REMAINING.md`; they cost real time.

## How to verify your work

```bash
npm install --cache .npm-cache   # workspace-local cache; the global one failed with EPERM
npm run typecheck
npm run lint:check
npx prettier --check .
npm run test:coverage
npm run build && npm run preview  # the dev server does NOT run the service worker
```

All six must pass. CI runs the same set plus an assertion that `dist/sw.js` and
`dist/manifest.webmanifest` exist. Confirm `npm ci` still resolves too if you touched dependencies.

Then walk it like she will: at iPad width, with the network **disabled**, over `preview`. OCR is
slow — tell her it is working rather than letting the screen look frozen.

## A rule this repo learned the hard way

Three defects shipped in Workflow B inside code that passed its tests, and **two of the tests written
to pin those fixes passed under both the fix and the reintroduced bug** — so they proved nothing. The
parser is exactly the kind of code where this happens, because a wrong parse still returns a plausible
array.

**When you add a regression test, reintroduce the bug and confirm the test goes red before you trust
it.** A green test that cannot go red reads as coverage and is worse than no test.

Also: the six parser tests are specified, but they are not the whole job. Add cases for whatever you
find while implementing, especially anything where a plausible-looking parse is silently wrong.

## Before you write any code

Reply with: **(1)** your implementation plan in a short numbered list, **(2)** anything in the parser
contract, the data model, or the ingest flow you think is ambiguous or wrong, and **(3)** any question
you need answered — including the dependency list and the reload mechanism you chose.

Then **stop and wait for a go-ahead.** Do not start implementing.

## How to report back

State what you changed and why, what you verified and **how**, what you did **not** verify, and any
check you could not run. "Should work" is not verification. If you could not test something on a real
iPad, say so plainly — no agent in this project has yet, and a real device is the only place the
offline and Home Screen behaviour is true.
