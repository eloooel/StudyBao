import { useCallback, useMemo, useState } from 'react'

import { createCards } from '@/db/repositories/cards'
import { notifyDataChanged } from '@/lib/use-database-value'
import { entryId } from '../lib/batch'
import { clearDraft, loadDraft, saveDraft, type IngestDraft } from '../lib/draft-storage'
import { parseText } from '../lib/parse'
import type { LeftoverQueueEntry, ReviewCard } from '../types'

/**
 * Layer 2 — the ingest batch: parse it, decide about it, write it, and keep it across a
 * reload while doing so.
 *
 * The draft is the state. Every decision re-persists it, so a reload resumes the same
 * unreviewed remainder and the same position rather than losing minutes of curation.
 * `loadDraft()` is the read, and there is deliberately no mirror in a store: two copies of
 * the batch would be able to disagree, which is the staleness `useDatabaseValue` exists to
 * avoid on the database side.
 *
 * Nothing here writes a card until she accepts one, and accepting writes through
 * `createCards` — one transaction for the whole batch, so a partial write cannot happen.
 */

export function useIngestDraft(): IngestDraft | undefined {
  // Read once per mount, not on every render: a reload is what we are protecting against,
  // and re-reading would fight the writes this screen is making.
  return useMemo(() => loadDraft(), [])
}

export interface IngestActions {
  /** Parse text and start a batch. Returns the draft so the caller can route to the review. */
  startBatch: (input: { text: string; deckId: string; sourceLabel: string }) => {
    draft: IngestDraft
    outcome: ReturnType<typeof saveDraft>
  }
  acceptCard: (cardId: string) => Promise<void>
  /** Accept every pending card in one write. */
  acceptAll: () => Promise<void>
  discardCard: (cardId: string) => Promise<void>
  updateCardText: (cardId: string, values: { front: string; back: string }) => void
  /** Turn a leftover entry into a card she can accept. */
  convertLeftover: (entry: LeftoverQueueEntry, values: { front: string; back: string }) => void
  discardLeftover: (entry: LeftoverQueueEntry) => void
  finish: () => void
  saving: boolean
  error?: string
}

/**
 * Writes for the review screen.
 *
 * `draft` is passed in rather than read here because the page already holds it, and two
 * independent reads of session storage could differ mid-render.
 */
export function useIngestActions(
  draft: IngestDraft | undefined,
  onDraftChange: (next: IngestDraft) => void,
): IngestActions {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const persist = useCallback(
    (next: IngestDraft) => {
      onDraftChange(next)
      // Best-effort: a refused save is reported by `useIngestPersistence` on the screen
      // rather than blocking the decision she just made.
      saveDraft(next)
    },
    [onDraftChange],
  )

  const acceptCards = useCallback(
    async (cardIds: readonly string[]) => {
      if (draft === undefined || cardIds.length === 0) return

      const toWrite = draft.cards.filter((card) => cardIds.includes(card.id))
      if (toWrite.length === 0) return

      setSaving(true)
      setError(undefined)
      try {
        await createCards(
          toWrite.map((card) => ({ deckId: draft.deckId, front: card.front, back: card.back })),
        )
        // Only after the transaction commits are they marked accepted. Marking first would
        // show a card as saved when it is not, which is the one lie this screen must not tell.
        persist({
          ...draft,
          cards: draft.cards.map((card) =>
            cardIds.includes(card.id) ? { ...card, status: 'accepted' as const } : card,
          ),
        })
        notifyDataChanged()
      } catch {
        setError(
          "Those cards didn't save, so they're still here waiting. Try again — if it keeps happening, your device may be out of space.",
        )
      } finally {
        setSaving(false)
      }
    },
    [draft, persist],
  )

  const acceptCard = useCallback((cardId: string) => acceptCards([cardId]), [acceptCards])

  const acceptAll = useCallback(() => {
    if (draft === undefined) return Promise.resolve()
    return acceptCards(draft.cards.filter((card) => card.status === 'pending').map((c) => c.id))
  }, [acceptCards, draft])

  const discardCard = useCallback(
    (cardId: string) => {
      if (draft === undefined) return Promise.resolve()
      persist({
        ...draft,
        cards: draft.cards.map((card) =>
          card.id === cardId ? { ...card, status: 'discarded' as const } : card,
        ),
      })
      return Promise.resolve()
    },
    [draft, persist],
  )

  const updateCardText = useCallback(
    (cardId: string, values: { front: string; back: string }) => {
      if (draft === undefined) return
      persist({
        ...draft,
        cards: draft.cards.map((card) =>
          card.id === cardId
            ? { ...card, front: values.front.trim(), back: values.back.trim() }
            : card,
        ),
      })
    },
    [draft, persist],
  )

  const convertLeftover = useCallback(
    (entry: LeftoverQueueEntry, values: { front: string; back: string }) => {
      if (draft === undefined) return

      const id = entryId(entry)
      const card: ReviewCard = {
        id: crypto.randomUUID(),
        front: values.front.trim(),
        back: values.back.trim(),
        origin: 'manual',
        status: 'pending',
        sourceLines: entry.sourceLines,
      }

      persist({
        ...draft,
        cards: [...draft.cards, card],
        convertedLeftoverIds: draft.convertedLeftoverIds.includes(id)
          ? draft.convertedLeftoverIds
          : [...draft.convertedLeftoverIds, id],
      })
    },
    [draft, persist],
  )

  const discardLeftover = useCallback(
    (entry: LeftoverQueueEntry) => {
      if (draft === undefined) return
      const id = entryId(entry)
      persist({
        ...draft,
        convertedLeftoverIds: draft.convertedLeftoverIds.includes(id)
          ? draft.convertedLeftoverIds
          : [...draft.convertedLeftoverIds, id],
      })
    },
    [draft, persist],
  )

  const finish = useCallback(() => {
    clearDraft()
  }, [])

  return {
    startBatch: useCallback((input: { text: string; deckId: string; sourceLabel: string }) => {
      const { lines, result } = parseText(input.text)
      const draft: IngestDraft = {
        version: 1,
        deckId: input.deckId,
        sourceLabel: input.sourceLabel,
        sourceText: lines.map((line) => line.text).join('\n'),
        cards: result.cards.map((card) => ({
          id: crypto.randomUUID(),
          front: card.front,
          back: card.back,
          origin: 'parsed' as const,
          status: 'pending' as const,
          sourceLines: card.sourceLines,
        })),
        leftover: result.leftover,
        convertedLeftoverIds: [],
        startedAt: Date.now(),
      }

      return { draft, outcome: saveDraft(draft) }
    }, []),
    acceptCard,
    acceptAll,
    discardCard,
    updateCardText,
    convertLeftover,
    discardLeftover,
    finish,
    saving,
    ...(error === undefined ? {} : { error }),
  }
}
