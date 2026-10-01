import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { IngestReviewView } from '../components/ingest-review-view'
import { CardFieldsEditor } from '../components/paste-text-area'
import { useIngestActions } from '../hooks/use-ingest-draft'
import { useDeckName } from '../hooks/use-deck-name'
import { batchProgress, entryId } from '../lib/batch'
import { clearDraft, getUnpersistedBatch, loadDraft } from '../lib/draft-storage'
import type { IngestDraft } from '../lib/draft-storage'
import type { CardDraftFields, LeftoverQueueEntry, ReviewCard } from '../types'

/**
 * Layer 1 — the review screen, and the reason it is a **route** rather than a mode.
 *
 * The draft is persisted (see lib/draft-storage.ts), and persisted state needs somewhere to be
 * restored *into*. With the batch held only in component state, a reload would drop her at
 * `/cards` with an orphaned draft and no screen that could show it. So this is a route, and it
 * is declared **before** `cards/:deckId` in `src/router.tsx` — the same ordering hazard the
 * existing `cards/review` route documents, because `ingest` would otherwise be read as a deck id.
 *
 * The draft is read once, on mount, from session storage or from the in-memory fallback when it
 * was too large to store. Every decision then flows through `useIngestActions`, which
 * re-persists and, on accept, writes through the repository in one transaction.
 */
export default function IngestReviewPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<IngestDraft | undefined>(
    () => loadDraft() ?? getUnpersistedBatch(),
  )
  const [editing, setEditing] = useState<ReviewCard | undefined>(undefined)
  const [converting, setConverting] = useState<LeftoverQueueEntry | undefined>(undefined)

  const handleDraftChange = useCallback((next: IngestDraft) => setDraft(next), [])
  const actions = useIngestActions(draft, handleDraftChange)
  // Resolved from the database rather than stored in the draft: a deck can be renamed, and a
  // stored name would go stale in a draft that outlives the rename.
  const deckName = useDeckName(draft?.deckId ?? '')

  const progress = useMemo(() => {
    if (draft === undefined) return undefined
    // `convertedLeftoverIds` is the list of leftovers already dealt with, which is what
    // `batchProgress` expects — the *remaining* count is computed from it.
    return batchProgress(draft.cards, draft.leftover, draft.convertedLeftoverIds)
  }, [draft])

  if (draft === undefined) {
    return (
      <EmptyState
        title="There's no batch to check"
        message="The notes you were working on aren't here any more — the batch expired or the page was reloaded, most likely. Your saved cards are untouched."
        action={<Button onClick={() => void navigate('/cards/ingest')}>Add some notes</Button>}
      />
    )
  }

  return (
    <>
      <IngestReviewView
        deckName={deckName === '' ? 'Your deck' : deckName}
        sourceLabel={draft.sourceLabel}
        cards={draft.cards}
        leftover={draft.leftover}
        convertedLeftoverIds={draft.convertedLeftoverIds}
        progress={{
          accepted: progress?.accepted ?? 0,
          discarded: progress?.discarded ?? 0,
          pending: progress?.pending ?? 0,
          leftoverRemaining: progress?.leftoverRemaining ?? 0,
        }}
        saving={actions.saving}
        onAccept={(cardId) => void actions.acceptCard(cardId)}
        onAcceptAll={() => void actions.acceptAll()}
        onDiscard={(cardId) => void actions.discardCard(cardId)}
        onEdit={(card) => setEditing(card)}
        onConvertLeftover={(entry) => setConverting(entry)}
        onDiscardLeftover={(entry) => {
          actions.discardLeftover(entry)
        }}
        onFinish={() => {
          actions.finish()
          void navigate('/cards')
        }}
        onBack={() => {
          clearDraft()
          void navigate('/cards/ingest')
        }}
        {...(actions.error === undefined ? {} : { error: actions.error })}
      />

      {/*
        Keyed on the target so each open starts from that target's own text. Without the key,
        React would reuse one `CardFields` instance across cards and she would see the previous
        card's words in the fields — or worse, save them onto this card.
      */}
      <EditCardModal
        key={editing?.id ?? 'no-edit'}
        card={editing}
        onClose={() => setEditing(undefined)}
        onSave={(values) => {
          if (editing !== undefined) actions.updateCardText(editing.id, values)
          setEditing(undefined)
        }}
      />

      <ConvertLeftoverModal
        key={converting === undefined ? 'no-convert' : entryId(converting)}
        entry={converting}
        onClose={() => setConverting(undefined)}
        onSave={(values) => {
          if (converting !== undefined) actions.convertLeftover(converting, values)
          setConverting(undefined)
        }}
      />
    </>
  )
}

/**
 * The edit dialog. Holds its own field state, seeded once from the card it was opened for.
 *
 * It lives inside this file rather than in `components/` because it is a modal shell around the
 * shared `CardFieldsEditor`, not a view with props worth testing on its own.
 */
function EditCardModal({
  card,
  onClose,
  onSave,
}: {
  card: ReviewCard | undefined
  onClose: () => void
  onSave: (values: CardDraftFields) => void
}) {
  const [values, setValues] = useState<CardDraftFields>({
    front: card?.front ?? '',
    back: card?.back ?? '',
  })

  return (
    <Modal
      open={card !== undefined}
      onClose={onClose}
      title="Edit this card"
      description="Fix the question or the answer. Your text is what gets saved when you accept it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(values)}>Save the text</Button>
        </>
      }
    >
      <CardFieldsEditor values={values} onChange={setValues} />
    </Modal>
  )
}

/** The leftover converter. Same shell, same seeding rule, different initial guess. */
function ConvertLeftoverModal({
  entry,
  onClose,
  onSave,
}: {
  entry: LeftoverQueueEntry | undefined
  onClose: () => void
  onSave: (values: CardDraftFields) => void
}) {
  const [values, setValues] = useState<CardDraftFields>(() => splitForCard(entry?.text ?? ''))

  return (
    <Modal
      open={entry !== undefined}
      onClose={onClose}
      title="Make a card from this"
      description="Write the question and the answer yourself — StudyBao couldn't tell which part was which."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Leave it for now
          </Button>
          <Button onClick={() => onSave(values)}>Add it as a card</Button>
        </>
      }
    >
      <CardFieldsEditor values={values} onChange={setValues} />
    </Modal>
  )
}

/**
 * A first guess at the split for a leftover line, so she edits rather than types.
 *
 * Deliberately naive — the parser already rejected this line, so a cleverer guess here would be
 * guessing twice. A colon or a spaced dash if there is one, otherwise the whole line becomes the
 * front and she writes the answer.
 */
function splitForCard(text: string): CardDraftFields {
  const colon = text.indexOf(':')
  if (colon > 0) {
    return { front: text.slice(0, colon).trim(), back: text.slice(colon + 1).trim() }
  }

  const dash = /\s+[-–—]\s+/.exec(text)
  if (dash !== null) {
    return {
      front: text.slice(0, dash.index).trim(),
      back: text.slice(dash.index + dash[0].length).trim(),
    }
  }

  return { front: text, back: '' }
}
