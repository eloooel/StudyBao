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
 */
export function studyDaysBetween(from: number, to: number): number {
  return Math.round((studyDayStart(to) - studyDayStart(from)) / MS_PER_DAY)
}
