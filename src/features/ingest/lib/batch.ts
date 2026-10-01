import type { LeftoverQueueEntry, ReviewCard } from '../types'

/**
 * Batch progress, as arithmetic rather than as something the view works out for itself.
 *
 * The review screen's job is to leave nothing behind, and "nothing was left behind" is a
 * claim about counts. Keeping the counts here means the claim is unit-tested instead of
 * inferred from JSX.
 */

export interface BatchProgress {
  /** Cards still awaiting a decision. */
  pending: number
  accepted: number
  /** Deliberately set aside by her, not silently dropped. */
  discarded: number
  /** Leftover entries that have not been converted into a card yet. */
  leftoverRemaining: number
  /**
   * True only when every proposed card has been decided **and** every remaining leftover
   * has been dealt with. Anything less and there is still work on screen.
   */
  done: boolean
}

/**
 * Batch progress.
 *
 * `convertedLeftoverIds` is the list of leftovers **already dealt with** (converted into a
 * card, or deliberately set aside), so the remaining count is the entries *not* in it. Getting
 * that the wrong way round makes the screen say "2 waiting below" the moment she deals with the
 * last one, and never lets the batch report as finished — which a test caught here.
 */
export function batchProgress(
  cards: readonly ReviewCard[],
  leftover: readonly LeftoverQueueEntry[],
  convertedLeftoverIds: readonly string[],
): BatchProgress {
  const pending = cards.filter((card) => card.status === 'pending').length
  const accepted = cards.filter((card) => card.status === 'accepted').length
  const discarded = cards.filter((card) => card.status === 'discarded').length
  const leftoverRemaining = leftover.filter(
    (entry) => !convertedLeftoverIds.includes(entryId(entry)),
  ).length

  return {
    pending,
    accepted,
    discarded,
    leftoverRemaining,
    done: pending === 0 && leftoverRemaining === 0,
  }
}

/**
 * A stable id for a leftover entry, derived from its provenance.
 *
 * Needed because the parser's output has no ids of its own, and the draft must be able to
 * say which leftovers she has already converted across a reload. Provenance is the natural
 * key: two leftover entries can hold identical text and still be different lines, so text
 * would collide. `sourceLines` cannot — a line belongs to exactly one output, which is the
 * invariant `parse` enforces.
 */
export function entryId(entry: LeftoverQueueEntry): string {
  return `lines:${entry.sourceLines.join(',')}`
}
