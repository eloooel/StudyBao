import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { DeckListView } from '../components/deck-list-view'
import { useDeckActions } from '../hooks/use-deck-actions'
import { useDecksData } from '../hooks/use-decks-data'
import type { DeckSummary } from '../types'

/**
 * Layer 1 — thin route component.
 *
 * Cram mode is read from the URL rather than from a store, so "review everything due" and
 * "cram" are two different links she can bookmark and refresh into.
 *
 * ## Deleting a deck
 *
 * The confirmation lives here rather than in the view so `DeckListView` stays pure JSX that cannot
 * delete anything, and it is deliberately the **same dialog idiom** as the card delete in
 * `deck-detail.page.tsx` — title, `description`, a "Keep it" cancel and a named destructive button —
 * rather than a second way of confirming. The count comes from `DeckSummary.totalCards`, which the
 * row already has, so opening this dialog costs no extra read.
 *
 * Calling `deleteDeck` is a **soft** delete: the deck and its cards are tombstoned in one
 * transaction, and `ReviewLog` is not touched. That is not an implementation detail she should have
 * to know, but it is why the dialog says her review history stays — the alternative sentence, that
 * everything about the deck is gone, would be false.
 */
export default function FlashcardsPage() {
  const navigate = useNavigate()
  const { decks, totalDue, loading } = useDecksData()
  const { deleteDeck } = useDeckActions()

  /**
   * The deck whose deletion is being confirmed, with the counts it was opened at so the dialog
   * cannot disagree with itself while it is on screen.
   */
  const [pendingDelete, setPendingDelete] = useState<DeckSummary | undefined>(undefined)

  return (
    <>
      <DeckListView
        decks={decks}
        loading={loading}
        totalDue={totalDue}
        onOpenDeck={(deckId) => void navigate(`/cards/${deckId}`)}
        onStartReview={() => void navigate('/cards/review')}
        onAddFromNotes={() => void navigate('/cards/ingest')}
        onDeleteDeck={(deck) => {
          const summary = decks.find((entry) => entry.deck.id === deck.id)
          // Only what is actually on screen can be deleted, so a stale row cannot open a dialog
          // describing a deck the list no longer shows.
          if (summary) setPendingDelete(summary)
        }}
      />

      <Modal
        open={pendingDelete !== undefined}
        onClose={() => setPendingDelete(undefined)}
        title={`Delete ${pendingDelete?.deck.name ?? 'this deck'}?`}
        description={
          pendingDelete && pendingDelete.totalCards > 0
            ? `Its ${String(pendingDelete.totalCards)} card${
                pendingDelete.totalCards === 1 ? '' : 's'
              } go with it. This can’t be undone from here.`
            : 'It’s empty, so nothing goes with it. This can’t be undone from here.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(undefined)}>
              Keep it
            </Button>
            <Button
              variant="strong"
              onClick={() => {
                if (pendingDelete) void deleteDeck(pendingDelete.deck.id)
                // She stays on the deck list, which is where she already is: no navigation to lose
                // her, and the row goes as the shared change signal re-reads.
                setPendingDelete(undefined)
              }}
            >
              {pendingDelete && pendingDelete.totalCards > 0
                ? `Delete ${String(pendingDelete.totalCards)} card${
                    pendingDelete.totalCards === 1 ? '' : 's'
                  }`
                : 'Delete this deck'}
            </Button>
          </>
        }
      >
        {pendingDelete && pendingDelete.totalCards > 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-ink-muted">
              The {String(pendingDelete.totalCards)} card
              {pendingDelete.totalCards === 1 ? '' : 's'} in{' '}
              <span className="font-semibold text-ink">{pendingDelete.deck.name}</span> won’t come
              up again, and nothing new can be added to it.
            </p>
            <p className="text-sm leading-relaxed text-ink-muted">
              Your review history stays — it’s what your progress is built on. The other decks
              aren’t touched.
            </p>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-ink-muted">
            Nothing has been added to{' '}
            <span className="font-semibold text-ink">{pendingDelete?.deck.name}</span> yet, so
            there’s nothing else to lose. The other decks aren’t touched.
          </p>
        )}
      </Modal>
    </>
  )
}
