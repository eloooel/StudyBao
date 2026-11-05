import { useCallback } from 'react'

import { resetCardProgress, softDeleteCard } from '@/db/repositories/cards'
import {
  createDeck as createDeckRecord,
  restoreDeck as restoreDeckRecord,
  softDeleteDeck,
} from '@/db/repositories/decks'
import type { Deck, PrcPart } from '@/db/types'
import { notifyDataChanged } from '@/lib/use-database-value'

/**
 * Destructive and state-changing actions, each with an explicit name.
 *
 * Nothing here is routed through a generic `delete(id)`; on a device where a mistake costs real
 * study history, the call site should have to say what it is doing. Every delete is a **soft** delete,
 * which is the only kind this codebase has. Restore is the one act that goes the other way, and it is
 * named for what it brings back.
 */
export interface DeckActions {
  /** Make a deck inside a part, and return it so the caller can open it straight away. */
  createDeck: (input: { name: string; subject: PrcPart; scope?: string }) => Promise<Deck>
  deleteDeck: (deckId: string) => Promise<void>
  /**
   * Undo a deck delete: brings the deck back, and the cards that delete took with it. Cards she had
   * already deleted individually stay deleted — the timestamp match lives in the repository.
   */
  restoreDeck: (deckId: string) => Promise<void>
  deleteCard: (cardId: string) => Promise<void>
  resetProgress: (cardId: string) => Promise<void>
}

export function useDeckActions(): DeckActions {
  const createDeck = useCallback(
    async (input: { name: string; subject: PrcPart; scope?: string }) => {
      const deck = await createDeckRecord(input)
      notifyDataChanged()
      return deck
    },
    [],
  )

  const deleteDeck = useCallback(async (deckId: string) => {
    await softDeleteDeck(deckId)
    notifyDataChanged()
  }, [])

  const restoreDeck = useCallback(async (deckId: string) => {
    await restoreDeckRecord(deckId)
    // The signal is what makes the restore row and the deck list re-read: without it the deck is
    // back in the database while the screen still shows it as deleted.
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

  return { createDeck, deleteDeck, restoreDeck, deleteCard, resetProgress }
}
