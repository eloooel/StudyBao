import { describe, expect, it } from 'vitest'

import { MS_PER_DAY, STUDY_DAY_ROLLOVER_HOUR, studyDayStart, studyDaysBetween } from './study-day'

/**
 * The 04:00 study-day boundary (docs/BUILD_GUIDE.md §2 decision #10).
 *
 * This module has exactly one consumer today (the scheduler) and one tomorrow (the streak
 * logic). The tests below are the specification: the boundary, the rollover hour, and the
 * deliberate 3am behaviour.
 *
 * All times are constructed from local calendar parts so the expectations hold in whatever
 * zone the suite runs in.
 */

function local(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): number {
  return new Date(year, month, day, hour, minute, second, ms).getTime()
}

describe('studyDayStart', () => {
  it('returns 04:00 local on the same calendar day for a midday timestamp', () => {
    const start = studyDayStart(local(2026, 8, 21, 12, 30))

    expect(start).toBe(local(2026, 8, 21, STUDY_DAY_ROLLOVER_HOUR))
  })

  it('treats an hour before the rollover as the previous study day', () => {
    // 03:00 on the 22nd is still the study day that began at 04:00 on the 21st.
    const start = studyDayStart(local(2026, 8, 22, 3, 0))

    expect(start).toBe(local(2026, 8, 21, STUDY_DAY_ROLLOVER_HOUR))
  })

  it('rolls over exactly at 04:00, not a millisecond before or after', () => {
    expect(studyDayStart(local(2026, 8, 22, 3, 59, 59, 999))).toBe(
      local(2026, 8, 21, STUDY_DAY_ROLLOVER_HOUR),
    )
    expect(studyDayStart(local(2026, 8, 22, 4, 0, 0, 0))).toBe(
      local(2026, 8, 22, STUDY_DAY_ROLLOVER_HOUR),
    )
  })

  it('treats local midnight as the previous study day, not the new one', () => {
    const start = studyDayStart(local(2026, 8, 22, 0, 0))

    expect(start).toBe(local(2026, 8, 21, STUDY_DAY_ROLLOVER_HOUR))
  })

  it('crosses a month boundary', () => {
    expect(studyDayStart(local(2026, 8, 1, 2, 0))).toBe(local(2026, 7, 31, STUDY_DAY_ROLLOVER_HOUR))
  })

  it('crosses a year boundary', () => {
    expect(studyDayStart(local(2027, 0, 1, 1, 0))).toBe(
      local(2026, 11, 31, STUDY_DAY_ROLLOVER_HOUR),
    )
  })

  it('crosses a leap day', () => {
    // 2028 is a leap year, so 2028-03-01 02:00 belongs to 2028-02-29.
    expect(studyDayStart(local(2028, 2, 1, 2, 0))).toBe(local(2028, 1, 29, STUDY_DAY_ROLLOVER_HOUR))
  })

  it('is idempotent: the start of a study day is itself', () => {
    const start = studyDayStart(local(2026, 8, 21, 23, 50))

    expect(studyDayStart(start)).toBe(start)
  })

  it('is never later than the timestamp it was given', () => {
    for (const hour of [0, 3, 4, 5, 12, 23]) {
      const at = local(2026, 8, 21, hour)
      expect(studyDayStart(at)).toBeLessThanOrEqual(at)
    }
  })

  it('is at most 24 hours earlier than its input', () => {
    for (const hour of [0, 3, 4, 5, 12, 23]) {
      const at = local(2026, 8, 21, hour)
      expect(at - studyDayStart(at)).toBeLessThan(MS_PER_DAY)
    }
  })
})

describe('studyDaysBetween', () => {
  it('counts 1 for consecutive study days', () => {
    expect(studyDaysBetween(local(2026, 8, 21, 10), local(2026, 8, 22, 10))).toBe(1)
  })

  it('counts 0 within one study day, even across midnight', () => {
    // 23:00 to 03:00 the next calendar day is still the same study day.
    expect(studyDaysBetween(local(2026, 8, 21, 23), local(2026, 8, 22, 3))).toBe(0)
  })

  it('counts the rollover as a day, not 23 hours', () => {
    expect(studyDaysBetween(local(2026, 8, 21, 23), local(2026, 8, 22, 4))).toBe(1)
  })

  it('is negative when the second timestamp precedes the first', () => {
    expect(studyDaysBetween(local(2026, 8, 22, 10), local(2026, 8, 21, 10))).toBe(-1)
  })

  it('counts the exam-relevant range correctly', () => {
    // The 3-day gap a 3-day interval produces, measured across a month boundary.
    expect(studyDaysBetween(local(2026, 7, 30, 20), local(2026, 8, 2, 5))).toBe(3)
  })
})
