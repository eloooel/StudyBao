import { useCallback } from 'react'

import { listAllCards, listCardsByDeck } from '@/db/repositories/cards'
import { getDeck, listDecks } from '@/db/repositories/decks'
import type { Card, Deck } from '@/db/types'
import { useDatabaseValue } from '@/lib/use-database-value'
import { selectDueCards } from '../lib/queue'
import { isMastered } from '../lib/sm2'
import type { DeckSummary } from '../types'

/**
 * Layer 2 — aggregation for the deck list and a single deck.
 *
 * Counts are computed on read rather than stored on a deck. A stored `dueCount` would be a third
 * thing to keep in sync, and it would be wrong the moment a card's `nextReview` passed while the
 * app was open — which is the normal case, not an edge case.
 */

export interface DecksData {
  decks: DeckSummary[]
  totalDue: number
  loading: boolean
}

async function loadDeckSummaries(): Promise<DecksData> {
  const [decks, cards] = await Promise.all([listDecks(), listAllCards()])
  const now = Date.now()

  const summaries: DeckSummary[] = decks.map((deck) => {
    const own = cards.filter((card) => card.deckId === deck.id)
    return {
      deck,
      totalCards: own.length,
      dueCards: selectDueCards(own, now).length,
      masteredCards: own.filter(isMastered).length,
    }
  })

  return {
    decks: summaries,
    totalDue: summaries.reduce((total, summary) => total + summary.dueCards, 0),
    loading: false,
  }
}

const EMPTY_DECKS: DecksData = { decks: [], totalDue: 0, loading: true }

export function useDecksData(): DecksData {
  const load = useCallback(() => loadDeckSummaries(), [])
  return useDatabaseValue(load, EMPTY_DECKS).value
}

export interface DeckData {
  deck?: Deck
  deckName: string
  deckScope: string
  cards: Card[]
  dueCount: number
  loading: boolean
  /** False when the deck id in the URL does not resolve — a stale bookmark, or a deleted deck. */
  found: boolean
}

async function loadDeck(deckId: string): Promise<DeckData> {
  const [deck, cards] = await Promise.all([getDeck(deckId), listCardsByDeck(deckId)])

  return {
    ...(deck === undefined ? {} : { deck }),
    deckName: deck?.name ?? '',
    deckScope: deck?.scope ?? '',
    cards,
    dueCount: selectDueCards(cards, Date.now()).length,
    loading: false,
    found: deck !== undefined,
  }
}

const EMPTY_DECK: DeckData = {
  deckName: '',
  deckScope: '',
  cards: [],
  dueCount: 0,
  loading: true,
  found: true,
}

export function useDeckData(deckId: string | undefined): DeckData {
  const load = useCallback(async () => {
    if (deckId === undefined) return { ...EMPTY_DECK, loading: false, found: false }
    return loadDeck(deckId)
  }, [deckId])

  return useDatabaseValue(load, EMPTY_DECK).value
}
