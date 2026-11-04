import { describe, expect, it } from 'vitest'

import {
  countDecks,
  createDeck,
  getDeck,
  listDecks,
  listDeletedDecks,
  restoreDeck,
  softDeleteDeck,
} from '@/db/repositories/decks'
import {
  createCard,
  listCardsByDeck,
  listDeletedCards,
  softDeleteCard,
} from '@/db/repositories/cards'
import { prcPartOrder } from '@/db/seed-data'

/**
 * The deck repository, against a real (in-memory) IndexedDB.
 *
 * `src/test/setup.ts` wipes and re-seeds before every test, so each case starts from what a real
 * first launch produces: the five PRC decks and a settings row. Tests therefore assert *relative* to
 * that, rather than against a fixed count — see the note in `cards.test.ts` for why an absolute `5`
 * is the fragile assertion.
 *
 * The cases that matter are the ones ADR 0010 introduced: a part holding more than one deck, and an
 * ordering that does not depend on a randomly generated id.
 */
describe('createDeck', () => {
  it('adds a live deck in the part she chose', async () => {
    const before = await listDecks()

    const deck = await createDeck({ name: 'Fluid and electrolytes', subject: 'practice-i' })

    expect(deck.id).not.toBe('')
    expect(deck.subject).toBe('practice-i')
    expect(deck.name).toBe('Fluid and electrolytes')
    expect(deck.deletedAt).toBeUndefined()
    // No scope is the normal case, not a missing value: only the seeded decks quote the PRC program.
    expect(deck.scope).toBe('')

    expect(await countDecks()).toBe(before.length + 1)
    expect((await getDeck(deck.id))?.name).toBe('Fluid and electrolytes')
  })

  it('trims the name and the scope, because both are typed by hand', async () => {
    const deck = await createDeck({
      name: '  Triage  ',
      subject: 'practice-v',
      scope: '  Emergency and disaster  ',
    })

    expect(deck.name).toBe('Triage')
    expect(deck.scope).toBe('Emergency and disaster')
  })

  it('lets one part hold several decks, which is the point of ADR 0010', async () => {
    const first = await createDeck({ name: 'Endocrine', subject: 'practice-ii' })
    const second = await createDeck({ name: 'Renal', subject: 'practice-ii' })

    const inPart = (await listDecks()).filter((deck) => deck.subject === 'practice-ii')

    expect(inPart.map((deck) => deck.id)).toEqual(expect.arrayContaining([first.id, second.id]))
    expect(inPart.length).toBeGreaterThanOrEqual(2)
  })

  it('gives two identically named decks two ids', async () => {
    const a = await createDeck({ name: 'Same name', subject: 'practice-i' })
    const b = await createDeck({ name: 'Same name', subject: 'practice-i' })

    expect(a.id).not.toBe(b.id)
  })

  it('is deleted like any other deck, leaving a tombstone rather than vanishing', async () => {
    const deck = await createDeck({ name: 'Temporary', subject: 'practice-iii' })

    await softDeleteDeck(deck.id, 1_000)

    expect((await listDecks()).some((row) => row.id === deck.id)).toBe(false)
    expect((await listDeletedDecks()).some((row) => row.id === deck.id)).toBe(true)
    // And the tombstone is not "live", so `getDeck` refuses it — a detail page cannot resolve it.
    expect(await getDeck(deck.id)).toBeUndefined()
  })
})

describe('restoreDeck', () => {
  it('brings back the deck AND the cards the delete took', async () => {
    const deck = await createDeck({ name: 'To be restored', subject: 'practice-i' })
    await createCard({ deckId: deck.id, front: 'sodium', back: '135–145' })
    await createCard({ deckId: deck.id, front: 'potassium', back: '3.5–5.0' })

    await softDeleteDeck(deck.id, 5_000)
    expect((await listDecks()).some((row) => row.id === deck.id)).toBe(false)

    expect(await restoreDeck(deck.id, 6_000)).toBe(true)

    expect((await listDecks()).some((row) => row.id === deck.id)).toBe(true)
    expect((await listDeletedDecks()).some((row) => row.id === deck.id)).toBe(false)
    // The point of the timestamp match: an empty deck would satisfy "restored" and be useless.
    expect(await listCardsByDeck(deck.id)).toHaveLength(2)
  })

  it('does NOT resurrect a card she had already deleted herself', async () => {
    /*
     * The correctness case, and the reason this matches on the timestamp rather than on `deckId`.
     * `softDeleteDeck` stamps its own cards with its own `deletedAt`; a card she deleted days earlier
     * carries that earlier stamp and must stay gone. Restoring "every card in this deck" would bring
     * back something she removed deliberately.
     */
    const deck = await createDeck({ name: 'Mixed', subject: 'practice-ii' })
    const kept = await createCard({ deckId: deck.id, front: 'kept', back: 'a' })
    const alreadyGone = await createCard({ deckId: deck.id, front: 'gone', back: 'b' })

    await softDeleteCard(alreadyGone.id, 1_000)
    await softDeleteDeck(deck.id, 5_000)
    await restoreDeck(deck.id, 6_000)

    const live = await listCardsByDeck(deck.id)

    expect(live.map((card) => card.id)).toEqual([kept.id])
    expect((await listDeletedCards()).some((card) => card.id === alreadyGone.id)).toBe(true)
  })

  it('says when there is nothing to do', async () => {
    const deck = await createDeck({ name: 'Still here', subject: 'practice-iii' })

    expect(await restoreDeck(deck.id)).toBe(false)
    expect(await restoreDeck('no-such-deck')).toBe(false)
  })
})

describe('listDecks ordering', () => {
  it('is PRC exam order for parts, whatever order the decks were made in', async () => {
    await createDeck({ name: 'Made last, earliest part', subject: 'practice-i' })
    await createDeck({ name: 'Made first, latest part', subject: 'practice-v' })

    const parts = (await listDecks()).map((deck) => prcPartOrder(deck.subject))

    expect(parts).toEqual([...parts].sort((a, b) => a - b))
  })

  it('breaks ties inside a part by name, so the list does not move between loads', async () => {
    // Without a tiebreak the order inside a part falls back to the primary key, which for a deck she
    // made is a random UUID — so two decks in one part would swap places on a reload.
    await createDeck({ name: 'Zebra', subject: 'practice-iv' })
    await createDeck({ name: 'Alpha', subject: 'practice-iv' })

    const names = (await listDecks())
      .filter((deck) => deck.subject === 'practice-iv')
      .map((deck) => deck.name)

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(names[0]).toBe('Alpha')
    expect(names[names.length - 1]).toBe('Zebra')
  })
})
