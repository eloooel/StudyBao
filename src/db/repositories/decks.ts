import { prcPartOrder } from '../seed-data'
import { getDb } from '../schema'
import type { Deck } from '../types'

/**
 * Decks. Read paths filter tombstones; the only delete is a soft delete.
 *
 * Every list here is returned in **official PRC exam order**, not alphabetically and not by
 * creation. She sits Nursing Practice I first, so the app should show it first; an
 * alphabetised list would put V in the middle for no reason she could explain.
 */
export async function listDecks(): Promise<Deck[]> {
  const db = await getDb()
  const decks = await db.decks.orderBy('subject').toArray()
  return decks.filter(isLive).sort((a, b) => prcPartOrder(a.subject) - prcPartOrder(b.subject))
}

/** Live decks only — a tombstoned deck is not counted on any screen. */
export async function countDecks(): Promise<number> {
  return (await listDecks()).length
}

export async function getDeck(id: string): Promise<Deck | undefined> {
  const db = await getDb()
  const deck = await db.decks.get(id)
  return deck && isLive(deck) ? deck : undefined
}

export async function updateDeck(
  id: string,
  patch: Pick<Deck, 'name' | 'scope'>,
  now = Date.now(),
): Promise<void> {
  const db = await getDb()
  await db.decks.update(id, { ...patch, updatedAt: now })
}

/**
 * Soft-delete a deck, and tombstone its cards in the same transaction.
 *
 * The cards go too, because a deck that is gone with live cards inside it leaves the review
 * queue serving cards she cannot see or edit — the "orphaned data" version of a bug she
 * would experience as cards appearing from nowhere. Nothing is ever removed: this is
 * `deletedAt` on both, which is what stops the other device resurrecting either.
 */
export async function softDeleteDeck(id: string, now = Date.now()): Promise<void> {
  const db = await getDb()

  await db.transaction('rw', [db.decks, db.cards], async () => {
    await db.decks.update(id, { deletedAt: now, updatedAt: now })

    const cards = await db.cards.where('deckId').equals(id).toArray()
    const live = cards.filter(isLive)

    if (live.length > 0) {
      await db.cards.bulkPut(live.map((card) => ({ ...card, deletedAt: now, updatedAt: now })))
    }
  })
}

/**
 * Tombstones only. Not used by the UI; this is what Workflow S will push.
 *
 * Uses the `deletedAt` index rather than reading the whole table and filtering in JS — that is what
 * the index is for.
 */
export async function listDeletedDecks(): Promise<Deck[]> {
  const db = await getDb()
  // Epoch ms is always positive, so `above(0)` means "has a deletion timestamp".
  return db.decks.where('deletedAt').above(0).toArray()
}

function isLive(record: { deletedAt?: number }): boolean {
  return record.deletedAt === undefined
}
