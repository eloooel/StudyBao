# Write tests

Add or fix tests. This repo tests _rules_, not rendering.

## What must be tested (non-negotiable)

These are pure functions whose bugs are silent and whose consequences she feels for weeks:

| Module                              | Why it is critical                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `features/flashcards/lib/sm2.ts`    | A wrong interval is invisible until her exam.                                                               |
| `lib/study-day.ts`                  | The 04:00 boundary. Wrong here means a wrong streak and a wrong interval.                                   |
| `features/flashcards/lib/queue.ts`  | Decides what she sees and in what order, including cram ordering.                                           |
| `features/ingest/lib/parse.ts`      | Silent data loss: a dropped note line is a card she never reviews.                                          |
| `features/ingest/lib/normalize.ts`  | Every rule downstream depends on the text being clean and the line indices being right.                     |
| `features/ingest/lib/image-prep.ts` | OCR preprocessing. A wrong scale or a zeroed alpha channel is a page of gibberish.                          |
| `features/ingest/lib/pdf-lines.ts`  | Where PDF line breaks land: one card per page, or thirty cards.                                             |
| `sync/lib/merge.ts`                 | A wrong merge resurrects deleted cards or discards edits. **(pending Workflow S)**                          |
| `features/timer/lib/timer.ts`       | Wall-clock math; a bug means the timer lies about remaining time.                                           |
| `features/tracker/lib/deadline.ts`  | A deadline that is wrong only across the 04:00 boundary sorts a lesson into the wrong section, confidently. |
| `features/dashboard/lib/stats.ts`   | Streak/mastery math she will act on. **(pending Workflow F)**                                               |

Target: **100% branch coverage on `lib/` pure functions.** A threshold in `vitest.config.ts` enforces
the floor; the floor is not the goal.

## What not to test

- Tailwind classes, layout, or styling.
- Implementation details (private helpers, internal state shape).
- Snapshots.
- Third-party libraries.
- The service worker's caching internals. Test the push-payload → notification-options mapping as a
  pure function instead.

## SM-2 test cases that must exist

These are all in `src/features/flashcards/lib/sm2.test.ts`:

1. A new card graded **Good** graduates 1 day → 6 days → `round(6 × EF)`.
2. A new card graded **Again** does not jump to 1 day; it re-enters a sub-day learning step and
   increments `lapses`.
3. Ease factor **never falls below 1.3** — assert the whole sequence, not just the floor.
4. Ease factor is updated on _every_ grade, including failures and learning steps.
5. **Easy** produces a strictly larger ease factor than **Good**, which is strictly larger than
   **Hard**.
6. `nextReview` is always strictly in the future (no card can be scheduled in the past).
7. Grading is deterministic given `(state, grade, now)` — assert against a fixed injected `now`,
   never against the real clock.
8. **The Workflow B definition of done**: a card graded Good four times lands on **15 days**, not 6.
   This is the counterexample that fixes what `repetitions` counts — if the learning steps incremented
   it, the fourth Good would give 6 days. Keep it.
9. Losing a matured card to **Again** zeroes `intervalDays`, so it cannot still report as mastered.
10. A day-scale interval snaps to the **04:00 study day**, and a 03:00 review is due an hour later
    because it still belongs to the previous study day. That is deliberate — make it a test, not a
    "fix".
11. **Easy and Good diverge on a fresh card.** Easy graduates immediately from any learning step
    (`learningStep === null`, `intervalDays === 1`), while Good only advances one step. If they did the
    same thing, the fourth button would be arbitrary and distinguishable only by an ease delta she
    cannot see for weeks.
12. **A card graded Again is served again inside the same session once its step is due.** This is the
    one that catches the whole class of bug where the re-serve decision is made at grade time — where
    `nextReview > now` is guaranteed, so the check always fails. Assert it in
    `hooks/use-review-session.test.tsx`; `pickNextCard` in `lib/queue.test.ts` covers the pure part.

## The 04:00 study day

`src/lib/study-day.ts` is the **single** implementation of the rollover rule. The scheduler uses it
now and the streak logic (Workflow F) will use it. Two copies would disagree eventually, and the
failure is a streak number that is wrong in a way nobody can reproduce. Test that module directly;
do not re-derive the boundary anywhere else.

**Day-scale intervals go through `addStudyDays`, never `boundary + n × MS_PER_DAY`.** `studyDayStart`
is calendar-based on purpose; a fixed 24-hour offset from it breaks across a DST transition and lands
at 03:00, the previous study day. That bug is invisible in a zone without DST, so it has its own file:
`src/lib/study-day.dst.test.ts` pins `process.env.TZ = 'Europe/London'` **before** any date is
constructed (which is why it must be a separate file) and asserts both transitions. The main
`study-day.test.ts` keeps the assertions that hold in any zone.

**Two behavioural tests in this repo are only worth having if they fail when the bug is reintroduced.**
Both were written wrong the first time — passing under the fix _and_ under the regression:

- the cram deck-order test needed a card in a deck whose id sorts before `deck-practice-i`, because
  string-sorting the real deck ids happens to give the right answer;
- the DST test needed its own file, because setting `TZ` mid-suite changes nothing.

When you add a regression test here, **check it fails against the old behaviour before you trust it.**
A green test that cannot go red is worse than no test, because it reads as coverage.

**Workflow C confirmed the rule the hard way, three times in one change.** Writing the parser, four
distinct defects were found only because a fixture existed and went red:

- a fixture asserting `Term:` (empty definition) produced a card found that requiring text after the
  colon broke **every** wrapped definition — the join had nothing to attach to;
- a fixture asserting `"1. Vitamin C: ascorbic acid"` produced a card found that reading a bare `1.` as
  a question marker swallowed numbered definitions entirely;
- a fixture asserting a lowercase `term: definition` became its **own** card found that bare
  `term: definition` lines had no detector, so they were glued onto the line above and the term was lost
  into the previous definition;
- a fixture asserting `"Note: she reported: pain"` landed in the leftover queue found that rejected
  separator lines were being appended to the card above them — a card saying something her notes did
  not say.

Each was then confirmed to fail against its reintroduced bug (the third made **seven** tests red, the
fourth **seven** as well). None of them would have been visible in a passing suite, because a wrong
parse still returns a plausible array.

## Parser test cases that must exist

These are all in `src/features/ingest/lib/parse.test.ts`:

1. `Term: Definition` becomes one card with correct front/back.
2. `self-esteem` and `post-operative` are **not** split as `Term - Definition`.
3. A prose sentence containing a colon is not turned into a card.
4. Numbered `Q1./A1.` blocks pair correctly, in order.
5. Bulleted definitions become cards.
6. **No content is lost, and no line is claimed twice.** The invariant is about _content_, not line
   breaks. An earlier version of this file said `cards.length + leftoverLines.length` must account for
   every non-empty input line, which is the wrong shape twice over: it forbids joining a wrapped line
   (see 7), and it cannot detect a line being counted twice.

   The parser must therefore report **provenance**: for each produced card, the indices of the input
   lines it was assembled from. Then assert, for any normalized input:

   - every non-empty input line index belongs to **exactly one** of — the source-line span of exactly
     one card, or the leftover queue;
   - no line index is claimed by two cards;
   - no line index is claimed by none.

   That is exact, it tolerates one card owning three lines, and it catches duplication as well as loss.
   Assert it over the fixtures **and** over a few hundred generated line sequences, not just the happy
   ones.

   **What the generated test does not prove.** It showed green under a planted bug that stopped the
   parser recognising a line as a card, because such a line still falls through to the leftover queue
   and stays accounted for. That is the invariant working correctly, and it is also why the named
   fixtures above matter: only a specific case can assert that a particular input produced a particular
   card. The generated test was confirmed to fail when `assertProvenance`'s missing-line check was
   disabled.

7. **A wrapped line joins the line above it, conservatively.** OCR and PDF text extraction both break
   mid-sentence, so a definition routinely arrives across two or three lines. Joining them is correct
   and is what makes the feature useful; refusing to join drowns her in fragments and is worse than the
   bug it avoids.

   The rule runs **after** the card patterns, never before:

   - if a line matches a card-start pattern it starts a card — **never** join it, even when it begins
     lowercase;
   - otherwise join it to the previous line only on **positive evidence**: it begins lowercase, or
     begins with a closing bracket or punctuation.

   **A join may never rest on the absence of a signal.** This file previously allowed a third clause —
   "or the previous line does not end a sentence" — and on real input it was a disaster: 91% of the
   lines in a set of real board-review notes do not end in terminal punctuation, because they are note
   fragments rather than prose. So the clause was effectively always on. It fired 1,483 times, 60% of
   all joins, and merged unrelated sections into single cards — 88 cards absorbed a mid-text ALL-CAPS
   heading and 27 became the running page header. A rule that triggers on a missing signal will trigger
   on nearly everything in the domain where that signal is rare, and note fragments are exactly that
   domain. See [`INGEST-FITNESS-RESULTS.md`](../INGEST-FITNESS-RESULTS.md).

   Two further guards, because positive evidence alone still permits a runaway join:

   - **cap the span.** A card may not absorb more than a handful of source lines; the observed worst
     case spanned 109.
   - **stop at a boundary.** A blank line, an ALL-CAPS heading or a numbered heading ends the join
     regardless of what the text looks like. Note that `contentItemsToLines` currently _drops_
     whitespace-only lines, so the strongest boundary in her notes never reaches the parser — carrying
     it through as a marker is a legitimate part of fixing this.

   Two tests carry this: a ten-line definition wrapped at an awkward point becomes **one** card, and a
   lowercase line that genuinely begins a `term: definition` still becomes its **own** card. Add a
   third: a `term: definition` followed by `NEXT SECTION HEADING` stays two entries, which is the
   smallest repro of the failure above.

   **The corollary, which is a test of its own:** a line whose separator the term rules _rejected_ —
   `"Note: she reported: pain"`, or a long sentence with a colon — is an anchor too, and must not be
   swept onto the end of the card above it. Without that, a plausible-looking parse produced an answer
   reading `"ascorbic acid Note: she reported: pain"`. Tested in
   `parse — case 3`, both for the filler-word and the length rejection.

   **One narrow exception:** a line ending in a hyphen starts the next card even when the line below
   begins a `term: definition`, because `"self-"` + `"esteem: a sense of worth"` is one word split by a
   line break. That is the only place a card-start line is joined, and the trailing hyphen is the
   evidence.

## How

- Import from `@/test/render` for component tests, not from `@testing-library/react` directly.
- Co-locate: `lib/sm2.ts` → `lib/sm2.test.ts`.
- Always inject time. `new Date()` inside a pure function makes it untestable and is a bug.
- Test names describe behaviour, not implementation: `"floors ease factor at 1.3 after repeated
failures"`, not `"test 3"`.

## Check

```bash
npm run test:run
npm run test:coverage
```

Report failures honestly. A test that had to be weakened to pass is a defect report, not a fix.

## Do not

- Do not skip, `.only`, or comment out a failing test to get a green run.
- Do not mock Dexie for pure-function tests — pure functions should not need it. If one does, the
  function is not pure; move the I/O out.
- Do not chase coverage on UI files to raise the number.
