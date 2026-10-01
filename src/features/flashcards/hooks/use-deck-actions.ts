import { useCallback } from 'react'

import { listCardsByDeck, resetCardProgress, softDeleteCard } from '@/db/repositories/cards'
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
  /** Used by the delete confirmation to say how much is about to be affected. */
  countCardsInDeck: (deckId: string) => Promise<number>
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

  const countCardsInDeck = useCallback(async (deckId: string) => {
    return (await listCardsByDeck(deckId)).length
  }, [])

  return { deleteDeck, deleteCard, resetProgress, countCardsInDeck }
}
