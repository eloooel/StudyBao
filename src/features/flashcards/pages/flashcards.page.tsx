import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { canPurgeDecks } from '@/sync/lib/can-purge'
import { DeckFormView } from '../components/deck-form-view'
import { DeckListView } from '../components/deck-list-view'
import { useDeckActions } from '../hooks/use-deck-actions'
import { useDecksData } from '../hooks/use-decks-data'
import { useSettings } from '../hooks/use-settings'
import type { DeckSummary } from '../types'
import type { RestorableDeck } from '@/db/repositories/decks'

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
 *
 * ## Restoring one
 *
 * `onRestoreDeck` goes straight to the action: one tap, no dialog. Undoing is not destructive, so
 * making it cost a confirmation would be the wrong asymmetry. She stays on this screen — the deck
 * reappears in the list as the shared change signal re-reads, and there is nothing left to dismiss.
 *
 * The delete dialog says the deck can be brought back from here, because it can: "This can’t be
 * undone from here" stopped being true the moment this affordance shipped.
 */
export default function FlashcardsPage() {
  const navigate = useNavigate()
  const { decks, totalDue, loading, restorable, restoreCollapsed } = useDecksData()
  const { deleteDeck, createDeck, restoreDeck, purgeDeck } = useDeckActions()
  const { setRestoreRowCollapsed } = useSettings()

  /**
   * Whether a permanent delete is offered **in this build**.
   *
   * Read from the flag rather than from `settings.cloudSync`: the flag decides whether a second copy of
   * her data exists at all, which is the only thing that makes a hard delete unsafe. When 2b turns sync
   * on, this is `false` and the control is not rendered — no follow-up commit to remember.
   */
  const canPurge = canPurgeDecks()

  /**
   * Whether the "new deck" form is open. Separate from `pendingDelete` because they are opposite
   * acts and must never be able to appear together.
   */
  const [creating, setCreating] = useState(false)

  /**
   * The deck whose deletion is being confirmed, with the counts it was opened at so the dialog
   * cannot disagree with itself while it is on screen.
   */
  const [pendingDelete, setPendingDelete] = useState<DeckSummary | undefined>(undefined)

  /**
   * The tombstoned deck whose **permanent** delete is being confirmed. Its own state because it is a
   * different act from `pendingDelete`: that one hides a deck, this one destroys it.
   */
  const [pendingPurge, setPendingPurge] = useState<RestorableDeck | undefined>(undefined)

  return (
    <>
      <DeckListView
        decks={decks}
        loading={loading}
        totalDue={totalDue}
        restorable={restorable}
        onOpenDeck={(deckId) => void navigate(`/cards/${deckId}`)}
        onStartReview={() => void navigate('/cards/review')}
        onAddFromNotes={() => void navigate('/cards/ingest')}
        onDeleteDeck={(deck) => {
          const summary = decks.find((entry) => entry.deck.id === deck.id)
          // Only what is actually on screen can be deleted, so a stale row cannot open a dialog
          // describing a deck the list no longer shows.
          if (summary) setPendingDelete(summary)
        }}
        onRestoreDeck={(deck) => void restoreDeck(deck.id)}
        onNewDeck={() => setCreating(true)}
        restoreCollapsed={restoreCollapsed}
        onToggleRestoreRow={() => void setRestoreRowCollapsed(!restoreCollapsed)}
        canPurge={canPurge}
        onPurgeDeck={(deck) => {
          const target = restorable.find((entry) => entry.deck.id === deck.id)
          // Only what is on screen can be purged, so a stale row cannot open a dialog for a deck the
          // list no longer shows.
          if (target) setPendingPurge(target)
        }}
      />

      <DeckFormView
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={(values) => {
          void createDeck(values)
          // She stays on the list, where the new deck appears as the shared change signal
          // re-reads. No navigation to lose her, and no second dialog to dismiss.
          setCreating(false)
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
              } go with it. You can bring it back from here if you change your mind.`
            : 'It’s empty, so nothing goes with it. You can bring it back from here if you change your mind.'
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

      {/*
        The permanent one. Its own dialog rather than a variant of the delete confirmation, because the
        two acts differ in the only way that matters: one is reversible from this very screen, the other
        is not reversible anywhere. The wording says that plainly instead of relying on "forever" alone.
      */}
      <Modal
        open={pendingPurge !== undefined}
        onClose={() => setPendingPurge(undefined)}
        title={`Delete ${pendingPurge?.deck.name ?? 'this deck'} forever?`}
        description={
          pendingPurge && pendingPurge.cardCount > 0
            ? `Its ${String(pendingPurge.cardCount)} card${
                pendingPurge.cardCount === 1 ? '' : 's'
              } go too, and nothing brings them back.`
            : 'It’s empty, so nothing goes with it. Nothing brings it back either.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingPurge(undefined)}>
              Keep it
            </Button>
            <Button
              variant="strong"
              onClick={() => {
                if (pendingPurge) void purgeDeck(pendingPurge.deck.id)
                setPendingPurge(undefined)
              }}
            >
              {`Delete ${pendingPurge?.deck.name ?? 'this deck'} forever`}
            </Button>
          </>
        }
      >
        {pendingPurge === undefined ? null : (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-ink-muted">
              {pendingPurge.cardCount > 0
                ? `The ${String(pendingPurge.cardCount)} card${
                    pendingPurge.cardCount === 1 ? '' : 's'
                  } in ${pendingPurge.deck.name} are removed rather than hidden, so there is nothing left to bring back.`
                : `${pendingPurge.deck.name} is empty, so there is nothing else to lose.`}
            </p>
            <p className="text-sm leading-relaxed text-ink-muted">
              Your review history stays — it’s what your progress is built on.
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}
