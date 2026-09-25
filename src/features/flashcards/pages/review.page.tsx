import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Tag } from '@/components/ui/tag'
import { ReviewCardView } from '../components/review-card-view'
import { useReviewSession } from '../hooks/use-review-session'
import { useSettings } from '../hooks/use-settings'
import { cramStatusFor } from '../lib/cram'

/**
 * Layer 1 — the review session, at `/cards/review` and `/cards/:deckId/review`.
 *
 * It is a **route** rather than a mode inside the Cards page on purpose. On an iPad a hard refresh
 * mid-session is realistic — a tab restore, an accidental swipe, ITP. With a route, the queue is
 * derived from the database on mount and a refresh resumes cleanly; with mode state in React, the
 * session would simply be lost.
 *
 * Cram mode is read from the query string, so "everything due" and "cram" are two links she can
 * bookmark, and the override is a link rather than hidden state.
 */
export default function ReviewPage() {
  const { deckId } = useParams<{ deckId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { settings, loading: settingsLoading } = useSettings()

  // `?mode=due` is the explicit override: cram is automatic, but never the only way to review.
  const forceDue = searchParams.get('mode') === 'due'
  // Captured once, at mount, rather than read during render. `Date.now()` in a render body is an
  // impure call, and it would also let the mode flip under her mid-session when the clock crossed
  // the threshold. Neither is acceptable mid-review.
  const [openedAt] = useState(() => Date.now())
  const cram = cramStatusFor(settings, openedAt, forceDue)

  const session = useReviewSession({ deckId, cram: cram.active })
  const [revealed, setRevealed] = useState(false)
  const [revealedFor, setRevealedFor] = useState<string | undefined>(undefined)

  const cardId = session.card?.id
  // A new card always starts hidden. Keyed on the card rather than reset in an effect, so there is
  // no frame where the previous card's answer is visible.
  const isRevealed = revealed && revealedFor === cardId

  const exitTo = deckId === undefined ? '/cards' : `/cards/${deckId}`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => void navigate(exitTo)}>
          ← Back
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          {cram.active ? (
            <>
              <Tag tone="accent">Cram mode</Tag>
              {cram.daysUntilExam !== undefined ? (
                <span className="text-xs text-ink-muted">
                  {cram.daysUntilExam <= 0
                    ? 'Exam day'
                    : `${cram.daysUntilExam} day${cram.daysUntilExam === 1 ? '' : 's'} to go`}
                </span>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => void navigate(`?mode=due`)}>
                Show due cards instead
              </Button>
            </>
          ) : forceDue && settings.examDate !== undefined ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void navigate(deckId === undefined ? '/cards/review' : `/cards/${deckId}/review`)
              }
            >
              Use cram mode
            </Button>
          ) : null}
        </div>
      </div>

      {cram.active ? (
        <p className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink-muted">
          Cram mode ignores when cards are due and brings back what you&rsquo;ve missed most. Your
          progress still counts — how you grade each card is saved exactly the same way.
        </p>
      ) : null}

      {settingsLoading || session.loading ? (
        <p className="py-16 text-center text-sm text-ink-muted" role="status">
          Getting your cards ready…
        </p>
      ) : (
        <ReviewCardView
          card={session.card}
          revealed={isRevealed}
          startCount={session.startCount}
          gradedCount={session.gradedCount}
          remaining={session.remaining}
          waitingToReturn={session.waitingToReturn}
          finished={session.finished}
          deckName={session.deckName}
          onReveal={() => {
            setRevealed(true)
            setRevealedFor(cardId)
          }}
          onGrade={(grade) => {
            setRevealed(false)
            setRevealedFor(undefined)
            void session.grade(grade)
          }}
          onEnd={() => void navigate(exitTo)}
        />
      )}
    </div>
  )
}
