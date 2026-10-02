import { useCallback, useMemo } from 'react'

import { useSettings } from '@/features/flashcards/hooks/use-settings'
import { sanitizeDurations, type TimerDurations } from '../lib/timer'

/**
 * Layer 2 — the timer lengths, read and written.
 *
 * One hook for both directions so the timer and the Settings screen can never disagree about which
 * values are in force. The row stores them as **optional** fields (absent means "use the default"),
 * so both callers go through `sanitizeDurations` — the same guard the state machine uses, which
 * matters because a stored row could have come from an older build or a hand-edited database.
 *
 * Lives under `features/timer/` because the timer owns these values; Settings only edits them.
 */
export interface TimerSettings {
  durations: TimerDurations
  /** Merges a patch into the settings row. Unknown keys are ignored by the repository. */
  updateDurations: (patch: Partial<TimerDurations>) => Promise<void>
  loading: boolean
}

export function useTimerSettings(): TimerSettings {
  const { settings, loading, setTimerDurations } = useSettings()

  const durations = useMemo(
    () =>
      sanitizeDurations({
        workMin: settings.workMin,
        breakMin: settings.breakMin,
        longBreakMin: settings.longBreakMin,
        cyclesBeforeLongBreak: settings.cyclesBeforeLongBreak,
      }),
    [settings.workMin, settings.breakMin, settings.longBreakMin, settings.cyclesBeforeLongBreak],
  )

  const updateDurations = useCallback(
    async (patch: Partial<TimerDurations>) => {
      await setTimerDurations(patch)
    },
    [setTimerDurations],
  )

  return { durations, updateDurations, loading }
}
