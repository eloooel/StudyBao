import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { listAllCards, listCardsByDeck, recordReview } from '@/db/repositories/cards'
import { listDecks } from '@/db/repositories/decks'
import type { Card, Grade } from '@/db/types'
import {
  DEFAULT_WAIT_WINDOW_MS,
  orderByDue,
  orderForCram,
  pickNextCard,
  selectDueCards,
} from '../lib/queue'
import { notifyDataChanged, useDatabaseValue } from './use-database-value'

/**
 * Layer 2 — the review session.
 *
 * **Membership is frozen when the session starts; only the timing stays live.** The set of cards
 * this session will consider is built once, from what is due, and the card on screen is then chosen
 * against the clock from that frozen set. Freezing membership is what makes a mid-session refresh
 * safe and stops the queue reshuffling under her after every grade; choosing against the clock is
 * what makes the sub-day learning steps real.
 *
 * **Why the choice must not happen at grade time.** `schedule` guarantees `nextReview > now`, so
 * immediately after grading, "is it due again?" is always false. Deciding there means a card graded
 * Again — scheduled 1 minute out — never returns, which quietly makes `LEARNING_STEPS_MINUTES`
 * unenforceable and defeats a core part of ADR 0003. Instead, after each grade the session re-reads
 * and asks `pickNextCard` what is ready *now*, waiting up to one learning step for a card that is
 * nearly ready.
 *
 * When nothing is ready but cards are coming back, the session polls and reports
 * `waitingToReturn` rather than claiming to be finished.
 */

export interface ReviewSessionData {
  deckName: string
  /** The card on screen, or `null` when nothing is ready right now. */
  card: Card | null
  startCount: number
  gradedCount: number
  /** Cards in this session not yet served. */
  remaining: number
  /** Served and graded, but scheduled to come back — a learning step doing its job. */
  waitingToReturn: number
  loading: boolean
  /** True when there was nothing to review when the session started. */
  empty: boolean
  /** True when everything in the session has been served and nothing is coming back. */
  finished: boolean
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
  /**
   * How long a card may be away and still be served now, in ms. Defaults to the first learning
   * step: without a window, a card scheduled 1 minute out is never served inside a session.
   * Separate from the poll interval so a test can watch the waiting state instead of racing it.
   */
  waitWindowMs?: number
  /**
   * How often to re-check while waiting for a card to come back. Defaults to the wait window, so a
   * test can shorten it rather than sleeping for a real minute.
   */
  pollIntervalMs?: number
}

interface Session {
  deckName: string
  /** The frozen membership: every card id this session will consider, in service order. */
  ids: string[]
  /** Cards already served, so nothing repeats. */
  servedIds: string[]
  startCount: number
  gradedCount: number
}

export function useReviewSession(
  options: UseReviewSessionOptions,
): ReviewSessionData & ReviewSessionActions {
  const {
    deckId,
    cram,
    waitWindowMs = DEFAULT_WAIT_WINDOW_MS,
    pollIntervalMs = waitWindowMs,
  } = options

  const loadCards = useCallback(async () => {
    const [cards, decks] = await Promise.all([
      deckId === undefined ? listAllCards() : listCardsByDeck(deckId),
      listDecks(),
    ])
    return {
      cards,
      // Official exam order, which is what cram's tie-break needs — not the order the cards
      // happen to come back in.
      deckOrder: decks.map((deck) => deck.id),
      deckName: decks.find((deck) => deck.id === deckId)?.name ?? 'Everything',
    }
  }, [deckId])

  const { value, loading, revision } = useDatabaseValue(loadCards, {
    cards: [] as Card[],
    deckOrder: [] as string[],
    deckName: 'Everything',
  })

  const [session, setSession] = useState<Session | undefined>(undefined)
  const [current, setCurrent] = useState<Card | null>(null)
  /** How many served cards are on their way back. For rendering and for deciding whether to poll. */
  const [waitingCount, setWaitingCount] = useState(0)

  // Which deck (and mode) the session was built for. A ref so the effect can depend on it without
  // re-running after every grade.
  const builtFor = useRef<string | undefined>(undefined)
  const shownAt = useRef<number | null>(null)
  // Bumped after every grade and on each poll tick, which is what makes the chooser re-read the clock.
  const [attempt, setAttempt] = useState(0)

  const target = `${deckId ?? '*'}::${cram ? 'cram' : 'due'}`
  const firstReadDone = !loading

  // Freeze the membership once, from the first read that lands for this target.
  useEffect(() => {
    if (builtFor.current === target || !firstReadDone) return
    builtFor.current = target

    const now = Date.now()
    const ordered = cram
      ? orderForCram(value.cards, value.deckOrder, now)
      : orderByDue(selectDueCards(value.cards, now))

    setSession({
      deckName: value.deckName,
      ids: ordered.map((card) => card.id),
      servedIds: [],
      startCount: ordered.length,
      gradedCount: 0,
    })
  }, [target, firstReadDone, cram, value])

  const servedCount = session?.servedIds.length ?? 0
  const nothingOnScreen = current === null

  // Choose the card to show, against the clock. Re-runs after a grade and while waiting for a card
  // to come back.
  //
  // **This reads the database directly rather than the `useDatabaseValue` snapshot.** The snapshot
  // is only refreshed when the shared change signal fires, so a poll-driven attempt would otherwise
  // re-evaluate against a stale card and never notice that a learning step had come due.
  //
  // Everything below is computed from that one fresh read. Deriving the exclusion set from the
  // *previous* attempt's state is the subtle version of the same staleness bug: a card is excluded
  // as "coming back", then becomes due, and is never served because the exclusion was never
  // recomputed.
  //
  // The exclusion rule is the one place normal review and cram genuinely differ:
  //
  // - **Normal review excludes only cards already waiting to come back**, so a card graded Again
  //   returns when its 1-minute step is due — and returns *again* at 10 minutes. Excluding everything
  //   ever served would collapse the 1 → 10 → 1 day ladder into a single repeat.
  // - **Cram excludes everything served**, because it ignores due dates entirely; without that, a
  //   graded card is immediately available again and the session could never end.
  useEffect(() => {
    if (session === undefined || !nothingOnScreen) return

    let cancelled = false

    void (async () => {
      const cards = deckId === undefined ? await listAllCards() : await listCardsByDeck(deckId)
      if (cancelled) return

      const byId = new Map(cards.map((card) => [card.id, card]))
      const candidates = session.ids
        .map((id) => byId.get(id))
        .filter((card): card is Card => card !== undefined)

      const now = Date.now()
      const served = candidates.filter((card) => session.servedIds.includes(card.id))

      // Served and not yet due again. In cram mode nothing is ever "coming back" — due dates are
      // switched off, so the only thing to exclude is what has already been shown.
      const comingBack = cram ? [] : served.filter((card) => card.nextReview > now)
      const excluded = new Set(cram ? session.servedIds : comingBack.map((card) => card.id))

      const pick = pickNextCard(candidates, excluded, now, {
        ignoreDueDates: cram,
        waitWindowMs,
      })

      if (cancelled) return
      if (pick !== undefined) setCurrent(pick)

      // Only re-render when the count she is waiting on actually changes. A card that is due again
      // is deliberately not in `comingBack`: it is back, not coming back.
      setWaitingCount((previous) => (previous === comingBack.length ? previous : comingBack.length))
    })()

    return () => {
      cancelled = true
    }
  }, [session, nothingOnScreen, deckId, cram, waitWindowMs, revision, attempt])

  // While nothing is ready but something is coming back, poll — that is what surfaces a 1-minute
  // learning step instead of the session appearing to end.
  useEffect(() => {
    if (!nothingOnScreen || waitingCount === 0) return

    const timer = setInterval(() => setAttempt((value) => value + 1), pollIntervalMs)
    return () => clearInterval(timer)
  }, [nothingOnScreen, waitingCount, pollIntervalMs])

  const markShown = useCallback(() => {
    // `performance.now()` is monotonic, so an NTP correction mid-card cannot produce a negative
    // duration the way a `Date.now()` difference can.
    shownAt.current = performance.now()
  }, [])

  const grade = useCallback(
    async (value: Grade) => {
      if (!current) return

      const msSpent = shownAt.current === null ? 0 : performance.now() - shownAt.current
      const gradedId = current.id

      await recordReview(current, value, msSpent, Date.now())

      shownAt.current = null
      // Cleared immediately so the previous card's answer cannot linger while the next is chosen.
      setCurrent(null)
      setSession((previous) =>
        previous === undefined
          ? previous
          : {
              ...previous,
              servedIds: [...previous.servedIds, gradedId],
              gradedCount: previous.gradedCount + 1,
            },
      )
      setAttempt((attempted) => attempted + 1)
      notifyDataChanged()
    },
    [current],
  )

  const empty = session !== undefined && session.startCount === 0

  return useMemo(
    () => ({
      deckName: session?.deckName ?? 'Everything',
      card: current,
      startCount: session?.startCount ?? 0,
      gradedCount: session?.gradedCount ?? 0,
      remaining: session === undefined ? 0 : Math.max(0, session.ids.length - servedCount),
      waitingToReturn: current === null ? waitingCount : 0,
      loading: loading || session === undefined,
      empty,
      // Everything in the session served, nothing on screen, nothing on its way back.
      finished:
        session !== undefined &&
        session.ids.length > 0 &&
        servedCount >= session.ids.length &&
        nothingOnScreen &&
        waitingCount === 0,
      markShown,
      grade,
    }),
    [
      session,
      current,
      servedCount,
      waitingCount,
      loading,
      empty,
      nothingOnScreen,
      markShown,
      grade,
    ],
  )
}
