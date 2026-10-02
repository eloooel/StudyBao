import { useCallback, useMemo } from 'react'

import { listSessionsSince, completedWorkBlocks } from '@/db/repositories/sessions'
import type { Session } from '@/db/types'
import { useSettings } from '@/features/flashcards/hooks/use-settings'
import { useDatabaseValue } from '@/lib/use-database-value'
import { studyDayStart } from '@/lib/study-day'
import type { TimerDurations } from '../lib/timer'
import { useTimer, type TimerController } from './use-timer'

/**
 * Layer 2 — everything the timer screen needs: the running timer, the configured lengths, and the
 * day's completed focus blocks.
 *
 * ## Why "today" is the study day, not midnight
 *
 * Decision #10 in `BUILD_GUIDE.md` §2: the streak day rolls over at **04:00 local**, so a session
 * finished at 1 a.m. belongs to the day she is still awake in. Counting from midnight would show a
 * fresh zero at 00:01 after an evening's work, which reads as the app losing her effort. The
 * boundary comes from `src/lib/study-day.ts` — the single implementation, never re-derived.
 */

export interface TimerPageData extends TimerController {
  /** Completed *work* blocks since the current study day began at 04:00. */
  focusBlocksToday: number
  loading: boolean
}

/**
 * Completed work blocks since the current study day began.
 *
 * `completedWorkBlocks` is what excludes breaks and blocks she abandoned, which is the difference
 * between "four focus breaks" and "four times I pressed Start".
 */
async function loadFocusBlocksToday(now: number): Promise<Session[]> {
  return completedWorkBlocks(await listSessionsSince(studyDayStart(now)))
}

export function useTimerPage(): TimerPageData {
  const { settings, loading: settingsLoading } = useSettings()

  // `useTimer` sanitizes these as well; passing them through unchanged keeps one source of truth
  // for the defaults, and an absent field stays absent so the settings default applies.
  const durations: Partial<TimerDurations> = useMemo(
    () => ({
      workMin: settings.workMin,
      breakMin: settings.breakMin,
      longBreakMin: settings.longBreakMin,
      cyclesBeforeLongBreak: settings.cyclesBeforeLongBreak,
    }),
    [settings.workMin, settings.breakMin, settings.longBreakMin, settings.cyclesBeforeLongBreak],
  )

  const load = useCallback(() => loadFocusBlocksToday(Date.now()), [])
  // Re-read on the shared data signal, so finishing a block updates the count on this screen
  // without a reload.
  const { value: todaySessions, loading: sessionsLoading } = useDatabaseValue(load, [] as Session[])

  const timer = useTimer({ durations })

  return {
    ...timer,
    focusBlocksToday: todaySessions.length,
    loading: settingsLoading || sessionsLoading,
  }
}
