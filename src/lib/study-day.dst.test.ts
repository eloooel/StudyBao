// Set BEFORE any Date is constructed, so the engine picks up the zone at first use. This is why
// the assignment is above the imports that do date work — and it is a static import, so this line
// runs before `study-day` is evaluated.
process.env.TZ = 'Europe/London'

import { describe, expect, it } from 'vitest'

import { MS_PER_DAY } from './time'
import { STUDY_DAY_ROLLOVER_HOUR, addStudyDays, studyDayStart } from './study-day'

/**
 * The DST half of the study-day contract, which the main suite cannot reach.
 *
 * `src/lib/study-day.test.ts` asserts the properties that hold in any zone, including the one CI
 * runs in. But the reason day-scale intervals use calendar arithmetic rather than
 * `studyDayStart(t) + n × MS_PER_DAY` is specifically the hour that a fixed offset loses or gains
 * across a transition — and in a zone with no DST that bug is invisible, so no assertion in the
 * default zone can catch a regression.
 *
 * This file pins the zone to `Europe/London`, where the transitions are real. It is deliberately a
 * separate file: `process.env.TZ` has to be set before the engine first uses a local date, so it
 * cannot be set part-way through another test file, and Vitest gives each file its own module
 * registry and environment.
 */
describe('study days across a DST transition', () => {
  it('is running in the pinned DST zone, or these assertions prove nothing', () => {
    // If the assignment above ever stops taking effect, every test below silently becomes a
    // duplicate of the default-zone suite. Fail loudly instead.
    const offsetJan = new Date(2027, 0, 15, 12).getTimezoneOffset()
    const offsetJul = new Date(2027, 6, 15, 12).getTimezoneOffset()

    expect(offsetJan).not.toBe(offsetJul)
  })

  it('lands on 04:00 across spring forward, where a fixed offset lands at 05:00', () => {
    // Europe/London moves the clocks forward in the early hours of 2027-03-28.
    const dayBefore = new Date(2027, 2, 27, 12).getTime()

    const result = addStudyDays(dayBefore, 1)

    expect(new Date(result).getHours()).toBe(STUDY_DAY_ROLLOVER_HOUR)
    expect(new Date(result).getDate()).toBe(28)
    // The day is 23 hours long, which is exactly why a fixed 24-hour offset is wrong.
    expect(result - studyDayStart(dayBefore)).toBe(23 * 60 * 60 * 1000)
  })

  it('lands on 04:00 across fall back, where a fixed offset lands at 03:00', () => {
    // Europe/London moves the clocks back in the early hours of 2027-10-31. 03:00 is the previous
    // study day, which would make a "1 day" interval come due a day early.
    const dayBefore = new Date(2027, 9, 30, 12).getTime()

    const result = addStudyDays(dayBefore, 1)

    expect(new Date(result).getHours()).toBe(STUDY_DAY_ROLLOVER_HOUR)
    expect(new Date(result).getDate()).toBe(31)
    expect(result - studyDayStart(dayBefore)).toBe(25 * 60 * 60 * 1000)
  })

  it('keeps every interval on the boundary across both transitions', () => {
    for (const from of [
      new Date(2027, 2, 27, 23, 50).getTime(),
      new Date(2027, 9, 30, 23, 50).getTime(),
    ]) {
      for (const days of [1, 2, 6, 15, 21]) {
        const result = addStudyDays(from, days)
        expect(new Date(result).getHours()).toBe(STUDY_DAY_ROLLOVER_HOUR)
        expect(result).toBe(studyDayStart(result))
      }
    }
  })

  it('shows the defect the calendar form exists to prevent', () => {
    // A direct assertion that the old formula was wrong here, so the reason for this file is
    // recorded as a test rather than only as a comment.
    const dayBeforeFallBack = new Date(2027, 9, 30, 12).getTime()
    const fixedOffset = studyDayStart(dayBeforeFallBack) + MS_PER_DAY

    expect(new Date(fixedOffset).getHours()).toBe(3)
    expect(new Date(addStudyDays(dayBeforeFallBack, 1)).getHours()).toBe(4)
  })
})
