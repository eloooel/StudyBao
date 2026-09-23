import { describe, expect, it } from 'vitest'

import { GRADE_AGAIN, GRADE_EASY, GRADE_GOOD, GRADE_HARD, type Grade } from '@/db/types'
import { studyDayStart } from '@/lib/study-day'
import { MS_PER_DAY, MS_PER_MINUTE } from '@/lib/time'
import {
  EASE_FACTOR_DEFAULT,
  EASE_FACTOR_FLOOR,
  MASTERY_INTERVAL_DAYS,
  newCardState,
  schedule,
  type ScheduleResult,
  type SchedulerState,
} from './sm2'

/**
 * The SM-2 contract (docs/ai/write-tests.md, docs/BUILD_GUIDE.md §6, ADR 0003).
 *
 * Every test injects `now`. Nothing here reads a real clock, so a failure always means the
 * algorithm is wrong rather than that the test ran near midnight. Where an expected number
 * is written down, the arithmetic that produces it is in a comment — these numbers are the
 * point of the file, and a reader has to be able to check them.
 */

// 10:00 local on a Monday. Local rather than UTC because the 04:00 study-day boundary is a
// fact about her wall clock, and a UTC literal would test a different rule.
const NOW = new Date(2026, 8, 21, 10, 0, 0, 0).getTime()
const TODAY_START = studyDayStart(NOW)

function state(overrides: Partial<SchedulerState> = {}): SchedulerState {
  return { ...newCardState(), ...overrides }
}

/** Grades many times in a row from one starting state, advancing `now` by each result. */
function gradeRepeatedly(
  initial: SchedulerState,
  grades: readonly Grade[],
  startAt = NOW,
): { final: ScheduleResult; all: ScheduleResult[] } {
  let current = initial
  let at = startAt
  const all: ScheduleResult[] = []

  for (const grade of grades) {
    const result = schedule(current, grade, at)
    all.push(result)
    current = result
    at = result.nextReview
  }

  return { final: all[all.length - 1]!, all }
}

describe('SM-2 · learning steps', () => {
  it('puts a new card on the first sub-day step, not on a one-day interval', () => {
    const result = schedule(state(), GRADE_GOOD, NOW)

    // `learningStep` names the step the card is now waiting on, so Good off step 0 puts it
    // on the 10-minute step. It is never given a day-scale interval while learning.
    expect(result.learningStep).toBe(1)
    expect(result.intervalDays).toBe(0)
    expect(result.repetitions).toBe(0)
    expect(result.nextReview).toBe(NOW + 10 * MS_PER_MINUTE)
  })

  it('graduates off the 10-minute step rather than stepping nowhere', () => {
    const result = schedule(state({ learningStep: 1 }), GRADE_GOOD, NOW)

    expect(result.learningStep).toBeNull()
    expect(result.intervalDays).toBe(1)
    expect(result.repetitions).toBe(1)
  })

  it('repeats the current step on Hard without advancing it', () => {
    const first = schedule(state(), GRADE_HARD, NOW)
    expect(first.learningStep).toBe(0)
    expect(first.nextReview).toBe(NOW + MS_PER_MINUTE)

    const second = schedule(state({ learningStep: 1 }), GRADE_HARD, NOW)
    expect(second.learningStep).toBe(1)
    expect(second.nextReview).toBe(NOW + 10 * MS_PER_MINUTE)
  })

  it('sends a card back to the 1-minute step on Again, and records a lapse', () => {
    const result = schedule(state({ learningStep: 1 }), GRADE_AGAIN, NOW)

    expect(result.learningStep).toBe(0)
    expect(result.lapses).toBe(1)
    expect(result.intervalDays).toBe(0)
    expect(result.nextReview).toBe(NOW + MS_PER_MINUTE)
  })

  it('graduates on Easy and Good by the same path, with no longer interval for Easy', () => {
    const graduating = state({ learningStep: 1 })
    const onGood = schedule(graduating, GRADE_GOOD, NOW)
    const onEasy = schedule(graduating, GRADE_EASY, NOW)

    expect(onGood.learningStep).toBeNull()
    expect(onEasy.learningStep).toBeNull()
    expect(onGood.intervalDays).toBe(1)
    expect(onEasy.intervalDays).toBe(1)
    expect(onEasy.nextReview).toBe(onGood.nextReview)
    // Easy's reward is the ease factor, not a longer first interval.
    expect(onEasy.easeFactor).toBeGreaterThan(onGood.easeFactor)
  })
})

describe('SM-2 · graduation and day-scale intervals', () => {
  it('schedules 1 day, then 6, then round(previous x EF)', () => {
    // Each review happens when the card is due, so EF climbs on the EASY grades at the end
    // and the intervals compound: 15, then round(15 x 2.6) = 39, then round(39 x 2.7) = 105,
    // then round(105 x 2.8) = 294.
    const { all } = gradeRepeatedly(state(), [
      GRADE_GOOD,
      GRADE_GOOD,
      GRADE_GOOD,
      GRADE_GOOD,
      GRADE_EASY,
      GRADE_EASY,
      GRADE_EASY,
    ])

    expect(all.map((result) => result.intervalDays)).toEqual([0, 1, 6, 15, 39, 105, 294])
  })

  it('lands a card graded Good four times on 15 days, not 6', () => {
    // The Workflow B definition of done, and the counterexample that fixes the meaning of
    // `repetitions`: if the learning steps incremented it, the fourth Good would give 6 days
    // and the DoD would fail. Good (q=4) leaves EF unchanged at 2.5, so round(6 x 2.5) = 15.
    const { final, all } = gradeRepeatedly(state(), [
      GRADE_GOOD,
      GRADE_GOOD,
      GRADE_GOOD,
      GRADE_GOOD,
    ])

    // Two learning steps, then 1 day, then 6, then 15.
    expect(all.map((result) => result.learningStep)).toEqual([1, null, null, null])
    expect(final.intervalDays).toBe(15)
    expect(final.easeFactor).toBe(EASE_FACTOR_DEFAULT)
    expect(final.learningStep).toBeNull()
    expect(final.repetitions).toBe(3)
  })

  it('snaps a day-scale interval to the start of the study day', () => {
    // Late evening: a rolling interval would land at 23:50 tomorrow and be missed by her
    // next evening session, silently gaining a day.
    const lateEvening = new Date(2026, 8, 21, 23, 50, 0, 0).getTime()
    const graduated = state({ learningStep: 1 })

    const result = schedule(graduated, GRADE_GOOD, lateEvening)

    expect(result.intervalDays).toBe(1)
    expect(result.nextReview).toBe(studyDayStart(lateEvening) + MS_PER_DAY)
    expect(new Date(result.nextReview).getHours()).toBe(4)
  })

  it('is due an hour later when a full day is added from 03:00, because that is yesterday', () => {
    // Deliberate, not a bug: the 04:00 rollover means a 3am session is still the previous
    // study day, so a 1-day interval from it is due at 04:00 — one hour later.
    const threeAm = new Date(2026, 8, 22, 3, 0, 0, 0).getTime()

    const result = schedule(state({ learningStep: 1 }), GRADE_EASY, threeAm)

    expect(result.intervalDays).toBe(1)
    expect(result.nextReview).toBe(studyDayStart(threeAm) + MS_PER_DAY)
    expect(result.nextReview - threeAm).toBeLessThan(MS_PER_DAY)
  })

  it('multiplies by the previous interval once repetitions exceed two', () => {
    const graduated = state({
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      learningStep: null,
      lastReviewedAt: NOW - MS_PER_DAY,
    })

    const result = schedule(graduated, GRADE_GOOD, NOW)

    // EF stays 2.5 on Good, so round(6 x 2.5) = 15.
    expect(result.intervalDays).toBe(15)
    expect(result.repetitions).toBe(3)
  })

  it('sets a lapsed card back to 0 days so it cannot report as mastered', () => {
    const mature = state({
      easeFactor: 2.5,
      intervalDays: 38,
      repetitions: 4,
      learningStep: null,
      lastReviewedAt: NOW - 38 * MS_PER_DAY,
    })

    const result = schedule(mature, GRADE_AGAIN, NOW)

    expect(result.intervalDays).toBe(0)
    expect(result.repetitions).toBe(0)
    expect(result.mastered).toBe(false)
  })
})

describe('SM-2 · ease factor', () => {
  it('floors the ease factor at 1.3, asserting the exact sequence', () => {
    // Again is q=0, and the spec formula gives 0.1 - 5 x (0.08 + 5 x 0.02) = -0.80, so the
    // sequence is 2.5 -> 1.7 -> 1.3 (clamped) -> 1.3: the floor is reached on the second
    // failure, not the third. Asserting the whole sequence pins the clamp point, which
    // "after ten Again grades it is 1.3" would not.
    const { all } = gradeRepeatedly(state(), [GRADE_AGAIN, GRADE_AGAIN, GRADE_AGAIN, GRADE_AGAIN])
    const factors = all.map((result) => result.easeFactor)

    // Literals on purpose: expressions here would move with EASE_FACTOR_DEFAULT and could
    // keep passing after a formula change.
    expect(factors).toEqual([1.7, EASE_FACTOR_FLOOR, EASE_FACTOR_FLOOR, EASE_FACTOR_FLOOR])
    expect(factors[0]).toBe(EASE_FACTOR_DEFAULT - 0.8)
  })

  it('updates the ease factor on every grade, learning steps included', () => {
    // Hard is q=3, so the delta is 0.1 - 2 x (0.08 + 2 x 0.02) = -0.14.
    const onLearningStep = schedule(state({ learningStep: 1 }), GRADE_HARD, NOW)
    expect(onLearningStep.learningStep).toBe(1)
    expect(onLearningStep.easeFactor).toBe(2.36)

    const onAgain = schedule(state(), GRADE_AGAIN, NOW)
    expect(onAgain.easeFactor).toBe(1.7)
  })

  it('applies exactly +0.1 for Easy, +0.0 for Good and -0.14 for Hard', () => {
    const graduated = state({
      intervalDays: 6,
      repetitions: 2,
      learningStep: null,
      lastReviewedAt: NOW - MS_PER_DAY,
    })

    expect(schedule(graduated, GRADE_EASY, NOW).easeFactor).toBe(2.6)
    expect(schedule(graduated, GRADE_GOOD, NOW).easeFactor).toBe(2.5)
    expect(schedule(graduated, GRADE_HARD, NOW).easeFactor).toBe(2.36)
  })

  it('gives Easy a strictly longer interval than Good, and Good than Hard', () => {
    // The same starting state, so the only difference is the grade and its ease-factor
    // delta. This is why the interval is computed from the *updated* factor.
    const graduated = state({
      intervalDays: 6,
      repetitions: 2,
      learningStep: null,
      lastReviewedAt: NOW - MS_PER_DAY,
    })

    const easy = schedule(graduated, GRADE_EASY, NOW).intervalDays
    const good = schedule(graduated, GRADE_GOOD, NOW).intervalDays
    const hard = schedule(graduated, GRADE_HARD, NOW).intervalDays

    expect(easy).toBeGreaterThan(good)
    expect(good).toBeGreaterThan(hard)
  })
})

describe('SM-2 · invariants', () => {
  const everyGrade: readonly Grade[] = [GRADE_AGAIN, GRADE_HARD, GRADE_GOOD, GRADE_EASY]

  it.each(everyGrade)(
    'always schedules nextReview strictly in the future for grade %i',
    (grade) => {
      const inputs: SchedulerState[] = [
        state(), // brand new
        state({ learningStep: 1 }),
        state({ intervalDays: 1, repetitions: 1, learningStep: null }),
        state({ intervalDays: 400, repetitions: 9, easeFactor: 1.3, learningStep: null }),
        state({ intervalDays: 38, repetitions: 4, learningStep: null, lapses: 7 }),
      ]

      for (const input of inputs) {
        const result = schedule(input, grade, NOW)
        expect(result.nextReview).toBeGreaterThan(NOW)
      }
    },
  )

  it('is deterministic for a given state, grade and now', () => {
    const input = state({ intervalDays: 6, repetitions: 2, learningStep: null })

    expect(schedule(input, GRADE_GOOD, NOW)).toEqual(schedule(input, GRADE_GOOD, NOW))
  })

  it('does not mutate the state it was given', () => {
    const input = state()
    const snapshot = { ...input }

    schedule(input, GRADE_AGAIN, NOW)

    expect(input).toEqual(snapshot)
  })

  it('reports mastery only at 21 days or more, and never while still learning', () => {
    expect(
      schedule(state({ intervalDays: 6, repetitions: 2, learningStep: null }), GRADE_GOOD, NOW)
        .mastered,
    ).toBe(false) // 15 days, just under the boundary

    // Cross it. Four Goods reach 15 days, then Easy compounds: round(15 x 2.6) = 39.
    const toMature = gradeRepeatedly(state(), [
      GRADE_GOOD,
      GRADE_GOOD,
      GRADE_GOOD,
      GRADE_GOOD,
      GRADE_EASY,
    ])
    expect(toMature.all.map((result) => result.intervalDays)).toEqual([0, 1, 6, 15, 39])
    expect(toMature.final.easeFactor).toBe(2.6)
    expect(toMature.final.intervalDays).toBeGreaterThanOrEqual(MASTERY_INTERVAL_DAYS)
    expect(toMature.final.mastered).toBe(true)

    // A card mid-learning is never mature, whatever its rep count.
    expect(schedule(state({ learningStep: 1 }), GRADE_EASY, NOW).mastered).toBe(false)
  })

  it('does not increment repetitions on the learning steps', () => {
    const { final } = gradeRepeatedly(state(), [GRADE_GOOD, GRADE_GOOD])

    expect(final.learningStep).toBeNull()
    expect(final.repetitions).toBe(1)
  })

  it('stamps lastReviewedAt from the injected now', () => {
    expect(schedule(state(), GRADE_GOOD, NOW).lastReviewedAt).toBe(NOW)
  })

  it('schedules a card with a corrupted negative interval to at least one day', () => {
    const corrupted = state({ intervalDays: -5, repetitions: 5, learningStep: null })

    const result = schedule(corrupted, GRADE_GOOD, NOW)

    expect(result.intervalDays).toBe(1)
    expect(result.nextReview).toBe(TODAY_START + MS_PER_DAY)
  })
})
