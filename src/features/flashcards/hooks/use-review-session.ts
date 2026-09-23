import { useCallback, useEffect, useRef, useState } from 'react'

import { getCard, listAllCards, listCardsByDeck, recordReview } from '@/db/repositories/cards'
import { listDecks } from '@/db/repositories/decks'
import type { Card, Grade } from '@/db/types'
import { orderByDue, orderForCram, selectDueCards } from '../lib/queue'
import { notifyDataChanged, useDatabaseValue } from './use-database-value'

/**
 * Layer 2 — the review session.
 *
 * The queue is built from the database once, when the screen mounts, and then held in state for
 * the session. That is what makes a mid-session refresh safe: the page re-mounts, re-reads
 * Dexie, and rebuilds the same queue from `nextReview` — cards she already graded are no longer
 * due, and cards she had not reached still are. Only "which card am I on" lives in React, and
 * that is precisely the part a refresh is allowed to forget.
 *
 * Two details that are easy to get wrong:
 *
 * 1. The queue advances by **id**, not by shifting an array, so every card in the snapshot is
 *    replaced by a fresh read before it is shown. Scheduling is decided by persisted state, never
 *    by an object captured at mount.
 * 2. A card is re-served only when a fresh read says it is due again (a 1-minute learning step
 *    really can come round inside one session), and never while cram is on, where "due" has been
 *    deliberately switched off and re-serving would loop forever.
 */

export interface ReviewSessionData {
  deckName: string
  /** The card on screen, or `null` when the session is finished. */
  card: Card | null
  startCount: number
  gradedCount: number
  /** Cards still waiting, excluding the one on screen. */
  remaining: number
  loading: boolean
  /** True when there was nothing to review when the session started. */
  empty: boolean
}

export interface ReviewSessionActions {
  /** Called by the view the instant the answer is shown, so `msSpent` measures thinking time. */
  markShown: () => void
  grade: (grade: Grade) => Promise<void>
}

export interface UseReviewSessionOptions {
  /** Restrict the queue to one deck. `undefined` reviews everything due. */
  deckId?: string
  cram: boolean
}

interface QueueState {
  deckName: string
  ids: string[]
  index: number
  startCount: number
  gradedCount: number
}

export function useReviewSession(
  options: UseReviewSessionOptions,
): ReviewSessionData & ReviewSessionActions {
  const { deckId, cram } = options

  const loadCards = useCallback(async () => {
    const cards = deckId === undefined ? await listAllCards() : await listCardsByDeck(deckId)
    return { cards }
  }, [deckId])

  const { loading, revision } = useDatabaseValue(loadCards, { cards: [] as Card[] })

  const [queue, setQueue] = useState<QueueState | undefined>(undefined)
  const [current, setCurrent] = useState<Card | null>(null)
  // Which deck (and mode) the current queue was built for. Kept in a ref rather than in
  // `queue` state so the effect below can depend on it without re-running after every grade.
  const builtFor = useRef<string | undefined>(undefined)
  const shownAt = useRef<number | null>(null)

  // Build the session queue when the target changes — first mount, or navigating between decks
  // and modes. Rebuilding on a plain data change would reshuffle the queue under her mid-session,
  // which is the bug this session model exists to avoid.
  const target = `${deckId ?? '*'}::${cram ? 'cram' : 'due'}`
  useEffect(() => {
    if (builtFor.current === target) return
    builtFor.current = target

    let cancelled = false

    void (async () => {
      const [decks, cards] = await Promise.all([
        listDecks(),
        deckId === undefined ? listAllCards() : listCardsByDeck(deckId),
      ])
      if (cancelled) return

      const now = Date.now()
      const ordered = cram
        ? orderForCram(
            cards,
            decks.map((deck) => deck.id),
            now,
          )
        : orderByDue(selectDueCards(cards, now))

      setQueue({
        deckName: decks.find((deck) => deck.id === deckId)?.name ?? 'Everything',
        ids: ordered.map((card) => card.id),
        index: 0,
        startCount: ordered.length,
        gradedCount: 0,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [target, deckId, cram])

  // Resolve the id at the cursor into the real, current card. Re-runs whenever the underlying data
  // changes, so what is on screen is always what is in the database.
  //
  // `setCurrent` is only ever called from the promise callback, never synchronously in the effect
  // body — the resolved card is guarded by id, so an in-flight read for the previous card cannot
  // land after the cursor has moved on. The empty-queue case is derived during render rather than
  // pushed into state, which is both simpler and what the react-hooks rule is asking for.
  const currentId = queue?.ids[queue.index]

  useEffect(() => {
    if (currentId === undefined) return

    let cancelled = false
    void getCard(currentId).then((card) => {
      if (!cancelled && card !== undefined) setCurrent(card)
    })

    return () => {
      cancelled = true
    }
  }, [currentId, revision])

  const markShown = useCallback(() => {
    // `performance.now()` is monotonic, so an NTP correction mid-card cannot produce a negative
    // duration the way a `Date.now()` difference can.
    shownAt.current = performance.now()
  }, [])

  const grade = useCallback(
    async (value: Grade) => {
      if (!current) return

      const msSpent = shownAt.current === null ? 0 : performance.now() - shownAt.current
      const updated = await recordReview(current, value, msSpent, Date.now())

      // Ask the database whether this card is due again, rather than trusting the object we
      // were holding — whose `nextReview` is the pre-grade value.
      const fresh = (await getCard(updated.id)) ?? updated
      const dueAgain = !cram && fresh.nextReview <= Date.now()

      shownAt.current = null
      notifyDataChanged()

      setQueue((previous) => {
        if (previous === undefined) return previous

        const remainingIds = previous.ids.slice(previous.index + 1)
        const nextIds = dueAgain ? [...remainingIds, fresh.id] : remainingIds

        return {
          ...previous,
          ids: nextIds,
          index: 0,
          gradedCount: previous.gradedCount + 1,
        }
      })
    },
    [current, cram],
  )

  return {
    deckName: queue?.deckName ?? 'Everything',
    // Derived, not stored: no cursor means no card, and there is no state to keep in step.
    card: currentId === undefined ? null : current,
    startCount: queue?.startCount ?? 0,
    gradedCount: queue?.gradedCount ?? 0,
    remaining: queue === undefined ? 0 : Math.max(0, queue.ids.length - queue.index - 1),
    loading: loading || queue === undefined,
    empty: queue !== undefined && queue.startCount === 0,
    markShown,
    grade,
  }
}
