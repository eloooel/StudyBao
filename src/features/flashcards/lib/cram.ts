import type { AppSettings } from '@/db/types'
import { daysUntilExam } from '@/db/repositories/settings'
import type { CramStatus } from '../types'

/**
 * The cram-mode decision, as a pure function of settings and an injected `now`.
 *
 * Cram mode exists because the normal schedule is actively counterproductive in the last weeks:
 * it will cheerfully tell her a card is not due for three weeks when the exam is in two
 * (docs/BUILD_GUIDE.md §9.3). So the mode is **automatic** once the exam is inside the threshold
 * — she should not have to remember to switch it on — with a manual override for the day she
 * would rather just see what is genuinely due (`forceDue`).
 *
 * The threshold is a setting, never a literal at a call site, so it can be tuned without a code
 * change. With no exam date set there is no countdown, so cram is off and the override is the only
 * way in.
 */
export function cramStatusFor(
  settings: Pick<AppSettings, 'examDate' | 'cramThresholdDays'>,
  now: number,
  forceDue = false,
): CramStatus {
  const days = daysUntilExam(settings.examDate, now)

  return {
    active: !forceDue && days !== undefined && days <= settings.cramThresholdDays,
    thresholdDays: settings.cramThresholdDays,
    ...(days === undefined ? {} : { daysUntilExam: days }),
  }
}
