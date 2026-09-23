import type { Card } from '@/db/types'
import { studyDaysBetween } from '@/lib/study-day'

/**
 * What to review, and in what order. Pure functions over already-loaded cards, so the
 * decisions are testable without a database and the hooks stay thin.
 */

/** Cards whose `nextReview` has arrived. The due query, in one place. */
export function selectDueCards(cards: readonly Card[], now: number): Card[] {
  return cards.filter((card) => card.nextReview <= now)
}

/**
 * Cram order: **never-reviewed cards first**, then most-lapsed and most-stale.
 *
 * Cram mode ignores due dates entirely — that is the whole feature. Within the ignore, her
 * scarce time should go to the cards most likely to be wrong: the ones she keeps failing, and
 * the ones she has not seen in the longest.
 *
 * A card she has never reviewed has no `lastReviewedAt`, and measuring its staleness from
 * `createdAt` rather than treating it as infinitely stale is deliberate. An `Infinity` here
 * would make the comparator non-deterministic when two unreviewed cards meet (`Infinity -
 * Infinity` is `NaN`), and a card added this morning is genuinely not as urgent as one she has
 * failed four times. The two are still both ahead of everything she has reviewed, because
 * `lapses + 1` weights the untouched card at 1 and the staleness term is measured in days.
 *
 * Deterministic all the way down: ties break on deck order, then on card id, so the queue she
 * sees is the queue the test asserts.
 */
export function orderForCram(
  cards: readonly Card[],
  deckOrder: readonly string[],
  now: number,
): Card[] {
  const orderIndex = new Map(deckOrder.map((deckId, index) => [deckId, index]))

  return [...cards].sort(
    (a, b) =>
      cramScore(b, now) - cramScore(a, now) ||
      deckIndexOf(orderIndex, a) - deckIndexOf(orderIndex, b) ||
      a.id.localeCompare(b.id),
  )
}

/**
 * Weakness × staleness, as the build guide describes it, made concrete.
 *
 * `(lapses + 1) × daysSinceLastReview`. The `+ 1` matters: without it a card with no lapses
 * would score 0 and sort last regardless of how long it had been forgotten, which is exactly
 * backwards.
 */
export function cramScore(card: Card, now: number): number {
  return (card.lapses + 1) * daysSinceLastTouched(card, now)
}

/**
 * Study days since the card was last reviewed, or since it was created if it never has been.
 *
 * Reported for a never-reviewed card as its age in days rather than `Infinity` — see
 * `orderForCram` for why that is a correctness requirement and not a preference.
 */
export function daysSinceLastTouched(card: Card, now: number): number {
  const since = card.lastReviewedAt ?? card.createdAt
  return Math.max(0, studyDaysBetween(since, now))
}

/** Queue order when cram is off: soonest due first, deterministic on ties. */
export function orderByDue(cards: readonly Card[]): Card[] {
  return [...cards].sort(
    (a, b) => a.nextReview - b.nextReview || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )
}

function deckIndexOf(order: Map<string, number>, card: Card): number {
  // A card in a deck that is somehow not in the order list sorts last rather than being
  // dropped — a card she cannot see is worse than one she sees slightly late.
  return order.get(card.deckId) ?? Number.MAX_SAFE_INTEGER
}
