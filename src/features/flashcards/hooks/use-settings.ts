import { useCallback } from 'react'

import { getSettings, updateSettings } from '@/db/repositories/settings'
import type { AppSettings } from '@/db/types'
import { notifyDataChanged, useDatabaseValue } from '@/lib/use-database-value'

/**
 * Layer 2 — the settings row.
 *
 * Lives under `flashcards` because the exam date is what cram mode reads and cram mode was the
 * workflow that introduced it. **That home is now overdue to change**: Workflow D made the timer a
 * consumer, Settings itself is a third screen, and this hook has become the app's settings layer
 * rather than a flashcards concern. It should move to `src/lib/use-settings.ts` the same way
 * `useDatabaseValue` moved — as a move, not a copy — and that is recorded as due work rather than
 * performed inside Workflow D, where it would be an unrelated five-file rename.
 */
export interface SettingsActions {
  /** `undefined` clears the date. */
  setExamDate: (examDate: number | undefined) => Promise<void>
  setCloudSync: (enabled: boolean) => Promise<void>
  /**
   * Write one or more timer lengths.
   *
   * Typed structurally rather than by importing `TimerDurations`, so `flashcards/` does not depend
   * on `timer/`. Workflow D added these fields; the timer owns their meaning and sanitizes them on
   * every read.
   */
  setTimerDurations: (patch: {
    workMin?: number
    breakMin?: number
    longBreakMin?: number
    cyclesBeforeLongBreak?: number
  }) => Promise<void>
}

const EMPTY: AppSettings = {
  id: 'app',
  cramThresholdDays: 30,
  cloudSync: true,
  updatedAt: 0,
}

export function useSettings(): { settings: AppSettings; loading: boolean } & SettingsActions {
  const load = useCallback(() => getSettings(), [])
  const { value, loading } = useDatabaseValue(load, EMPTY)

  const setExamDate = useCallback(async (examDate: number | undefined) => {
    // Passing the key with `undefined` is the repository's signal to remove the field, so the
    // same call handles both setting and clearing.
    await updateSettings({ examDate })
    notifyDataChanged()
  }, [])

  const setCloudSync = useCallback(async (enabled: boolean) => {
    await updateSettings({ cloudSync: enabled })
    notifyDataChanged()
  }, [])

  const setTimerDurations = useCallback(
    async (patch: {
      workMin?: number
      breakMin?: number
      longBreakMin?: number
      cyclesBeforeLongBreak?: number
    }) => {
      await updateSettings(patch)
      notifyDataChanged()
    },
    [],
  )

  return { settings: value, loading, setExamDate, setCloudSync, setTimerDurations }
}
