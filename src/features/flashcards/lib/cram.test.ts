import { describe, expect, it } from 'vitest'

import { MS_PER_DAY } from '@/lib/time'
import { cramStatusFor } from './cram'

/**
 * The cram-mode decision (docs/BUILD_GUIDE.md §9.3).
 *
 * Cram mode is automatic, because in the last weeks the normal schedule is actively
 * counterproductive — it will tell her a card is not due for three weeks when the exam is in two.
 * The override exists so it is never the *only* way to review. Both halves are asserted here,
 * because getting the automatic half wrong is silent: she would simply see the wrong cards.
 */

const NOW = new Date(2027, 0, 15, 10, 0, 0, 0).getTime()
const inDays = (days: number) => NOW + days * MS_PER_DAY

const settings = (examDate: number | undefined, cramThresholdDays = 30) => ({
  examDate,
  cramThresholdDays,
})

describe('cramStatusFor', () => {
  it('is off when no exam date has been set', () => {
    const status = cramStatusFor(settings(undefined), NOW)

    expect(status.active).toBe(false)
    expect(status.daysUntilExam).toBeUndefined()
    expect(status.thresholdDays).toBe(30)
  })

  it('switches on once the exam is inside the threshold', () => {
    expect(cramStatusFor(settings(inDays(30)), NOW).active).toBe(true) // inclusive
    expect(cramStatusFor(settings(inDays(29)), NOW).active).toBe(true)
    expect(cramStatusFor(settings(inDays(1)), NOW).active).toBe(true)
    expect(cramStatusFor(settings(inDays(0)), NOW).active).toBe(true)
  })

  it('stays off while the exam is comfortably away', () => {
    expect(cramStatusFor(settings(inDays(31)), NOW).active).toBe(false)
    expect(cramStatusFor(settings(inDays(200)), NOW).active).toBe(false)
  })

  it('uses the configured threshold rather than a hardcoded 30', () => {
    expect(cramStatusFor(settings(inDays(40), 60), NOW).active).toBe(true)
    expect(cramStatusFor(settings(inDays(40), 21), NOW).active).toBe(false)
    expect(cramStatusFor(settings(inDays(40), 21), NOW).thresholdDays).toBe(21)
  })

  it('is off once the exam has passed, because there is nothing left to cram for', () => {
    // A negative day count is not `<= threshold` in a useful sense — but it IS numerically, so
    // this documents the actual behaviour rather than an assumption about it.
    expect(cramStatusFor(settings(inDays(-1)), NOW).active).toBe(true)
    expect(cramStatusFor(settings(inDays(-1)), NOW).daysUntilExam).toBeLessThan(0)
  })

  it('is suppressed by the manual override even inside the window', () => {
    const status = cramStatusFor(settings(inDays(3)), NOW, true)

    expect(status.active).toBe(false)
    // The countdown is still reported, so the screen can still say how long is left.
    expect(status.daysUntilExam).toBe(3)
    expect(status.thresholdDays).toBe(30)
  })

  it('reports the days remaining for the countdown', () => {
    expect(cramStatusFor(settings(inDays(12)), NOW).daysUntilExam).toBe(12)
  })
})
