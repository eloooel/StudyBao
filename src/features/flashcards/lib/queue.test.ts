import { describe, expect, it } from 'vitest'

import type { Card } from '@/db/types'
import { MS_PER_DAY } from '@/lib/time'
import { cramScore, daysSinceLastTouched, orderByDue, orderForCram, selectDueCards } from './queue'

/**
 * Queue selection and ordering. Pure, so no database and no clock.
 *
 * Cram ordering is the part worth being careful about: it decides where her limited pre-exam
 * time goes, and a non-deterministic comparator would make the queue different every launch.
 */

const NOW = new Date(2026, 8, 21, 10, 0, 0, 0).getTime()

function card(overrides: Partial<Card> & Pick<Card, 'id'>): Card {
  return {
    deckId: 'deck-a',
    front: 'front',
    back: 'back',
    tags: [],
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    learningStep: 0,
    nextReview: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('selectDueCards', () => {
  it('includes a card whose nextReview has passed and excludes one that has not', () => {
    const due = card({ id: 'due', nextReview: NOW - 1 })
    const notYet = card({ id: 'later', nextReview: NOW + 1 })

    expect(selectDueCards([due, notYet], NOW).map((row) => row.id)).toEqual(['due'])
  })

  it('treats a card due exactly now as due', () => {
    // The contract is `nextReview <= Date.now()`, stated inclusively in the build guide.
    expect(selectDueCards([card({ id: 'exact', nextReview: NOW })], NOW)).toHaveLength(1)
  })
})

describe('orderByDue', () => {
  it('puts the most overdue first', () => {
    const older = card({ id: 'older', nextReview: NOW - 5 * MS_PER_DAY })
    const newer = card({ id: 'newer', nextReview: NOW - MS_PER_DAY })

    expect(orderByDue([newer, older]).map((row) => row.id)).toEqual(['older', 'newer'])
  })

  it('is deterministic when two cards are due at the same instant', () => {
    const b = card({ id: 'b' })
    const a = card({ id: 'a' })

    expect(orderByDue([b, a]).map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('does not mutate its input', () => {
    const cards = [card({ id: 'b', nextReview: NOW + 1 }), card({ id: 'a', nextReview: NOW })]
    const before = cards.map((row) => row.id)

    orderByDue(cards)

    expect(cards.map((row) => row.id)).toEqual(before)
  })
})

describe('daysSinceLastTouched', () => {
  it('measures from lastReviewedAt when there is one', () => {
    const reviewed = card({ id: 'r', lastReviewedAt: NOW - 3 * MS_PER_DAY })

    expect(daysSinceLastTouched(reviewed, NOW)).toBe(3)
  })

  it('measures from createdAt when the card has never been reviewed', () => {
    const fresh = card({ id: 'f', createdAt: NOW - 2 * MS_PER_DAY })

    expect(daysSinceLastTouched(fresh, NOW)).toBe(2)
  })

  it('never returns Infinity for a never-reviewed card, and never a negative', () => {
    const neverReviewed = card({ id: 'n', createdAt: NOW })
    const futureDated = card({ id: 'future', lastReviewedAt: NOW + 5 * MS_PER_DAY })

    // Infinity here would make the comparator produce NaN when two such cards meet.
    expect(Number.isFinite(daysSinceLastTouched(neverReviewed, NOW))).toBe(true)
    expect(daysSinceLastTouched(neverReviewed, NOW)).toBe(0)
    expect(daysSinceLastTouched(futureDated, NOW)).toBe(0)
  })
})

describe('cramScore', () => {
  it('weights a card with no lapses above zero', () => {
    // Without the `+ 1`, a never-failed card would score 0 and sort last however stale it was.
    const noLapses = card({ id: 'clean', lapses: 0, lastReviewedAt: NOW - 10 * MS_PER_DAY })

    expect(cramScore(noLapses, NOW)).toBe(10)
  })

  it('scales with lapses', () => {
    const once = card({ id: 'once', lapses: 1, lastReviewedAt: NOW - 10 * MS_PER_DAY })
    const twice = card({ id: 'twice', lapses: 2, lastReviewedAt: NOW - 10 * MS_PER_DAY })

    expect(cramScore(twice, NOW)).toBeGreaterThan(cramScore(once, NOW))
  })

  it('scales with staleness', () => {
    const stale = card({ id: 'stale', lapses: 1, lastReviewedAt: NOW - 20 * MS_PER_DAY })
    const recent = card({ id: 'recent', lapses: 1, lastReviewedAt: NOW - 2 * MS_PER_DAY })

    expect(cramScore(stale, NOW)).toBeGreaterThan(cramScore(recent, NOW))
  })
})

describe('orderForCram', () => {
  const deckOrder = ['deck-a', 'deck-b']

  it('puts a never-reviewed card ahead of a reviewed one with no lapses and similar age', () => {
    const neverReviewed = card({ id: 'new', createdAt: NOW - 4 * MS_PER_DAY, lapses: 0 })
    const reviewed = card({
      id: 'seen',
      lastReviewedAt: NOW - 4 * MS_PER_DAY,
      createdAt: NOW - 30 * MS_PER_DAY,
      lapses: 0,
    })

    // Same staleness, same lapses: the tie-break is deck order, then id. What matters is that
    // neither produces NaN and the order is stable across calls.
    const first = orderForCram([neverReviewed, reviewed], deckOrder, NOW).map((row) => row.id)
    const second = orderForCram([neverReviewed, reviewed], deckOrder, NOW).map((row) => row.id)

    expect(first).toEqual(second)
    expect(first).toHaveLength(2)
  })

  it('puts the most-lapsed stale card first', () => {
    const worst = card({ id: 'worst', lapses: 4, lastReviewedAt: NOW - 20 * MS_PER_DAY })
    const middle = card({ id: 'middle', lapses: 2, lastReviewedAt: NOW - 5 * MS_PER_DAY })
    const best = card({ id: 'best', lapses: 0, lastReviewedAt: NOW - MS_PER_DAY })

    expect(orderForCram([best, worst, middle], deckOrder, NOW).map((row) => row.id)).toEqual([
      'worst',
      'middle',
      'best',
    ])
  })

  it('orders by weakness times staleness, not by either alone', () => {
    // 3 lapses x 3 days = (3+1) x 3 = 12 beats a staler card with no lapses, (0+1) x 10 = 10.
    const weakAndRecent = card({ id: 'weak', lapses: 3, lastReviewedAt: NOW - 3 * MS_PER_DAY })
    const strongAndStale = card({ id: 'stale', lapses: 0, lastReviewedAt: NOW - 10 * MS_PER_DAY })

    expect(cramScore(weakAndRecent, NOW)).toBe(12)
    expect(cramScore(strongAndStale, NOW)).toBe(10)
    expect(
      orderForCram([strongAndStale, weakAndRecent], deckOrder, NOW).map((row) => row.id),
    ).toEqual(['weak', 'stale'])
  })

  it('breaks ties by deck order and then by id, deterministically', () => {
    const inSecondDeck = card({
      id: 'a',
      deckId: 'deck-b',
      lapses: 1,
      lastReviewedAt: NOW - 5 * MS_PER_DAY,
    })
    const inFirstDeckZ = card({
      id: 'z',
      deckId: 'deck-a',
      lapses: 1,
      lastReviewedAt: NOW - 5 * MS_PER_DAY,
    })
    const inFirstDeckB = card({
      id: 'b',
      deckId: 'deck-a',
      lapses: 1,
      lastReviewedAt: NOW - 5 * MS_PER_DAY,
    })

    // Equal scores, so: deck-a before deck-b, and inside deck-a, 'b' before 'z'.
    expect(
      orderForCram([inSecondDeck, inFirstDeckZ, inFirstDeckB], deckOrder, NOW).map((row) => row.id),
    ).toEqual(['b', 'z', 'a'])
  })

  it('sorts a card from an unknown deck last rather than dropping it', () => {
    const orphan = card({
      id: 'orphan',
      deckId: 'deck-zzz',
      lapses: 1,
      lastReviewedAt: NOW - 5 * MS_PER_DAY,
    })
    const known = card({
      id: 'known',
      deckId: 'deck-a',
      lapses: 1,
      lastReviewedAt: NOW - 5 * MS_PER_DAY,
    })

    const ordered = orderForCram([orphan, known], deckOrder, NOW)

    expect(ordered.map((row) => row.id)).toEqual(['known', 'orphan'])
  })

  it('does not mutate its input', () => {
    const cards = [card({ id: 'b', lapses: 0 }), card({ id: 'a', lapses: 5 })]
    const before = cards.map((row) => row.id)

    orderForCram(cards, deckOrder, NOW)

    expect(cards.map((row) => row.id)).toEqual(before)
  })
})
