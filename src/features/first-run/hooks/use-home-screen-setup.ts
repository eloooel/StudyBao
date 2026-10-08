import { useCallback, useEffect, useMemo, useState } from 'react'

import { getSettings, updateSettings } from '@/db/repositories/settings'
import type { AppSettings } from '@/db/types'
import { notifyDataChanged, useDatabaseValue } from '@/lib/use-database-value'
import {
  homeScreenState,
  readHomeScreenEnvironment,
  shouldPromptHomeScreen,
  subscribeToDisplayMode,
  type HomeScreenState,
} from '../lib/home-screen'

/**
 * Layer 2 — the Home Screen prompt's state, and the only place this feature touches `window` or the
 * database.
 *
 * ## Why the settings row is read through `useDatabaseValue`
 *
 * This is a second read of a row that other screens also read, and the first-run prompt is the
 * *fourth* consumer of `AppSettings` (cram mode, the timer, Settings itself). So it goes through the
 * shared refresh mechanism rather than hand-rolling a subscription: this repository has already paid
 * once for a copy of `use-database-value`, and the note on that file is explicit that a second copy
 * means two screens disagreeing about what is current.
 *
 * `loading` is what keeps the prompt from flashing: `useDatabaseValue` starts at its `initial` value,
 * where `installPromptSeenAt` is absent — indistinguishable from "never shown". Rendering on that
 * would show the prompt to someone who dismissed it months ago, every single launch. Waiting for the
 * read to land costs one frame.
 *
 * ## Why nothing is stored in React state about the device
 *
 * The only mutable piece is `standalone`, and it is subscribed to rather than read once. iOS adds the
 * icon without a reload: the Safari tab stays open behind it. So she can follow the prompt's own
 * instructions and, in the same session, have the Settings card flip from "here's how" to "you're
 * set" — instead of the two surfaces disagreeing about what she has done.
 */
export interface HomeScreenSetup {
  /**
   * Whether to show the one-time prompt **now**. False while the settings row is still loading, which
   * is deliberate — see above.
   */
  promptOpen: boolean
  /** Which of the Settings card's three states applies. */
  state: HomeScreenState
  /** Records that she has dealt with the prompt. Called by every exit from it. */
  markSeen: () => void
}

/** The id is the singleton's, from `src/db/schema.ts`; the rest are never read before `loading` ends. */
const UNSETTLED_SETTINGS: AppSettings = {
  id: 'app',
  cramThresholdDays: 0,
  cloudSync: true,
  updatedAt: 0,
}

export function useHomeScreenSetup(): HomeScreenSetup {
  const [environment, setEnvironment] = useState(readHomeScreenEnvironment)

  useEffect(
    () =>
      subscribeToDisplayMode((standalone) => {
        // `setEnvironment` with a function so this never needs `environment` as a dependency, which
        // would resubscribe the media query listener on every change.
        setEnvironment((previous) => ({ ...previous, standalone }))
      }),
    [],
  )

  const load = useCallback(() => getSettings(), [])
  // A module-level constant, not an inline literal: `useDatabaseValue` returns its `initial` value
  // directly, and a fresh object every render would be indistinguishable from a loaded row while also
  // making the "is it loaded yet" question harder to read than `loading` already answers it.
  const { value: settings, loading } = useDatabaseValue(load, UNSETTLED_SETTINGS)

  const markSeen = useCallback(() => {
    // A timestamp, not a boolean: the question this answers later is "how long did she use the Safari
    // tab before adding it", and a boolean cannot be un-lost.
    void (async () => {
      await updateSettings({ installPromptSeenAt: Date.now() })
      notifyDataChanged()
    })()
  }, [])

  const promptOpen =
    !loading && shouldPromptHomeScreen(environment, settings.installPromptSeenAt !== undefined)

  const state = useMemo(() => homeScreenState(environment), [environment])

  return { promptOpen, state, markSeen }
}
