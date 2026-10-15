import { useCallback } from 'react'

import { resetCardProgress, softDeleteCard } from '@/db/repositories/cards'
import { softDeleteDeck } from '@/db/repositories/decks'
import { notifyDataChanged } from '@/lib/use-database-value'

/**
 * Destructive and state-changing actions, each with an explicit name.
 *
 * Nothing here is routed through a generic `delete(id)`; on a device where a mistake costs real
 * study history, the call site should have to say what it is doing. Every one of these is a
 * **soft** delete, which is the only kind this codebase has.
 */
export interface DeckActions {
  deleteDeck: (deckId: string) => Promise<void>
  deleteCard: (cardId: string) => Promise<void>
  resetProgress: (cardId: string) => Promise<void>
}

export function useDeckActions(): DeckActions {
  const deleteDeck = useCallback(async (deckId: string) => {
    await softDeleteDeck(deckId)
    notifyDataChanged()
  }, [])

  const deleteCard = useCallback(async (cardId: string) => {
    await softDeleteCard(cardId)
    notifyDataChanged()
  }, [])

  const resetProgress = useCallback(async (cardId: string) => {
    await resetCardProgress(cardId)
    notifyDataChanged()
  }, [])

  return { deleteDeck, deleteCard, resetProgress }
}
