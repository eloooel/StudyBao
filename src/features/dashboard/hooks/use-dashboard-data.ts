import { useCallback } from 'react'

import { countDecks } from '@/db/repositories/decks'
import { useDatabaseValue } from '@/lib/use-database-value'

/**
 * Layer 2 — the one fact the dashboard reads from the database today.
 *
 * **This is deliberately not the start of Workflow F.** F is an aggregate over `ReviewLog` and
 * `Session` — a streak, per-subject progress, weak spots — and none of that exists here. This is a
 * count of rows, which is what the honest empty state needs to decide what to say.
 *
 * It goes through the shared `useDatabaseValue` rather than a local `useState` + `useEffect`, because
 * a deck list and this screen must not disagree: deleting a deck on `/cards` has to change the number
 * here without a reload, and that signal is the mechanism this repository already has for exactly
 * that. `countDecks` is an existing repository function and is not new for this screen.
 *
 * **The bug this replaces:** the page used to pass a literal `deckCount={0}`, so `DashboardView`
 * always took the `hasDecks === false` branch and told her to get her notes into cards while five
 * seeded PRC decks were one tap away. A hardcoded zero is not a placeholder when the real value is
 * one query away — it is a wrong answer with a confident face.
 */
export function useDashboardData(): { deckCount: number } {
  const load = useCallback(() => countDecks(), [])
  const { value } = useDatabaseValue(load, 0)

  return { deckCount: value }
}
