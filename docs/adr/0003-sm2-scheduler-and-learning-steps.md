# ADR 0003 — SM-2 with sub-day learning steps, and epoch-millisecond scheduling

- **Status:** Accepted
- **Date:** 2026-02 (planning)
- **Supersedes:** the date-only `nextReview <= today` scheduling in the original build guide

## Context

The original model stored `nextReview` as a date and pulled due cards with `nextReview <= today`. Two
problems:

1. **Date-only scheduling means a one-day minimum interval.** A brand-new card graded "Again"
   disappears for 24 hours. That is the worst possible behaviour for a cram-style study app and the
   main reason home-grown spaced-repetition apps feel bad to use.
2. **Date strings break at boundaries.** Comparing a date string to "today" is ambiguous across
   timezones and at midnight, and it cannot express anything finer than a day.

Additionally, the original plan asked for a "mastered" threshold of `repetitions >= 3`. That is a
proxy that grading Easy inflates without the card actually being durable.

## Decision

**Custom SM-2, with learning steps and epoch-millisecond scheduling.**

- `nextReview` is **epoch milliseconds**. Due query is `nextReview <= Date.now()`.
- New and lapsed cards go through **sub-day learning steps** (1 min → 10 min) before graduating to
  1 day → 6 days → `round(interval × EF)`.
- Grades map Again = 0, Hard = 3, Good = 4, Easy = 5.
- `EF' = EF + (0.1 − (5−q) × (0.08 + (5−q) × 0.02))`, applied on **every** grade including failures,
  clamped to a floor of **1.3**.
- `q < 3` → `repetitions = 0`, `lapses += 1`, re-enter learning steps. It does **not** get a 1-day
  interval directly.
- **Mastery threshold is `intervalDays >= 21`** (the standard "mature card" boundary), not a
  repetition count.
- Every review appends a **`ReviewLog`** row. Aggregate SM-2 state is not history, and the dashboard's
  weak-topic feature cannot be computed from it.
- A **cram mode** overrides due dates when `examDate` is near, ordering by weakness × staleness.

## Consequences

**Good**

- New cards behave the way flashcards are supposed to behave; short sessions feel productive.
- Timezone handling becomes an explicit display concern rather than a hidden comparison bug.
- Weak-topic detection is actually possible, because the history exists.
- Mature-card mastery cannot be gamed by tapping Easy.

**Bad / cost**

- The scheduler is now meaningfully more complex than textbook SM-2, and it must be unit-tested
  against the boundary cases (see `docs/ai/write-tests.md`).
- A `ReviewLog` row per review grows the database. At this scale (thousands of cards, tens of thousands
  of reviews) it is trivial — roughly single-digit megabytes — but it should be exported to JSON too.
- Cram mode deliberately degrades the spacing schedule during the final sprint. Accepted: passing the
  exam is the objective function, not lifetime retention.

## Alternatives considered

- **Textbook SM-2 with date-only intervals.** Rejected: the day-one experience is bad, and it cannot
  express learning steps at all.
- **Anki's exact scheduler.** Correct but large and highly specific; reimplementing it faithfully is
  more work than the value it adds here.
- **FSRS.** Better retention-per-review than SM-2 and now well documented. Rejected *for v1* on
  complexity, but the `ReviewLog` design intentionally keeps FSRS reachable later — that is a large
  part of why the log exists.
- **A library.** Rejected: the algorithm is ~40 lines, and owning it means we can add cram mode
  coherently rather than bending a library's abstraction.
