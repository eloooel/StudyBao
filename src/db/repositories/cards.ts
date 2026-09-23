import { firstReviewAt, newCardState, schedule } from '@/features/flashcards/lib/sm2'
import { getDb } from '../schema'
import type { Card, Grade } from '../types'
import type { ReviewLog } from '../types'

/**
 * Cards, and the one write that matters: recording a review.
 *
 * Everything here filters tombstones. Nothing here hard-deletes, ever — see
 * docs/ai/change-data-model.md for why a hard delete comes back.
 */

export interface CardDraft {
  deckId: string
  front: string
  back: string
  tags?: string[]
}

export interface CardTextEdit {
  front: string
  back: string
  tags: string[]
}

export async function listCardsByDeck(deckId: string): Promise<Card[]> {
  const db = await getDb()
  const cards = await db.cards.where('deckId').equals(deckId).toArray()
  return liveCards(cards).sort(bySoonestDue)
}

export async function countCardsByDeck(deckId: string): Promise<number> {
  const db = await getDb()
  const cards = await db.cards.where('deckId').equals(deckId).toArray()
  return liveCards(cards).length
}

/** Every live card across every deck. Used by cram mode, which ignores deck boundaries. */
export async function listAllCards(): Promise<Card[]> {
  const db = await getDb()
  return liveCards(await db.cards.toArray())
}

export async function getCard(id: string): Promise<Card | undefined> {
  const db = await getDb()
  const card = await db.cards.get(id)
  return card && card.deletedAt === undefined ? card : undefined
}

/**
 * A new card, with fresh SM-2 state and a first learning step.
 *
 * `createdAt` is stamped separately from `updatedAt` even though they are equal today:
 * `updatedAt` moves on every edit, and cram mode measures staleness for a never-reviewed
 * card from when it was created. Deriving one from the other would be wrong the first time
 * she edits a card.
 */
export async function createCard(draft: CardDraft, now = Date.now()): Promise<Card> {
  const db = await getDb()
  const state = newCardState()

  // A new card waits on the first learning step, so its due time is a minute out rather
  // than `now`. `nextReview` is not part of `SchedulerState` — it is the schedule's output —
  // so this comes from the scheduler's own rule rather than a second copy of it.
  const nextReview = firstReviewAt(now)

  const card: Card = {
    id: crypto.randomUUID(),
    deckId: draft.deckId,
    front: draft.front.trim(),
    back: draft.back.trim(),
    tags: draft.tags ?? [],
    ...state,
    nextReview,
    createdAt: now,
    updatedAt: now,
  }

  await db.cards.add(card)
  return card
}

/**
 * Edit a card's text, **preserving its scheduling state**.
 *
 * Deliberately not Anki's reset-on-edit. Cards here will mostly arrive from OCR and a
 * parser (Workflow C), so editing is the normal case rather than the exception, and
 * resetting progress every time she fixes a typo would quietly destroy weeks of spacing.
 * For the genuine case — an edit that changes what the card means — there is
 * `resetCardProgress` below, which is explicit and hers to press.
 */
export async function updateCardText(
  id: string,
  edit: CardTextEdit,
  now = Date.now(),
): Promise<void> {
  const db = await getDb()
  await db.cards.update(id, {
    front: edit.front.trim(),
    back: edit.back.trim(),
    tags: edit.tags,
    updatedAt: now,
  })
}

/**
 * Reset a card to a brand-new scheduling state, keeping its text and history.
 *
 * The escape hatch for "I edited this and it now means something different". It does **not**
 * touch `ReviewLog`: the reviews that happened did happen, and deleting them would corrupt
 * `msSpent` aggregates and the future FSRS migration for no benefit. `lapses` resets with
 * the rest because it describes the current state of this card, and the history is still on
 * the log rows.
 */
export async function resetCardProgress(id: string, now = Date.now()): Promise<void> {
  const db = await getDb()
  const state = newCardState()

  await db.cards.update(id, {
    ...state,
    nextReview: now,
    updatedAt: now,
  })
}

/** Soft-delete a single card. */
export async function softDeleteCard(id: string, now = Date.now()): Promise<void> {
  const db = await getDb()
  await db.cards.update(id, { deletedAt: now, updatedAt: now })
}

/**
 * Grading: advance the scheduler, write the card, and append the `ReviewLog` — atomically.
 *
 * **One transaction, on purpose.** If the card write landed and the log row did not, the
 * history would have a hole that cannot be backfilled, and Workflow F's weak-topic feature
 * and any later move to FSRS would both be computing on missing data. A partial write here
 * is silent and permanent, so it is made impossible rather than unlikely.
 *
 * `msSpent` is passed in already measured (see the review hook, which uses
 * `performance.now()`), because a monotonic duration and a wall-clock instant are different
 * questions and this function should not be guessing at either.
 */
export async function recordReview(
  card: Card,
  grade: Grade,
  msSpent: number,
  now = Date.now(),
): Promise<Card> {
  const db = await getDb()
  const next = schedule(card, grade, now)

  const updated: Card = {
    ...card,
    easeFactor: next.easeFactor,
    intervalDays: next.intervalDays,
    repetitions: next.repetitions,
    lapses: next.lapses,
    learningStep: next.learningStep,
    nextReview: next.nextReview,
    lastReviewedAt: now,
    updatedAt: now,
  }

  const log: ReviewLog = {
    id: crypto.randomUUID(),
    cardId: card.id,
    deckId: card.deckId,
    reviewedAt: now,
    grade,
    msSpent: Math.max(0, Math.round(msSpent)),
  }

  await db.transaction('rw', [db.cards, db.reviewLogs], async () => {
    await db.cards.put(updated)
    await db.reviewLogs.add(log)
  })

  return updated
}

/** Tombstones only. Workflow S pushes these; nothing in the UI reads them. */
export async function listDeletedCards(): Promise<Card[]> {
  const db = await getDb()
  return (await db.cards.toArray()).filter((card) => card.deletedAt !== undefined)
}

function liveCards(cards: Card[]): Card[] {
  return cards.filter((card) => card.deletedAt === undefined)
}

/** Soonest due first, then oldest created, then id — deterministic, so tests can rely on it. */
function bySoonestDue(a: Card, b: Card): number {
  return a.nextReview - b.nextReview || a.createdAt - b.createdAt || a.id.localeCompare(b.id)
}
