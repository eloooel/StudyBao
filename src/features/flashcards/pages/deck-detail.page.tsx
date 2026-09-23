import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import type { Card } from '@/db/types'
import { CardFormView } from '../components/card-form-view'
import { DeckDetailView } from '../components/deck-detail-view'
import { useCardActions, useTagSuggestions } from '../hooks/use-card-actions'
import { useDeckActions } from '../hooks/use-deck-actions'
import { useDeckData } from '../hooks/use-decks-data'
import { describeNextReview } from '../lib/grades'
import type { CardFormTarget } from '../types'

/**
 * Layer 1 — one deck's cards, plus the add/edit/delete flows.
 *
 * Confirmation is required for deletion even though it is a soft delete: from her side a deleted
 * card is gone, and the tombstone is an implementation detail she should never have to know
 * about. So the dialog says what will happen in her terms, not the schema's.
 */
export default function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const deck = useDeckData(deckId)
  const { saving, error, saveNewCard, saveCardText, clearError } = useCardActions()
  const { deleteCard, resetProgress } = useDeckActions()
  const tagSuggestions = useTagSuggestions()

  const [formTarget, setFormTarget] = useState<CardFormTarget>(null)
  const [pendingDelete, setPendingDelete] = useState<Card | undefined>(undefined)
  const [pendingReset, setPendingReset] = useState<Card | undefined>(undefined)

  if (!deck.loading && !deck.found) {
    return (
      <EmptyState
        title="That deck isn’t here"
        message="It may have been deleted, or the link is old. Everything you still have is on the decks screen."
        action={<Button onClick={() => void navigate('/cards')}>Back to decks</Button>}
      />
    )
  }

  // The view is typed against a full Deck. While the first read is in flight there is nothing to
  // show yet, so render a blank shell rather than inventing placeholder content.
  if (deck.deck === undefined) {
    return (
      <p className="text-sm text-ink-muted" role="status">
        Loading…
      </p>
    )
  }

  return (
    <>
      <DeckDetailView
        deck={deck.deck}
        cards={deck.cards}
        loading={deck.loading}
        dueCount={deck.dueCount}
        onBack={() => void navigate('/cards')}
        onStartReview={(id) => void navigate(`/cards/${id}/review`)}
        onAddCard={() => setFormTarget({ mode: 'create' })}
        onEditCard={(card) => setFormTarget({ mode: 'edit', card })}
        onDeleteCard={(card) => setPendingDelete(card)}
      />

      <CardFormView
        open={formTarget !== null}
        target={formTarget}
        tagSuggestions={tagSuggestions}
        progressSummary={
          formTarget?.mode === 'edit' ? progressSummaryFor(formTarget.card) : undefined
        }
        onSubmit={(values) => {
          if (formTarget === null) return
          clearError()

          void (async () => {
            const ok =
              formTarget.mode === 'create'
                ? await saveNewCard(deckId ?? '', values)
                : await saveCardText(formTarget.card.id, values)
            if (ok) setFormTarget(null)
          })()
        }}
        onClose={() => {
          clearError()
          setFormTarget(null)
        }}
        onResetProgress={
          formTarget?.mode === 'edit' ? () => setPendingReset(formTarget.card) : undefined
        }
      />

      {saving ? (
        <p className="sr-only" role="status">
          Saving
        </p>
      ) : null}

      <Modal
        open={pendingDelete !== undefined}
        onClose={() => setPendingDelete(undefined)}
        title="Delete this card?"
        description="It disappears from your decks and from reviews. This can’t be undone from here."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(undefined)}>
              Keep it
            </Button>
            <Button
              variant="strong"
              onClick={() => {
                if (pendingDelete) void deleteCard(pendingDelete.id)
                setPendingDelete(undefined)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">{pendingDelete?.front}</p>
      </Modal>

      <Modal
        open={pendingReset !== undefined}
        onClose={() => setPendingReset(undefined)}
        title="Start this card over?"
        description="It goes back to being brand new, due in a minute, and loses its progress. Your answer text stays."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingReset(undefined)}>
              Keep progress
            </Button>
            <Button
              variant="strong"
              onClick={() => {
                if (pendingReset) {
                  void resetProgress(pendingReset.id)
                  setFormTarget(null)
                }
                setPendingReset(undefined)
              }}
            >
              Start over
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          Use this when an edit changed what the card means, so the old progress no longer counts.
        </p>
      </Modal>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-accent">
          {error}
        </p>
      ) : null}
    </>
  )
}

/** What the form shows about a card's current schedule, in words rather than numbers. */
function progressSummaryFor(card: Card): string {
  if (card.lastReviewedAt === undefined) {
    return 'You haven’t reviewed this one yet.'
  }

  const when = describeNextReview(card.intervalDays, card.learningStep)
  const lapses =
    card.lapses === 0 ? '' : ` · missed ${card.lapses} time${card.lapses === 1 ? '' : 's'}`
  return `Currently ${when.replace('again ', '')}${lapses}`
}
