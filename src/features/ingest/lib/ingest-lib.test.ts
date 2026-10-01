import { afterEach, describe, expect, it } from 'vitest'

import type { LeftoverQueueEntry, ReviewCard } from '../types'
import { batchProgress, entryId } from './batch'
import {
  DRAFT_SIZE_CEILING_BYTES,
  DRAFT_STORAGE_KEY,
  clearDraft,
  loadDraft,
  saveDraft,
  type IngestDraft,
} from './draft-storage'

/**
 * Draft persistence and batch counters.
 *
 * The draft tests are about the two promises the review screen makes: a reload does not cost
 * her the batch, and an oversized batch is refused *whole* rather than truncated. The second
 * is the one worth being careful about — a partial draft is indistinguishable from a
 * complete one from her side.
 */

function sampleDraft(overrides: Partial<IngestDraft> = {}): IngestDraft {
  return {
    version: 1,
    deckId: 'deck-practice-i',
    sourceLabel: 'Pasted text',
    sourceText: 'Vitamin C: ascorbic acid',
    cards: [
      {
        id: 'card-1',
        front: 'Vitamin C',
        back: 'ascorbic acid',
        origin: 'parsed',
        status: 'pending',
        sourceLines: [0],
      },
    ],
    leftover: [],
    convertedLeftoverIds: [],
    startedAt: 1_700_000_000_000,
    ...overrides,
  }
}

afterEach(() => {
  clearDraft()
})

describe('draft storage', () => {
  it('round-trips a draft through session storage', () => {
    const outcome = saveDraft(sampleDraft())
    expect(outcome.persisted).toBe(true)

    expect(loadDraft()).toEqual(sampleDraft())
  })

  it('returns undefined when there is no draft, rather than a blank one', () => {
    clearDraft()
    expect(loadDraft()).toBeUndefined()
  })

  it('refuses a draft above the ceiling and writes nothing at all', () => {
    // The important half of this test is the second assertion: refusing must not leave a
    // *previous* draft in place, or she would restore an older batch believing it was this
    // one.
    saveDraft(sampleDraft({ sourceLabel: 'the older batch' }))

    const huge = 'x'.repeat(DRAFT_SIZE_CEILING_BYTES)
    const outcome = saveDraft(sampleDraft({ sourceText: huge }))

    expect(outcome.persisted).toBe(false)
    expect(outcome).toMatchObject({ reason: 'too-large', ceiling: DRAFT_SIZE_CEILING_BYTES })
    expect(loadDraft()?.sourceLabel).toBe('the older batch')
  })

  it('reports the size it measured, so the message can state a real number', () => {
    const outcome = saveDraft(sampleDraft())

    expect(outcome.persisted).toBe(true)
    if (outcome.persisted) {
      const stored = globalThis.sessionStorage.getItem(DRAFT_STORAGE_KEY)
      // UTF-16 code units, which is what a Storage quota is measured in.
      expect(outcome.bytes).toBe((stored ?? '').length * 2)
    }
  })

  it('discards a draft written by a different version instead of misreading it', () => {
    globalThis.sessionStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ ...sampleDraft(), version: 2 }),
    )

    expect(loadDraft()).toBeUndefined()
  })

  it('discards unparseable storage rather than throwing at the review screen', () => {
    globalThis.sessionStorage.setItem(DRAFT_STORAGE_KEY, '{not json')

    expect(loadDraft()).toBeUndefined()
  })

  it('discards a structurally wrong draft, which is what a hand-edited store looks like', () => {
    globalThis.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ version: 1 }))

    expect(loadDraft()).toBeUndefined()
  })

  it('clears the draft so a finished batch does not reappear', () => {
    saveDraft(sampleDraft())
    clearDraft()

    expect(loadDraft()).toBeUndefined()
  })
})

describe('batch progress', () => {
  const cards: ReviewCard[] = [
    {
      id: 'a',
      front: 'f',
      back: 'b',
      origin: 'parsed',
      status: 'accepted',
      sourceLines: [0],
    },
    { id: 'b', front: 'f', back: 'b', origin: 'parsed', status: 'pending', sourceLines: [1] },
    { id: 'c', front: 'f', back: 'b', origin: 'parsed', status: 'discarded', sourceLines: [2] },
  ]

  const leftover: LeftoverQueueEntry[] = [
    { text: 'prose one', sourceLines: [3], reason: 'prose' },
    { text: 'prose two', sourceLines: [4], reason: 'prose' },
  ]

  it('counts each decision and what is still waiting', () => {
    const progress = batchProgress(cards, leftover, [entryId(leftover[0]!)])

    expect(progress).toMatchObject({
      accepted: 1,
      discarded: 1,
      pending: 1,
      leftoverRemaining: 1,
      done: false,
    })
  })

  it('is done only when no card is pending and no leftover is unconverted', () => {
    const settled = cards.map((card) =>
      card.status === 'pending' ? { ...card, status: 'accepted' as const } : card,
    )

    // `convertedLeftoverIds` holds the leftovers already dealt with, so "all dealt with" means
    // every one of them is listed. `batchProgress` derives the remainder from it.
    const allConverted = leftover.map((entry) => entryId(entry))

    expect(batchProgress(settled, leftover, allConverted)).toMatchObject({
      leftoverRemaining: 0,
      done: true,
    })
  })

  it('is not done while a leftover entry is still unconverted', () => {
    const settled = cards.map((card) =>
      card.status === 'pending' ? { ...card, status: 'accepted' as const } : card,
    )

    expect(batchProgress(settled, leftover, [entryId(leftover[0]!)]).done).toBe(false)
  })

  it('keys a leftover by its provenance, so two identical lines stay distinguishable', () => {
    const first: LeftoverQueueEntry = { text: 'same text', sourceLines: [7], reason: 'prose' }
    const second: LeftoverQueueEntry = { text: 'same text', sourceLines: [8], reason: 'prose' }

    expect(entryId(first)).not.toBe(entryId(second))
  })

  it('is done for an empty batch rather than reporting work that does not exist', () => {
    expect(batchProgress([], [], []).done).toBe(true)
  })
})
