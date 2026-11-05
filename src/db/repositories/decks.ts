import { prcPartOrder } from '../seed-data'
import { getDb } from '../schema'
import type { Deck, PrcPart } from '../types'

/**
 * Decks. Read paths filter tombstones; the only delete is a soft delete.
 *
 * Every list here is returned in **official PRC exam order**, not alphabetically and not by
 * creation. She sits Nursing Practice I first, so the app should show it first; an
 * alphabetised list would put V in the middle for no reason she could explain.
 *
 * Since ADR 0010 a part may hold more than one deck, so part order alone no longer decides the
 * whole list. Ties inside a part break on **name**: without that the order falls back to the primary
 * key, which for a deck she made is a random UUID, and two decks in one part would swap places
 * between loads for no reason she could see.
 */
export async function listDecks(): Promise<Deck[]> {
  const db = await getDb()
  const decks = await db.decks.toArray()
  return decks.filter(isLive).sort(inPrcOrder)
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

/**
 * Make a deck inside one of the five parts.
 *
 * The part is still required and still what orders everything (ADR 0010); what changed is that a part
 * may now hold any number of decks, so this does not check for an existing deck in `subject`.
 *
 * **Scope is optional and free text.** The verbatim-PRC rule covers the five seeded decks, which quote
 * the program — a deck she names is not a quotation of anything and must not pretend to be one, so an
 * empty scope is the normal case rather than a missing value.
 *
 * Ids are `crypto.randomUUID()`, like every other record the app creates. That is deliberate: the
 * seeded decks keep stable `deck-practice-i`-style ids so they can be reasoned about and re-seeded,
 * and a deck she makes has no such identity to preserve.
 */
export async function createDeck(
  input: { name: string; subject: PrcPart; scope?: string },
  now = Date.now(),
): Promise<Deck> {
  const db = await getDb()

  const deck: Deck = {
    id: crypto.randomUUID(),
    subject: input.subject,
    name: input.name.trim(),
    scope: input.scope?.trim() ?? '',
    updatedAt: now,
  }

  await db.decks.add(deck)
  return deck
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
 * Undo a `softDeleteDeck`.
 *
 * Restoring the deck alone would give her an **empty** deck, because `softDeleteDeck` tombstones the
 * cards too — so this brings them back as well, in the same transaction.
 *
 * ## Matching on the tombstone timestamp is the whole correctness argument
 *
 * The cards this delete took all carry **exactly** the `deletedAt` the deck carries, because
 * `softDeleteDeck` writes one timestamp to both. Cards she had already deleted *individually* keep
 * their **own, earlier** timestamps and must stay deleted — restoring them would resurrect something
 * she removed on purpose days before. So the filter is `deletedAt === deck.deletedAt`, never "every
 * card in this deck".
 *
 * The one case this cannot distinguish: a card deleted individually in the **same millisecond** as the
 * deck. That is not reachable by tapping — the two are separate dialogs — so it is a known boundary
 * rather than a hole worth code.
 *
 * Returns whether it restored anything, so a caller can tell "nothing to do" from "done".
 */
export async function restoreDeck(id: string, now = Date.now()): Promise<boolean> {
  const db = await getDb()

  return db.transaction('rw', [db.decks, db.cards], async () => {
    const deck = await db.decks.get(id)

    if (deck === undefined || deck.deletedAt === undefined) return false

    // Captured before the update, because the update is what removes it.
    const tombstone = deck.deletedAt

    await db.decks.update(id, { deletedAt: undefined, updatedAt: now })

    const cards = await db.cards.where('deckId').equals(id).toArray()
    const takenByThisDelete = cards.filter((card) => card.deletedAt === tombstone)

    if (takenByThisDelete.length > 0) {
      await db.cards.bulkPut(
        takenByThisDelete.map((card) => ({ ...card, deletedAt: undefined, updatedAt: now })),
      )
    }

    return true
  })
}

export interface RestorableDeck {
  deck: Deck
  /** How many cards this restore would actually bring back. */
  cardCount: number
}

/**
 * Deleted decks she can bring back, with the number of cards the restore would actually deliver.
 *
 * **The count lives here, beside `restoreDeck`, because it has to use the same predicate the restore
 * uses:** `card.deletedAt === deck.deletedAt`. Not "every card in the deck" — `softDeleteDeck`
 * tombstones only the cards that were live, and a card she deleted herself carries an earlier stamp
 * and stays gone. A count computed in the view could drift into counting the cards she removed on
 * purpose, and would then promise cards the restore will not deliver. If the predicate ever changes,
 * `restoreDeck` above is the one it must change with.
 *
 * Ordered like `listDecks`: PRC part order, then name, so a restored deck goes back to the place on
 * the list she expects rather than wherever the index happens to put it.
 */
export async function listRestorableDecks(): Promise<RestorableDeck[]> {
  const db = await getDb()
  const decks = await db.decks.where('deletedAt').above(0).toArray()

  if (decks.length === 0) return []

  // One read of the tombstoned cards rather than one read per deck. The `deletedAt` index is what
  // keeps this small: live cards are never read, and at her scale the tombstone set is tiny.
  const tombstones = await db.cards.where('deletedAt').above(0).toArray()

  return decks
    .map((deck) => ({
      deck,
      cardCount: tombstones.filter(
        (card) => card.deckId === deck.id && card.deletedAt === deck.deletedAt,
      ).length,
    }))
    .sort((a, b) => inPrcOrder(a.deck, b.deck))
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

/** The list order every deck list uses: official PRC part order, then name inside a part. */
function inPrcOrder(a: Deck, b: Deck): number {
  return prcPartOrder(a.subject) - prcPartOrder(b.subject) || a.name.localeCompare(b.name)
}

function isLive(record: { deletedAt?: number }): boolean {
  return record.deletedAt === undefined
}
