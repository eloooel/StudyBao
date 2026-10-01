import { useCallback } from 'react'

import { getSettings, updateSettings } from '@/db/repositories/settings'
import type { AppSettings } from '@/db/types'
import { notifyDataChanged, useDatabaseValue } from '@/lib/use-database-value'

/**
 * Layer 2 — the settings row.
 *
 * Lives under `flashcards` because the exam date is what cram mode reads and cram mode is this
 * workflow. When the timer and the tracker need settings, this hook moves to a shared home rather
 * than being copied — a second `useSettings` is how two screens start disagreeing about the exam
 * date.
 */
export interface SettingsActions {
  /** `undefined` clears the date. */
  setExamDate: (examDate: number | undefined) => Promise<void>
  setCloudSync: (enabled: boolean) => Promise<void>
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

  return { settings: value, loading, setExamDate, setCloudSync }
}
