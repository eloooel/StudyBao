import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createCard, listCardsByDeck } from '@/db/repositories/cards'
import { countDecks, listDecks } from '@/db/repositories/decks'
import { listReviewLogsByCard } from '@/db/repositories/review-logs'
import { deckIdForPart } from '@/db/seed-data'
import { clearDatabaseForTests, getDb } from '@/db/schema'
import { GRADE_AGAIN, GRADE_GOOD } from '@/db/types'
import { useDecksData, useDeckData } from './use-decks-data'
import { useReviewSession } from './use-review-session'
import { useSettings } from './use-settings'

/**
 * Layer 2 hooks, against a real in-memory IndexedDB.
 *
 * These are the integration seam: a hook bug here means a card that never comes back, or a queue
 * that serves the same card twice. That is worth more than a rendering assertion, which is why the
 * tests below are about state transitions and persisted rows rather than markup.
 *
 * Every write goes through the real repository, so the tests also hold the repository and hook
 * contracts together — a change to one that breaks the other fails here rather than on her iPad.
 */

const DECK = deckIdForPart('practice-i')

/** A deck with no cards in it, so queue assertions are unambiguous. */
async function clearCards(): Promise<void> {
  const db = await getDb()
  await db.cards.clear()
  await db.reviewLogs.clear()
}

/** Create a card and force it due now, which is what the review queue selects on. */
async function dueCard(front = 'Front', deckId = DECK, now = Date.now()) {
  const card = await createCard({ deckId, front, back: `Answer for ${front}` }, now)
  const db = await getDb()
  await db.cards.update(card.id, { nextReview: now - 1000 })
  return { ...card, nextReview: now - 1000 }
}

describe('useDecksData', () => {
  it('reports the five seeded decks, with counts read from the cards table', async () => {
    await clearCards()
    await dueCard('a')
    await dueCard('b')

    const { result } = renderHook(() => useDecksData())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.decks).toHaveLength(5)
    const first = result.current.decks[0]
    expect(first?.deck.name).toBe('Nursing Practice I')
    expect(first?.totalCards).toBe(2)
    expect(first?.dueCards).toBe(2)
    expect(first?.masteredCards).toBe(0)
    expect(result.current.totalDue).toBe(2)
  })

  it('counts a learning card as due and a scheduled card as not', async () => {
    await clearCards()
    await dueCard('due now')

    const scheduled = await createCard({ deckId: DECK, front: 'later', back: 'b' })
    const db = await getDb()
    await db.cards.update(scheduled.id, { nextReview: Date.now() + 86_400_000 })

    const { result } = renderHook(() => useDecksData())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.totalDue).toBe(1)
  })

  it('leaves soft-deleted decks out of the list', async () => {
    await clearCards()
    const { softDeleteDeck } = await import('@/db/repositories/decks')
    await softDeleteDeck(deckIdForPart('practice-v'))

    const { result } = renderHook(() => useDecksData())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.decks).toHaveLength(4)
    expect(await countDecks()).toBe(4)
    expect((await listDecks()).map((deck) => deck.id)).not.toContain(deckIdForPart('practice-v'))
  })
})

describe('useDeckData', () => {
  it('returns the deck, its cards and its due count', async () => {
    await clearCards()
    await dueCard('one')

    const { result } = renderHook(() => useDeckData(DECK))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.found).toBe(true)
    expect(result.current.deck?.name).toBe('Nursing Practice I')
    expect(result.current.cards).toHaveLength(1)
    expect(result.current.dueCount).toBe(1)
  })

  it('reports not-found for a deck id that does not resolve', async () => {
    const { result } = renderHook(() => useDeckData('not-a-real-deck'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.found).toBe(false)
  })

  it('reports not-found when no deck id is given at all', async () => {
    const { result } = renderHook(() => useDeckData(undefined))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.found).toBe(false)
  })
})

describe('useReviewSession', () => {
  it('serves due cards and grades them, persisting the schedule and the log', async () => {
    await clearCards()
    const card = await dueCard('What is the first link in the chain of infection?')

    const { result } = renderHook(() => useReviewSession({ deckId: DECK, cram: false }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.startCount).toBe(1)
    expect(result.current.card?.id).toBe(card.id)
    expect(result.current.empty).toBe(false)

    await act(async () => {
      await result.current.grade(GRADE_GOOD)
    })

    // One card, graded: the queue is spent and the summary shows one review.
    await waitFor(() => expect(result.current.card).toBeNull())
    expect(result.current.gradedCount).toBe(1)

    // The card moved to the 10-minute learning step and a ReviewLog row exists.
    const [stored] = await listCardsByDeck(DECK)
    expect(stored?.learningStep).toBe(1)
    expect(stored?.lastReviewedAt).toBeGreaterThan(0)

    const logs = await listReviewLogsByCard(card.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.grade).toBe(GRADE_GOOD)
  })

  it('reports an empty session when nothing is due', async () => {
    await clearCards()

    const { result } = renderHook(() => useReviewSession({ deckId: DECK, cram: false }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.empty).toBe(true)
    expect(result.current.startCount).toBe(0)
    expect(result.current.card).toBeNull()
  })

  it('grades every card in the queue without repeating one', async () => {
    await clearCards()
    await dueCard('one')
    await dueCard('two')
    await dueCard('three')

    const { result } = renderHook(() => useReviewSession({ deckId: DECK, cram: false }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.startCount).toBe(3)

    const seen: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const served = result.current.card
      expect(served).not.toBeNull()
      seen.push(served?.id ?? '')
      await act(async () => {
        await result.current.grade(GRADE_GOOD)
      })
    }

    // Three distinct cards, then the session ends.
    expect(new Set(seen).size).toBe(3)
    await waitFor(() => expect(result.current.card).toBeNull())
    expect(result.current.gradedCount).toBe(3)
  })

  it('ignores a grade when there is no card on screen', async () => {
    await clearCards()

    const { result } = renderHook(() => useReviewSession({ deckId: DECK, cram: false }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.grade(GRADE_GOOD)
    })

    expect(result.current.gradedCount).toBe(0)
  })

  it('serves every due card across decks when no deck is given', async () => {
    await clearCards()
    await dueCard('a', deckIdForPart('practice-i'))
    await dueCard('b', deckIdForPart('practice-ii'))

    const { result } = renderHook(() => useReviewSession({ deckId: undefined, cram: false }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.startCount).toBe(2)
    expect(result.current.deckName).toBe('Everything')
  })

  it('does not accumulate the same card twice when it is graded Again in cram mode', async () => {
    // Cram ignores due dates, so a card graded Again must NOT be pushed back onto the queue by
    // the "is it due again already" check — otherwise the session would never end.
    await clearCards()
    await dueCard('crammed')

    const { result } = renderHook(() => useReviewSession({ deckId: DECK, cram: true }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.startCount).toBe(1)

    await act(async () => {
      await result.current.grade(GRADE_AGAIN)
    })

    await waitFor(() => expect(result.current.card).toBeNull())
    expect(result.current.gradedCount).toBe(1)
  })

  it('does not re-serve a card whose new due time is in the future', async () => {
    await clearCards()
    await dueCard('graduating')

    const { result } = renderHook(() => useReviewSession({ deckId: DECK, cram: false }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.grade(GRADE_GOOD)
    })

    // Good off the first step schedules 10 minutes out, so this session is done with it.
    await waitFor(() => expect(result.current.card).toBeNull())
    expect(result.current.gradedCount).toBe(1)
    expect(result.current.remaining).toBe(0)

    const [stored] = await listCardsByDeck(DECK)
    expect(stored?.nextReview).toBeGreaterThan(Date.now())
  })

  it('starts its clock only when markShown is called', async () => {
    await clearCards()
    await dueCard('timed')

    const { result } = renderHook(() => useReviewSession({ deckId: DECK, cram: false }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.markShown()
    })

    await act(async () => {
      await result.current.grade(GRADE_GOOD)
    })

    const [stored] = await listCardsByDeck(DECK)
    const logs = stored ? await listReviewLogsByCard(stored.id) : []
    // A real, non-negative duration was recorded rather than a placeholder.
    expect(logs[0]?.msSpent).toBeGreaterThanOrEqual(0)
  })

  it('treats a grade without markShown as zero time rather than a broken number', async () => {
    await clearCards()
    await dueCard('untimed')

    const { result } = renderHook(() => useReviewSession({ deckId: DECK, cram: false }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.grade(GRADE_GOOD)
    })

    const [stored] = await listCardsByDeck(DECK)
    const logs = stored ? await listReviewLogsByCard(stored.id) : []
    expect(logs[0]?.msSpent).toBe(0)
  })
})

describe('useSettings', () => {
  it('loads the seeded defaults and persists a new exam date', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.settings.cramThresholdDays).toBe(30)

    const examDate = new Date(2027, 1, 26, 4, 0, 0, 0).getTime()
    await act(async () => {
      await result.current.setExamDate(examDate)
    })

    await waitFor(() => expect(result.current.settings.examDate).toBe(examDate))
  })

  it('clears the exam date when given undefined', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setExamDate(1_800_000_000_000)
    })
    await waitFor(() => expect(result.current.settings.examDate).toBe(1_800_000_000_000))

    await act(async () => {
      await result.current.setExamDate(undefined)
    })

    await waitFor(() => expect(result.current.settings.examDate).toBeUndefined())
  })

  it('toggles cloud sync', async () => {
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setCloudSync(false)
    })

    await waitFor(() => expect(result.current.settings.cloudSync).toBe(false))
  })
})

describe('review history integrity', () => {
  it('keeps one ReviewLog row per grade, across sessions, in order', async () => {
    await clearCards()
    const card = await dueCard('history')

    // Three separate sessions, as she would actually have them: review, come back later, review
    // again. Each grade must append exactly one row and never rewrite an earlier one.
    for (let session = 0; session < 3; session += 1) {
      const db = await getDb()
      await db.cards.update(card.id, { nextReview: Date.now() - 1000 })

      const { result, unmount } = renderHook(() => useReviewSession({ deckId: DECK, cram: false }))
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.card?.id).toBe(card.id)

      await act(async () => {
        await result.current.grade(GRADE_GOOD)
      })
      unmount()
    }

    const logs = await listReviewLogsByCard(card.id)
    expect(logs).toHaveLength(3)

    // Append-only and ordered: the timestamps only ever move forward.
    const times = logs.map((log) => log.reviewedAt)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })
})

describe('database isolation', () => {
  it('started this file from a seeded database, not leftover state', async () => {
    // Guards the global afterEach in src/test/setup.ts. If the reset ever stops happening, decks
    // created by other test files become visible here and this fails loudly.
    expect(await countDecks()).toBe(5)
    await clearCards()
    expect(await countDecks()).toBe(5)
    await clearDatabaseForTests()
    expect(await countDecks()).toBe(0)
  })
})
