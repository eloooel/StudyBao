import { useCallback } from 'react'

import { getDeck } from '@/db/repositories/decks'
import { useDatabaseValue } from '@/lib/use-database-value'

/**
 * Layer 2 — the deck name shown on the review screen.
 *
 * The draft stores only `deckId`, because a deck can be renamed and a stored *name* would go
 * stale in a draft that outlives the rename. Resolving it here keeps the single source of truth
 * in Dexie.
 */
export function useDeckName(deckId: string): string {
  const load = useCallback(async () => (await getDeck(deckId))?.name ?? '', [deckId])
  return useDatabaseValue(load, '').value
}
