import { useCallback, useState } from 'react'

import { listDecks } from '@/db/repositories/decks'
import type { Deck } from '@/db/types'
import { useDatabaseValue } from '@/lib/use-database-value'

/**
 * Layer 2 — the decks a batch can be filed into.
 *
 * Reads `listDecks()` through the shared database signal rather than carrying its own
 * refresh, so a deck renamed on another screen is not stale here. The chosen deck is local
 * state: it is a choice she is making about *this* batch, not something the app needs to
 * remember between visits, and the draft is what persists it across a reload.
 *
 * `load` is wrapped in `useCallback` because `useDatabaseValue` puts it in an effect
 * dependency list. An inline arrow is a new function on every render, so the effect cancels
 * and restarts its own read forever and `loading` never becomes false — which is exactly what
 * happened on the first write of this hook, and why the contract is stated on the hook itself.
 */
export interface IngestDecks {
  decks: Deck[]
  deckId: string
  setDeckId: (deckId: string) => void
  loading: boolean
}

export function useIngestDecks(): IngestDecks {
  const load = useCallback(() => listDecks(), [])
  const { value: decks, loading } = useDatabaseValue(load, [])
  const [chosen, setChosen] = useState<string | undefined>(undefined)

  // The first deck is the default until she picks one. Defaulting to *something* matters:
  // an empty picker would make "Find my cards" look broken when it is merely unset.
  const deckId = chosen ?? decks[0]?.id ?? ''

  return { decks, deckId, setDeckId: setChosen, loading }
}
