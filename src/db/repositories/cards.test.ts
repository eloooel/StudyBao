import { describe, expect, it } from 'vitest'

import { GRADE_AGAIN, GRADE_GOOD } from '@/db/types'
import type { Card } from '@/db/types'
import {
  getCard,
  createCard,
  listCardsByDeck,
  listDeletedCards,
  recordReview,
  resetCardProgress,
  softDeleteCard,
  updateCardText,
} from '@/db/repositories/cards'
import { countDecks, listDecks, softDeleteDeck } from '@/db/repositories/decks'
import { countReviewLogs, listReviewLogsByCard } from '@/db/repositories/review-logs'
import { deckIdForPart } from '@/db/seed-data'
import { STUDY_DAY_ROLLOVER_HOUR } from '@/lib/study-day'
import { MS_PER_DAY, MS_PER_MINUTE } from '@/lib/time'

/**
 * The repository layer, against a real (in-memory) IndexedDB.
 *
 * The transaction in `recordReview` is the reason this file exists. A card write that landed
 * without its `ReviewLog` row would leave a permanent hole in the history that neither the
 * dashboard nor a future FSRS migration could reconstruct, so the pairing is asserted rather
 * than assumed.
 *
 * Each test starts from an empty database because `src/test/setup.ts` wipes the tables after
 * every test — see the note there on why that is not optional with a module-level DB handle.
 */

const DECK = deckIdForPart('practice-i')

// Mid-morning, so "the start of the study day" is well before the timestamp and the day
// arithmetic in these assertions is unambiguous.
const NOW = new Date(2026, 8, 21, 10, 0, 0, 0).getTime()

describe('cards repository', () => {
  it('creates a card on the first learning step, due in a minute', async () => {
    const card = await createCard({ deckId: DECK, front: '  Front  ', back: ' Back ' }, NOW)

    expect(card.front).toBe('Front') // trimmed on the way in
    expect(card.back).toBe('Back')
    expect(card.easeFactor).toBe(2.5)
    expect(card.intervalDays).toBe(0)
    expect(card.repetitions).toBe(0)
    expect(card.lapses).toBe(0)
    expect(card.learningStep).toBe(0)
    expect(card.nextReview).toBe(NOW + MS_PER_MINUTE)
    expect(card.createdAt).toBe(NOW)
    expect(card.updatedAt).toBe(NOW)
    expect(card.deletedAt).toBeUndefined()
  })

  it('leaves a soft-deleted card out of every read', async () => {
    const card = await createCard({ deckId: DECK, front: 'F', back: 'B' }, NOW)
    await softDeleteCard(card.id, NOW + 1000)

    expect(await listCardsByDeck(DECK)).toEqual([])
    expect(await getCard(card.id)).toBeUndefined()

    // Still present as a tombstone — Workflow S needs it, and it is what stops the other
    // device resurrecting the card she deleted. Deleting is never removing.
    const tombstones = await listDeletedCards()
    expect(tombstones.map((row) => row.id)).toContain(card.id)
  })

  it('preserves scheduling state when the text is edited', async () => {
    const card = await createCard({ deckId: DECK, front: 'F', back: 'B' }, NOW)

    // Review it a few times so the state is clearly not the default.
    let current: Card = card
    for (let i = 0; i < 4; i += 1) {
      current = await recordReview(current, GRADE_GOOD, 1000, NOW + i * MS_PER_DAY)
    }
    const before = { ...current }

    await updateCardText(
      card.id,
      { front: 'Fixed typo', back: 'B', tags: ['Pharmacology and Therapeutics'] },
      NOW + 10 * MS_PER_DAY,
    )

    const after = await getCard(card.id)
    expect(after?.front).toBe('Fixed typo')
    expect(after?.tags).toEqual(['Pharmacology and Therapeutics'])
    // The whole point: a typo fix must not throw away weeks of spacing.
    expect(after?.intervalDays).toBe(before.intervalDays)
    expect(after?.easeFactor).toBe(before.easeFactor)
    expect(after?.repetitions).toBe(before.repetitions)
    expect(after?.nextReview).toBe(before.nextReview)
    expect(after?.learningStep).toBe(before.learningStep)
    // But `updatedAt` moves, because the record changed and sync needs to see that.
    expect(after?.updatedAt).toBe(NOW + 10 * MS_PER_DAY)
  })

  it('resets progress on request, keeping the text and the review history', async () => {
    const card = await createCard({ deckId: DECK, front: 'F', back: 'B' }, NOW)
    let current: Card = card
    for (let i = 0; i < 4; i += 1) {
      current = await recordReview(current, GRADE_GOOD, 1000, NOW + i * MS_PER_DAY)
    }
    expect(current.intervalDays).toBeGreaterThan(1)

    await resetCardProgress(card.id, NOW + 30 * MS_PER_DAY)

    const after = await getCard(card.id)
    expect(after?.intervalDays).toBe(0)
    expect(after?.easeFactor).toBe(2.5)
    expect(after?.repetitions).toBe(0)
    expect(after?.lapses).toBe(0)
    expect(after?.learningStep).toBe(0)
    expect(after?.nextReview).toBe(NOW + 30 * MS_PER_DAY)
    expect(after?.front).toBe('F')
    // The history is untouched: those reviews really happened.
    expect(await listReviewLogsByCard(card.id)).toHaveLength(4)
  })

  it('orders a deck soonest-due first', async () => {
    const later = await createCard({ deckId: DECK, front: 'later', back: 'b' }, NOW + 5000)
    const sooner = await createCard({ deckId: DECK, front: 'sooner', back: 'b' }, NOW)

    expect((await listCardsByDeck(DECK)).map((card) => card.id)).toEqual([sooner.id, later.id])
  })
})

describe('recordReview', () => {
  it('writes the card and its ReviewLog row together', async () => {
    const card = await createCard({ deckId: DECK, front: 'F', back: 'B' }, NOW)

    const updated = await recordReview(card, GRADE_GOOD, 4200, NOW + MS_PER_MINUTE)

    expect(updated.learningStep).toBe(1)
    expect(updated.repetitions).toBe(0)
    expect(updated.lastReviewedAt).toBe(NOW + MS_PER_MINUTE)
    expect(updated.nextReview).toBe(NOW + MS_PER_MINUTE + 10 * MS_PER_MINUTE)

    const logs = await listReviewLogsByCard(card.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      cardId: card.id,
      deckId: DECK,
      grade: GRADE_GOOD,
      msSpent: 4200,
      reviewedAt: NOW + MS_PER_MINUTE,
    })
  })

  it('appends one log row per review, in order, and never rewrites an earlier one', async () => {
    const card = await createCard({ deckId: DECK, front: 'F', back: 'B' }, NOW)

    let current = card
    const grades = [GRADE_GOOD, GRADE_GOOD, GRADE_GOOD, GRADE_AGAIN] as const
    for (const [index, grade] of grades.entries()) {
      current = await recordReview(current, grade, 1000 + index, NOW + (index + 1) * MS_PER_MINUTE)
    }

    const logs = await listReviewLogsByCard(card.id)
    expect(logs.map((log) => log.grade)).toEqual([...grades])
    expect(logs.map((log) => log.msSpent)).toEqual([1000, 1001, 1002, 1003])
    expect(await countReviewLogs()).toBe(4)
  })

  it('records a lapse and re-enters the learning steps', async () => {
    const card = await createCard({ deckId: DECK, front: 'F', back: 'B' }, NOW)
    // Graduate first, so there is an interval to lose.
    let current = await recordReview(card, GRADE_GOOD, 100, NOW)
    current = await recordReview(current, GRADE_GOOD, 100, NOW + MS_PER_MINUTE)
    expect(current.intervalDays).toBe(1)

    const lapsed = await recordReview(current, GRADE_AGAIN, 100, NOW + MS_PER_DAY)

    expect(lapsed.lapses).toBe(1)
    expect(lapsed.intervalDays).toBe(0)
    expect(lapsed.repetitions).toBe(0)
    expect(lapsed.learningStep).toBe(0)
  })

  it('clamps a negative duration rather than storing it', async () => {
    // `msSpent` is measured with performance.now(), but a defensive clamp here means a bad
    // caller cannot put a negative number in the history that FSRS would later read.
    const card = await createCard({ deckId: DECK, front: 'F', back: 'B' }, NOW)

    await recordReview(card, GRADE_GOOD, -50, NOW)

    const logs = await listReviewLogsByCard(card.id)
    expect(logs[0]?.msSpent).toBe(0)
  })

  it('lands on a whole study-day boundary when the card reaches a day scale', async () => {
    const card = await createCard({ deckId: DECK, front: 'F', back: 'B' }, NOW)
    let current = card

    // Each review happens when the card is actually due — grading five times at one instant
    // would not exercise the cadence at all, and that mistake initially hid here.
    for (let i = 0; i < 4; i += 1) {
      current = await recordReview(current, GRADE_GOOD, 100, current.nextReview)
    }

    // Two learning steps, 1 day, 6 days, 15 days.
    expect(current.intervalDays).toBe(15)
    const due = new Date(current.nextReview)
    expect(due.getHours()).toBe(STUDY_DAY_ROLLOVER_HOUR)
    expect(due.getMinutes()).toBe(0)
  })
})

describe('decks repository', () => {
  it('lists the five seeded parts in official exam order', async () => {
    const decks = await listDecks()

    expect(decks.map((deck) => deck.name)).toEqual([
      'Nursing Practice I',
      'Nursing Practice II',
      'Nursing Practice III',
      'Nursing Practice IV',
      'Nursing Practice V',
    ])
    expect(await countDecks()).toBe(5)
  })

  it('excludes a soft-deleted deck from reads while keeping its row', async () => {
    const target = deckIdForPart('practice-iii')
    await softDeleteDeck(target, NOW)

    expect((await listDecks()).map((deck) => deck.id)).not.toContain(target)
    expect(await countDecks()).toBe(4)
  })

  it('tombstones the cards inside a deleted deck in the same transaction', async () => {
    const target = deckIdForPart('practice-ii')
    const card = await createCard({ deckId: target, front: 'F', back: 'B' }, NOW)
    expect(await listCardsByDeck(target)).toHaveLength(1)

    await softDeleteDeck(target, NOW)

    // Otherwise the review queue would keep serving cards she can no longer see or edit.
    expect(await listCardsByDeck(target)).toEqual([])
    expect(await getCard(card.id)).toBeUndefined()
  })
})
