# Write tests

Add or fix tests. This repo tests _rules_, not rendering.

## What must be tested (non-negotiable)

These are pure functions whose bugs are silent and whose consequences she feels for weeks:

| Module                              | Why it is critical                                                 |
| ----------------------------------- | ------------------------------------------------------------------ |
| `features/flashcards/lib/sm2.ts`    | A wrong interval is invisible until her exam.                      |
| `features/flashcards/lib/parser.ts` | Silent data loss: a dropped note line is a card she never reviews. |
| `sync/lib/merge.ts`                 | A wrong merge resurrects deleted cards or discards edits.          |
| `features/timer/lib/timer.ts`       | Wall-clock math; a bug means the timer lies about remaining time.  |
| `features/dashboard/lib/stats.ts`   | Streak/mastery math she will act on.                               |

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

Write these before the UI:

1. A new card graded **Good** graduates 1 day → 6 days → `round(6 × EF)`.
2. A new card graded **Again** does not jump to 1 day; it re-enters a sub-day learning step and
   increments `lapses`.
3. Ease factor **never falls below 1.3**, even after ten consecutive **Again** grades.
4. Ease factor is updated on _every_ grade, including failures.
5. **Easy** produces a strictly larger ease factor than **Good**, which is strictly larger than
   **Hard**.
6. `nextReview` is always strictly in the future (no card can be scheduled in the past).
7. Grading is deterministic given `(state, grade, now)` — assert against a fixed injected `now`,
   never against the real clock.

## Parser test cases that must exist

1. `Term: Definition` becomes one card with correct front/back.
2. `self-esteem` and `post-operative` are **not** split as `Term - Definition`.
3. A prose sentence containing a colon is not turned into a card.
4. Numbered `Q1./A1.` blocks pair correctly, in order.
5. Bulleted definitions become cards.
6. **Everything not matched appears in the leftover queue.** Assert the invariant explicitly: for any
   input, `cards.length + leftoverLines.length` accounts for every non-empty input line.

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
