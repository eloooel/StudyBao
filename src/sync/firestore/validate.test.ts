import { describe, expect, it } from 'vitest'

import type { AppSettings, Card, Deck, Lesson, ReviewLog, Session } from '@/db/types'

import { validateRemoteRow } from './validate'

/**
 * The remote is untrusted input. These cases exist because every one of them, if it passed, would put a
 * record into her database that something later reads as a real one — most dangerously a `nextReview`
 * or `updatedAt` that is not a number, which silently stops a card coming due or makes a merge compare
 * nonsense.
 */

const deck: Deck = {
  id: 'deck-1',
  subject: 'practice-i',
  name: 'Nursing Practice I',
  scope: 'Scope text',
  updatedAt: 1_000,
}

const card: Card = {
  id: 'card-1',
  deckId: 'deck-1',
  front: 'What is the normal adult respiratory rate?',
  back: '12–20 breaths per minute',
  tags: ['fundamentals'],
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
  learningStep: 0,
  nextReview: 2_000,
  createdAt: 500,
  updatedAt: 1_000,
}

const reviewLog: ReviewLog = {
  id: 'log-1',
  cardId: 'card-1',
  deckId: 'deck-1',
  reviewedAt: 1_000,
  grade: 4,
  msSpent: 5_000,
}

const settings: AppSettings = {
  id: 'app',
  cramThresholdDays: 30,
  cloudSync: true,
  updatedAt: 1_000,
  seededAt: 500,
}

const session: Session = {
  id: 'session-1',
  type: 'working',
  startedAt: 1_000,
  endedAt: 1_500_000,
  plannedMs: 1_500_000,
  actualMs: 1_500_000,
  completed: true,
  tabHiddenCount: 0,
  updatedAt: 1_500_000,
}

const lesson: Lesson = {
  id: 'lesson-1',
  subject: 'practice-ii',
  topic: 'Fluid and electrolytes',
  status: 'reviewing',
  updatedAt: 1_000,
}

describe('validateRemoteRow', () => {
  it('accepts a valid row for each of the six tables', () => {
    expect(validateRemoteRow('decks', deck)).toEqual({ ok: true, row: deck })
    expect(validateRemoteRow('cards', card)).toEqual({ ok: true, row: card })
    expect(validateRemoteRow('reviewLogs', reviewLog)).toEqual({ ok: true, row: reviewLog })
    expect(validateRemoteRow('settings', settings)).toEqual({ ok: true, row: settings })
    expect(validateRemoteRow('sessions', session)).toEqual({ ok: true, row: session })
    expect(validateRemoteRow('lessons', lesson)).toEqual({ ok: true, row: lesson })
  })

  it('accepts a ReviewLog without updatedAt — it is append-only and has no such field', () => {
    // The one deliberate exception to the updatedAt rule. Rejecting this would make every review log
    // ever written by the other device invisible to sync.
    expect(validateRemoteRow('reviewLogs', reviewLog).ok).toBe(true)
    expect(reviewLog).not.toHaveProperty('updatedAt')
  })

  it('rejects a mutable row with no updatedAt instead of writing it', () => {
    const withoutStamp: Record<string, unknown> = { ...deck }
    delete withoutStamp.updatedAt

    const result = validateRemoteRow('decks', withoutStamp)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('updatedAt')
  })

  it('rejects a timestamp that is not a finite number', () => {
    expect(validateRemoteRow('decks', { ...deck, updatedAt: Number.NaN }).ok).toBe(false)
    expect(validateRemoteRow('decks', { ...deck, updatedAt: Infinity }).ok).toBe(false)
    expect(validateRemoteRow('decks', { ...deck, updatedAt: '1000' }).ok).toBe(false)
  })

  it('rejects a deletedAt of null, which would read as a tombstone', () => {
    // `deletedAt === undefined` is how every read tells a live record from a tombstone. A null passes
    // that check as a tombstone while carrying no timestamp, so it must never get in.
    expect(validateRemoteRow('decks', { ...deck, deletedAt: null }).ok).toBe(false)
    expect(validateRemoteRow('decks', { ...deck, deletedAt: 900 }).ok).toBe(true)
  })

  it("rejects a string grade — '4' is not the grade 4", () => {
    expect(validateRemoteRow('reviewLogs', { ...reviewLog, grade: '4' }).ok).toBe(false)
    expect(validateRemoteRow('reviewLogs', { ...reviewLog, grade: 2 }).ok).toBe(false)
  })

  it('rejects a card whose scheduling state is not numeric', () => {
    expect(validateRemoteRow('cards', { ...card, nextReview: '2000' }).ok).toBe(false)
    expect(validateRemoteRow('cards', { ...card, tags: 'fundamentals' }).ok).toBe(false)
    expect(validateRemoteRow('cards', { ...card, learningStep: '0' }).ok).toBe(false)
    expect(validateRemoteRow('cards', { ...card, learningStep: null }).ok).toBe(true)
  })

  it('rejects a settings row that is not the singleton', () => {
    expect(validateRemoteRow('settings', { ...settings, id: 'other' }).ok).toBe(false)
  })

  it('rejects an unknown enum value', () => {
    expect(validateRemoteRow('lessons', { ...lesson, status: 'done' }).ok).toBe(false)
    expect(validateRemoteRow('sessions', { ...session, type: 'work' }).ok).toBe(false)
    expect(validateRemoteRow('decks', { ...deck, subject: 'practice-vi' }).ok).toBe(false)
  })

  it('rejects a row that is not an object, or has no id', () => {
    expect(validateRemoteRow('decks', null).ok).toBe(false)
    expect(validateRemoteRow('decks', [deck]).ok).toBe(false)
    expect(validateRemoteRow('decks', 'a deck').ok).toBe(false)
    expect(validateRemoteRow('decks', { ...deck, id: '' }).ok).toBe(false)
    expect(validateRemoteRow('decks', { ...deck, id: 7 }).ok).toBe(false)
  })

  it('keeps unknown fields, so a newer device does not lose data through an older one', () => {
    // The row is not rebuilt field by field: a field this build does not know about survives the
    // round-trip instead of being stripped and pushed back over the good copy.
    const withExtra = { ...deck, someFutureField: { nested: true } }

    const result = validateRemoteRow('decks', withExtra)

    expect(result).toEqual({ ok: true, row: withExtra })
  })
})
