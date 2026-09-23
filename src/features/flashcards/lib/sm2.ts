import type { Grade } from '@/db/types'
import { studyDayStart } from '@/lib/study-day'
import { MS_PER_DAY, MS_PER_MINUTE } from '@/lib/time'
/**
 * SM-2 with sub-day learning steps.
 *
 * Pure: `schedule(state, grade, now)` returns a new state and touches nothing else.
 * `now` is always injected — a `Date.now()` inside here would make the whole scheduler
 * untestable, and a wrong interval is invisible until her exam
 * (docs/ai/write-tests.md, docs/adr/0003-sm2-scheduler-and-learning-steps.md).
 *
 * The contract, which is not negotiable:
 *
 * - Grades are Again 0, Hard 3, Good 4, Easy 5.
 * - The ease factor is updated on **every** grade, learning steps included, then floored
 *   at 1.3. Hard during a learning step genuinely is evidence of difficulty.
 * - `learningStep` is an index into `LEARNING_STEPS_MINUTES`, or `null` once graduated.
 *   A new card starts on step 0. See the note below on what the index names.
 * - `repetitions` counts **graduated** reviews only. The learning steps do not increment
 *   it, which is what makes "Good four times" land on 15 days rather than 6
 *   (docs/BUILD_GUIDE.md §8, the Workflow B definition of done).
 * - A lapse zeroes `intervalDays` as well as `repetitions`. Leaving a stale 38-day
 *   interval in place would make a just-failed card report as mastered, since mastery is
 *   `intervalDays >= 21`.
 * - Every returned `nextReview` is strictly in the future.
 *
 * Day-scale intervals snap to the **start of the target study day**, not to `now + n
 * days`. A card graded at 23:50 with a 1-day interval is due the next 04:00 — i.e. inside
 * her next session — rather than at 23:50 the following night, which would silently push
 * it a day later for an evening studier. Learning steps stay rolling, because minutes are
 * not a calendar concept.
 */

/** Minutes for each sub-day learning step, in order. Add a step by adding an entry. */
export const LEARNING_STEPS_MINUTES = [1, 10] as const

/**
 * Index into {@link LEARNING_STEPS_MINUTES}, or `null` once the card has graduated.
 *
 * **The index names the step the card is waiting on, not the step it has just completed.**
 * So `learningStep: 0` means "due in 1 minute" and `learningStep: 1` means "due in 10
 * minutes". Together with `nextReview` (which is the absolute time) and `lastReviewedAt`
 * (which is when a review happened) the state is unambiguous, and it stays the *whole*
 * input to `schedule` — a scheduler whose result depended on how long ago the card was
 * graded would not be a pure function of its state.
 *
 * A consequence worth knowing: a brand-new card is due a minute after it is created rather
 * than the instant it is, so the very first press starts the learning ladder. That is
 * intended — it is how a card seen for the first time behaves like one.
 *
 * Typed as an index into the array rather than `0 | 1` so that adding a third step is a
 * one-line change with no migration, and so the type says what the number means.
 */
export type LearningStep = number | null

/** The step index a new or lapsed card returns to. */
export const FIRST_LEARNING_STEP = 0

export const EASE_FACTOR_DEFAULT = 2.5
export const EASE_FACTOR_FLOOR = 1.3

/**
 * Decimal places the ease factor is kept to.
 *
 * The update is accumulated float arithmetic, so without this the stored value drifts:
 * `2.5 - 0.9` is `1.7000000000000002`, and after a few reviews the number in her database
 * is noise. Rounding to six places is far finer than any scheduling decision needs and
 * makes the value both readable in an export and exactly assertable in a test.
 */
const EASE_FACTOR_PRECISION = 6

/** "Mature card" boundary. Applied together with `learningStep === null`. */
export const MASTERY_INTERVAL_DAYS = 21

const AGAIN_QUALITY = 0
const HARD_QUALITY = 3

/** The scheduler's whole input. A card's SM-2 fields, and nothing UI-shaped. */
export interface SchedulerState {
  easeFactor: number
  intervalDays: number
  repetitions: number
  lapses: number
  learningStep: LearningStep
  lastReviewedAt?: number
}

/** What `schedule` returns: the next state, when it is due, and whether it is mature. */
export interface ScheduleResult extends SchedulerState {
  /** Epoch ms. Always `> now`. */
  nextReview: number
  /** Derived, never stored. See {@link isMastered}. */
  mastered: boolean
}

/**
 * The next state after grading a card.
 *
 * @param state the card's current SM-2 state
 * @param grade Again 0 · Hard 3 · Good 4 · Easy 5
 * @param now epoch ms, injected
 */
export function schedule(state: SchedulerState, grade: Grade, now: number): ScheduleResult {
  const easeFactor = clampEaseFactor(applyEaseFactorDelta(state.easeFactor, grade))
  const inLearning = state.learningStep !== null

  const outcome =
    grade === AGAIN_QUALITY
      ? lapseOutcome(now)
      : inLearning
        ? learningOutcome(state, grade, easeFactor, now)
        : graduatedOutcome(state, easeFactor, now)

  const nextReview = clampToFuture(outcome.nextReview, now)

  return {
    easeFactor,
    intervalDays: outcome.intervalDays,
    repetitions: outcome.repetitions,
    lapses: state.lapses + outcome.lapseIncrement,
    learningStep: outcome.learningStep,
    lastReviewedAt: now,
    nextReview,
    mastered: isMastered({
      intervalDays: outcome.intervalDays,
      learningStep: outcome.learningStep,
    }),
  }
}

/** A fresh card's state: 2.5 ease, waiting on the first learning step, never reviewed. */
export function newCardState(): SchedulerState {
  return {
    easeFactor: EASE_FACTOR_DEFAULT,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    learningStep: FIRST_LEARNING_STEP,
    lastReviewedAt: undefined,
  }
}

/**
 * Mature, i.e. durably known rather than merely tapped through.
 *
 * `learningStep === null` is part of the predicate, not a redundant guard: a card
 * mid-learning has `intervalDays === 0`, so without it a card that had just been pushed
 * back to a 1-minute step could never be mastered — but the conjunction also means no
 * future path can mark a card mastered while it is still being re-learned.
 *
 * Derived on read. Deliberately not a stored field: it is a function of two other fields,
 * and a stored copy is a third thing to keep in sync.
 */
export function isMastered(state: Pick<SchedulerState, 'intervalDays' | 'learningStep'>): boolean {
  return state.learningStep === null && state.intervalDays >= MASTERY_INTERVAL_DAYS
}

/**
 * `EF' = EF + (0.1 − (5−q) × (0.08 + (5−q) × 0.02))`. Every grade, including failures.
 *
 * This is transcribed from docs/BUILD_GUIDE.md §6 and ADR 0003 character for character,
 * including the nested `+`, because the sign of that inner term is the whole shape of the
 * curve. It yields deltas of **Again −0.80 · Hard −0.14 · Good 0.00 · Easy +0.10**, which
 * is what makes the floor reachable and the three passing grades ordered.
 *
 * The delta is rounded before it is added, not only afterwards, because IEEE-754 puts
 * residue in the expression itself: for q=0 it evaluates to 0.7999999999999999, so the raw
 * sum is 1.7000000000000002 rather than the 1.7 the formula states.
 */
export function applyEaseFactorDelta(easeFactor: number, grade: Grade): number {
  const q = grade
  const delta = roundTo(0.1 - (5 - q) * (0.08 + (5 - q) * 0.02), EASE_FACTOR_PRECISION)
  return roundTo(easeFactor + delta, EASE_FACTOR_PRECISION)
}

export function clampEaseFactor(easeFactor: number): number {
  return roundTo(Math.max(EASE_FACTOR_FLOOR, easeFactor), EASE_FACTOR_PRECISION)
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/** Where a card with a whole-day interval is next due: the start of that study day. */
export function nextReviewForIntervalDays(intervalDays: number, now: number): number {
  return studyDayStart(now) + intervalDays * MS_PER_DAY
}

/**
 * When a brand-new card is first due: after the first learning step.
 *
 * Exported so the repository does not reimplement the rule when it creates a card. A second
 * copy of "how long is the first step" is exactly the kind of duplication that ends up
 * disagreeing with the scheduler.
 */
export function firstReviewAt(now: number): number {
  return now + learningStepMinutes(FIRST_LEARNING_STEP) * MS_PER_MINUTE
}

interface Outcome {
  intervalDays: number
  repetitions: number
  learningStep: LearningStep
  nextReview: number
  /** 1 for a lapse, 0 otherwise. */
  lapseIncrement: number
}

/**
 * Again. Resets to the first learning step, records a lapse, and zeroes the interval so
 * the card cannot report as mastered while it is being re-learned.
 */
function lapseOutcome(now: number): Outcome {
  return {
    intervalDays: 0,
    repetitions: 0,
    learningStep: FIRST_LEARNING_STEP,
    nextReview: now + learningStepMinutes(FIRST_LEARNING_STEP) * MS_PER_MINUTE,
    lapseIncrement: 1,
  }
}

/**
 * Hard, Good or Easy while the card is still on a sub-day step.
 *
 * Hard repeats the current step without advancing — it is a failure to move forward, and
 * treating it as progress is how a card graduates on difficulty alone. Easy graduates
 * immediately, and its reward is the ease-factor increase: it deliberately does **not**
 * get a longer graduating interval than Good, because a card she has seen twice should
 * not jump several days ahead of schedule.
 */
function learningOutcome(
  state: SchedulerState,
  grade: Grade,
  easeFactor: number,
  now: number,
): Outcome {
  const step = state.learningStep as number

  if (grade === HARD_QUALITY) {
    return {
      intervalDays: 0,
      repetitions: 0,
      learningStep: step,
      nextReview: now + learningStepMinutes(step) * MS_PER_MINUTE,
      lapseIncrement: 0,
    }
  }

  const nextStep = step + 1
  const hasAnotherStep = nextStep < LEARNING_STEPS_MINUTES.length

  if (hasAnotherStep) {
    return {
      intervalDays: 0,
      repetitions: 0,
      learningStep: nextStep,
      nextReview: now + learningStepMinutes(nextStep) * MS_PER_MINUTE,
      lapseIncrement: 0,
    }
  }

  return graduatedOutcome(state, easeFactor, now)
}

/**
 * Good or Easy on a card that has graduated (or has just passed its last learning step).
 *
 * The interval comes from the **updated** ease factor, not the previous one. That ordering
 * is what makes Hard always schedule sooner than Good and Good sooner than Easy: with the
 * old factor all three would agree whenever the two states had the same repetition count.
 * It is asserted directly in the tests.
 */
function graduatedOutcome(state: SchedulerState, easeFactor: number, now: number): Outcome {
  const repetitions = state.repetitions + 1
  const intervalDays = intervalForRepetitions(repetitions, state.intervalDays, easeFactor)

  return {
    intervalDays,
    repetitions,
    learningStep: null,
    nextReview: nextReviewForIntervalDays(intervalDays, now),
    lapseIncrement: 0,
  }
}

/**
 * 1 day, then 6 days, then `round(previous × EF)` with a minimum of one day.
 *
 * The minimum is what stops a low ease factor from scheduling a card for today, and it is
 * why the "strictly in the future" clamp below should never have to fire for a day-scale
 * interval.
 */
export function intervalForRepetitions(
  repetitions: number,
  previousIntervalDays: number,
  easeFactor: number,
): number {
  if (repetitions <= 1) return 1
  if (repetitions === 2) return 6
  return Math.max(1, Math.round(previousIntervalDays * easeFactor))
}

/** The delay for a step index. Out-of-range falls back to the last step, never to 0. */
function learningStepMinutes(step: number): number {
  return (
    LEARNING_STEPS_MINUTES[step] ??
    LEARNING_STEPS_MINUTES.reduce((longest, minutes) => Math.max(longest, minutes), 0)
  )
}

/**
 * Guarantee `nextReview > now`.
 *
 * Every branch above already satisfies this, so this is an invariant guard rather than
 * live logic: a card that could be due the instant it was graded would be re-served inside
 * the same session, and the loop would never end. `docs/ai/write-tests.md` requires the
 * invariant, so it is enforced rather than assumed.
 */
function clampToFuture(nextReview: number, now: number): number {
  return nextReview > now ? nextReview : now + 1
}
