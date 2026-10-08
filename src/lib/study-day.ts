/**
 * The study day, and the one place it is defined.
 *
 * A study day rolls over at **04:00 local time, not midnight** (docs/BUILD_GUIDE.md §2
 * decision #10). Reviewing at 1 a.m. must not cost her the streak she just earned, and a
 * 3 a.m. session still belongs to the previous day.
 *
 * **This module is the only implementation of that rule.** The scheduler uses it for
 * day-scale intervals and the streak logic (Workflow F) will use it too. Two copies would
 * eventually disagree, and the failure mode is a streak number that is wrong in a way
 * nobody can reproduce from a bug report.
 *
 * Everything here is a pure function of an explicit `now`, so it is testable without a
 * clock, and it deliberately works in the **device's local zone** — the 04:00 boundary is
 * a fact about her wall clock, not about UTC.
 */

import { MS_PER_DAY } from './time'

export { MS_PER_DAY }

/** Hour at which one study day becomes the next. */
export const STUDY_DAY_ROLLOVER_HOUR = 4

/**
 * The start of the study day that `timestamp` falls in: the most recent 04:00 local at or
 * before it.
 *
 * Built from local calendar parts rather than by subtracting a fixed number of hours,
 * because on a DST transition the elapsed time between two 04:00s is not 24 hours and a
 * fixed offset would land on 03:00 or 05:00. Where there is no DST this is equivalent and
 * costs nothing.
 *
 * Note the consequence, which is intended: at 03:00 the study day started 23 hours ago,
 * so a card given a 1-day interval is due at 04:00 — one hour later. That is the rollover
 * doing its job, and it is asserted explicitly in the tests so it stays deliberate.
 */
export function studyDayStart(timestamp: number): number {
  const date = new Date(timestamp)
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    STUDY_DAY_ROLLOVER_HOUR,
    0,
    0,
    0,
  )

  // Between local midnight and the rollover hour we are still in the previous study day.
  if (date.getTime() < start.getTime()) {
    // `setDate` handles month and year boundaries, and DST, for us.
    start.setDate(start.getDate() - 1)
  }

  return start.getTime()
}

/**
 * How many study days `to` is after `from`. Negative if `to` precedes `from`.
 *
 * Uses the ms difference over two day-starts rather than `/ MS_PER_DAY` on the raw
 * timestamps, so the extra hour on a DST day does not round a 3-day gap down to 2.
 * Rounded to absorb that same hour rather than floored, which would report "1 day ago"
 * for something 30 hours old across a transition.
 *
 * **This is the only "how many days" that may be used for a deadline or a streak.** The one
 * exception in the codebase is `daysUntilExam` in `src/db/repositories/settings.ts`, which is
 * deliberately a whole-24-hour `ceil` against a fixed date in the world. The two notions coexist
 * on purpose and are not interchangeable: feeding this one's jobs to that one reintroduces exactly
 * the midnight boundary the study day exists to remove, and feeding that one's job to this one
 * would make the exam countdown move at 04:00.
 */
export function studyDaysBetween(from: number, to: number): number {
  return Math.round((studyDayStart(to) - studyDayStart(from)) / MS_PER_DAY)
}

/**
 * The study day `days` study days after the one `timestamp` falls in.
 *
 * **Calendar arithmetic, not a fixed multiple of 24 hours.** `studyDayStart` is deliberately built
 * from local calendar parts so it stays correct across a DST transition; adding `n × MS_PER_DAY` to
 * its result would not be, and in a DST zone a "1 day" interval would land at 03:00 — the previous
 * study day, an hour short. The two halves of this module have to agree about what a day is.
 *
 * The Philippines has no DST, so today this changes nothing for her. It is fixed anyway, because
 * the contradiction is invisible rather than harmless, and a future reader would otherwise have to
 * work out which half was wrong.
 */
export function addStudyDays(timestamp: number, days: number): number {
  const start = new Date(studyDayStart(timestamp))
  // `setDate` normalises month, year and DST boundaries, which is exactly why it is used here.
  start.setDate(start.getDate() + days)
  return start.getTime()
}

/**
 * A `YYYY-MM-DD` value from a date input, as the **04:00 study-day start** of that day.
 *
 * A date input hands over a calendar day, not an instant, and both her exam date and a lesson
 * deadline mean "the study day she means" rather than "an instant eight hours into it". Anchoring
 * to the rollover is what keeps "due today" from becoming "overdue" at 00:00 while she is still
 * studying. Lives here rather than in the settings repository because it is the 04:00 rule, not a
 * settings concern — and because a second copy for lesson deadlines is how two screens end up
 * disagreeing about what "the 3rd" means.
 *
 * Returns `undefined` for an empty or unparseable value, so clearing the field clears it rather
 * than storing `NaN`. It also rejects a rolled-over date like `2027-02-31`, which `Date` would
 * silently turn into March.
 */
export function studyDayMsFromDateInput(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return undefined

  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), STUDY_DAY_ROLLOVER_HOUR)

  if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return undefined

  return date.getTime()
}

/** Epoch ms back to the `YYYY-MM-DD` a date input expects. Empty string when there is no date. */
export function dateInputFromStudyDayMs(timestamp: number | undefined): string {
  if (timestamp === undefined) return ''

  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
