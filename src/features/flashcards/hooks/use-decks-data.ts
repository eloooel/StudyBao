import { useCallback } from 'react'

import { listAllCards, listCardsByDeck } from '@/db/repositories/cards'
import {
  getDeck,
  listDecks,
  listRestorableDecks,
  type RestorableDeck,
} from '@/db/repositories/decks'
import { getSettings } from '@/db/repositories/settings'
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
  /**
   * Decks she has deleted, with the cards a restore would bring back. Empty in normal use, which is
   * why the view can render the affordance only when it is non-empty.
   */
  restorable: RestorableDeck[]
  /**
   * Whether that row should render **collapsed**.
   *
   * Computed here rather than passed as a timestamp so the view makes no policy decision: it receives a
   * boolean and renders one of two shapes.
   *
   * The rule is a comparison, not a flag. The row collapses when the newest deletion is **not newer** than
   * the moment she hid it — so a deck deleted afterwards re-expands the row by itself, with no event
   * handler and no "have I shown this yet" state to keep in sync. That is why `restoreRowCollapsedAt` is
   * a timestamp: a boolean could not tell an old dismissal from a new deletion.
   */
  restoreCollapsed: boolean
  totalDue: number
  loading: boolean
}

async function loadDeckSummaries(): Promise<DecksData> {
  /*
   * One pass, one subscription. `restorable` and the settings row are read here rather than by a second
   * live query so that the deck list, the restore row and its collapsed state can never disagree about the
   * same change: all of it re-reads on the same signal, which is what makes the row go the instant a
   * restore succeeds.
   */
  const [decks, cards, restorable, settings] = await Promise.all([
    listDecks(),
    listAllCards(),
    listRestorableDecks(),
    getSettings(),
  ])
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

  const newestDeletedAt = restorable.reduce(
    (newest, entry) => Math.max(newest, entry.deck.deletedAt ?? 0),
    0,
  )

  return {
    decks: summaries,
    restorable,
    restoreCollapsed:
      restorable.length > 0 && newestDeletedAt <= (settings.restoreRowCollapsedAt ?? 0),
    totalDue: summaries.reduce((total, summary) => total + summary.dueCards, 0),
    loading: false,
  }
}

const EMPTY_DECKS: DecksData = {
  decks: [],
  restorable: [],
  restoreCollapsed: false,
  totalDue: 0,
  loading: true,
}

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
