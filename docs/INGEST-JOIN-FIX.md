# Prompt — fix the ingest parser's over-joining

Hand this to a fresh agent. It is a **single, scoped defect fix**, not a workflow. It is spent once it
ships.

Written at commit `9875d5f`. Do not trust that hash — run `git log --oneline -6`.

---

You are picking up **StudyBao**, a study companion for one person's PNLE review. Workflows A–E are
committed. Her exam is **Friday 26 February 2027**.

## Read these first

1. `CLAUDE.md` — constraints
2. `docs/HANDOFF.md` §1 and §8 — current state, and why this is the next task
3. **`docs/INGEST-FITNESS-RESULTS.md`** — the measurements this fix is judged against
4. `docs/ai/write-tests.md` **case 6 and case 7** — the invariant and the join rule, both recently
   corrected. Read the corrections carefully; the defect you are fixing was in the earlier version of
   case 7.
5. `src/features/ingest/lib/parse.ts` — `isContinuation`, `endsASentence`, and the provenance machinery
   around line 592

## The defect, precisely

`src/features/ingest/lib/parse.ts` line 425:

```ts
function isContinuation(previous: NormalizedLine, line: NormalizedLine): boolean {
  const text = line.text
  if (/^[a-z]/.test(text)) return true // positive evidence
  if (/^[)\]}"'”’]/.test(text)) return true // positive evidence
  if (/^[,;:]/.test(text)) return true // positive evidence
  return !endsASentence(previous.text) // ← ABSENCE of evidence, treated as evidence
}
```

The first three clauses require a signal. The fourth requires _the absence of one_ — and in her notes
**91% of lines do not end in terminal punctuation**, because they are note fragments rather than prose.
So that clause is effectively always true.

Measured against a real 133-page handout (`docs/INGEST-FITNESS-RESULTS.md` §1–§3):

| Symptom                                                      | Measured                                |
| ------------------------------------------------------------ | --------------------------------------- |
| Joins performed                                              | 2,475                                   |
| Joins triggered by the `!endsASentence` fallback             | **1,483 (60%)**                         |
| Cards produced                                               | 523                                     |
| **Distinct fronts**                                          | **402** — 158 cards (30%) share a front |
| Cards absorbing a mid-text ALL-CAPS heading                  | 88                                      |
| Cards that are the running page header                       | 27                                      |
| Longest single card                                          | **109 source lines**, 3,109 characters  |
| Cards whose front is ≤3 characters (`N`, `WOF`, `DOC`, `C1`) | 34                                      |

**This is a defect in the written spec, faithfully implemented.** Do not treat it as someone's coding
error, and do not "fix" it by inventing a rule that is not in case 7.

## The principle that decides every judgement call here

**Err toward the leftover queue, never toward a join.**

A wrongly joined card is _silently wrong_ — she reviews it, trusts it, and it may be on her licensure
exam. A leftover line is _visible_ and one tap from becoming a card in the review screen. So when the
evidence is ambiguous, do not join. **The leftover rate going up is the expected and correct outcome of
this fix, not a regression** — if your change drives more lines into the leftover queue, say so in your
report as a success, not an apology.

## What to change — one file, three guards

All in `parse.ts`. Do not touch `pdf-lines.ts`, `extract-pdf.ts`, `normalize.ts`, or any OCR path.

1. **Require positive evidence.** Delete the `!endsASentence` fallback. A join happens only on a
   lowercase start or a closing bracket/punctuation start.
2. **Cap the span.** A card may not absorb more than a small, named, justified number of source lines.
   Pick it from the data, state the number and the reasoning, and make it one exported constant. The
   observed worst case was 109; the p50 is 1.
3. **Stop at a heading.** A line that is entirely ALL-CAPS, or that matches a numbered heading shape,
   ends the join regardless of what the text looks like. Derive it from the line itself.

Consider a fourth only if the first three prove insufficient: `contentItemsToLines` currently **drops
whitespace-only lines** on purpose (`pdf-lines.ts:38–40`), so the strongest boundary in her notes never
reaches the parser. Carrying a blank-line marker through would give the join rule real evidence — **but
it changes the provenance index space, so it belongs in its own change** with its own invariant test.
Note it and leave it unless the fix genuinely cannot work without it.

## The tests, which come first

Write these **before** the fix and confirm each one fails against the current code:

1. **The canonical repro**, from the results doc: `Term: definition one` followed by
   `NEXT SECTION HEADING` must produce **two** entries, not one card.
2. A ten-line definition wrapped at an awkward point still becomes **one** card — the fix must not break
   the legitimate case case 7 exists for.
3. A lowercase line that genuinely begins a `term: definition` still becomes its **own** card.
4. The span cap actually caps, with a card built from many short lines.
5. **The provenance invariant, unchanged**: for any input, every normalized input line belongs to
   exactly one card's source-line span or to the leftover queue — never two, never none. Extend it over
   generated line sequences, not only fixtures.

**Confirm each new test goes red against the unfixed code before you trust it.** This repository has
already shipped two tests that passed under both the fix and the reintroduced bug, and the whole reason
this defect survived is that a green test cannot see it.

## How this fix is judged — re-run the fitness test

Unit tests are necessary and **not sufficient**. The unit suite was green the entire time the parser was
mangling her real notes. So:

**Rebuild the measurement harness and commit it as `scripts/ingest-fitness.mjs`.** It is a dev tool
like `scripts/report-precache.mjs` and `scripts/smoke-pdf.mjs`, not a fixture — **take the PDF paths as
arguments** so no third-party content ever enters the repository. It was deleted after the first run,
which is why this second run would otherwise have to rediscover everything.

Things the first run learned the hard way, so you do not repeat them:

- **Import the real modules** from `src/features/ingest/lib/`. Do not reimplement any part of the
  pipeline, not even "just the line joining".
- `pdfjs-dist` needs its **legacy build** in Node; the modern build throws
  `TypeError: Promise.try is not a function` on Node 22.
- `extract-pdf.ts` sets `GlobalWorkerOptions.workerSrc` to a browser URL. PDF.js 6 disables the worker in
  Node and then treats that value as a module path, so extraction dies with
  `Setting up fake worker failed: Cannot find module`. The first run remapped the specifier in a Node
  loader hook **without touching `extract-pdf.ts`** — do the same. If you find yourself editing a source
  file to make the harness work, stop: that is a finding about coupling, and it belongs in your report.
- Only `sessionStorage` needs stubbing. `document`, `window`, `Worker`, `canvas` and IndexedDB were not
  needed.
- **Do not print extracted text through the console** to inspect it. A UTF-8 string printed to a console
  that decodes Latin-1 shows convincing mojibake that is not in the data. The first run lost time to
  this. Decode as bytes if you need to check.

The two sample files are at the paths recorded in `docs/INGEST-FITNESS-TEST.md`. If either is no longer
readable, say so and ask rather than substituting a file of your own.

### Report before and after, in this table

| Metric                                   | Before                                     | After                     |
| ---------------------------------------- | ------------------------------------------ | ------------------------- |
| Joins performed                          | 2,475                                      | ?                         |
| Joins from the `!endsASentence` fallback | 1,483                                      | ?                         |
| Cards produced                           | 523                                        | ?                         |
| Distinct fronts                          | 402                                        | ?                         |
| Cards sharing a front                    | 158                                        | ?                         |
| Cards absorbing a mid-text CAPS heading  | 88                                         | ?                         |
| Cards that are the running page header   | 27                                         | ?                         |
| Longest card (source lines)              | 109                                        | ?                         |
| Cards with a front ≤3 characters         | 34                                         | ?                         |
| Leftover entries                         | 215                                        | ? (may rise — expected)   |
| Provenance invariant                     | 3,215/3,215 claimed, 0 double, 0 unclaimed | must be identical in kind |

Two of those files behave differently and you must report both: one has a text layer and yields 3,215
lines; **the other has no text layer and yields 0 lines, which is correct and not your concern** (the
PDF is rasterized; a separate task will add an OCR fallback for it).

## Non-negotiables

- **Any Dexie schema change needs a version bump and a tested migration.** You should need none.
- **Never weaken a check to get green.** No skipped tests, no `@ts-ignore`, no lowered threshold, no
  disabled lint rule.
- **Do not change the invariant to make the fix easier.** If the fix cannot preserve it, stop and report
  that instead — the invariant is the thing that makes silent data loss impossible.
- **Do not fix anything else.** Not deduplication, not table rows, not `looksScanned`, not the
  horizontal-gap line break in `pdf-lines.ts`. Those are queued with their own decisions, and one change
  at a time is what keeps a review readable. If you find something else, write it down.
- Report what you verified and **how**; say plainly what you could not verify. "Should be better" is not
  a measurement.

## Before you write code

Reply with: **(1)** your plan, **(2)** the span cap you chose and why, **(3)** your position on whether
the blank-line marker from `contentItemsToLines` is needed for this change or belongs in the next one,
and **(4)** anything in case 6/7 you think is still wrong — that case has already been corrected once
because it was wrong on real input, so a third opinion is welcome.

Then stop for a go-ahead.

## Verify

```bash
npm install --cache .npm-cache
npm run typecheck && npm run lint:check && npx prettier --check .
npm run test:coverage
npm run build && npm run preview
node scripts/ingest-fitness.mjs "<path to handout with a text layer>"
```

All must pass, and the harness numbers must show in your report beside the before column above.
