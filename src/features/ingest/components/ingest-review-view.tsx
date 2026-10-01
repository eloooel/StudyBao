import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Tag } from '@/components/ui/tag'
import { entryId } from '../lib/batch'
import type { IngestReviewViewProps, LeftoverReason } from '../types'

/**
 * Layer 3 — the review screen. No hooks, no database.
 *
 * This screen exists because `BUILD_GUIDE.md` §2 decision #4 says OCR text is **never**
 * auto-saved: every proposed card is shown before it counts. The layout follows from that —
 * a card is a question and an answer with an Accept next to it, and the leftover queue is
 * below rather than on another screen, because "what failed to parse" is part of the same
 * job rather than a separate one.
 *
 * Accepting is additive and immediate: her accepted cards are already in the database and
 * already durable, so finishing is not what saves them. Everything still on this screen when
 * she leaves is the only thing at risk, which is what the header says.
 */
export function IngestReviewView({
  deckName,
  sourceLabel,
  cards,
  leftover,
  convertedLeftoverIds,
  progress,
  saving,
  onAccept,
  onAcceptAll,
  onDiscard,
  onEdit,
  onConvertLeftover,
  onDiscardLeftover,
  onFinish,
  onBack,
  error,
}: IngestReviewViewProps) {
  const unconverted = leftover.filter((entry) => !convertedLeftoverIds.includes(entryId(entry)))
  const pending = cards.filter((card) => card.status === 'pending')
  const answered = cards.filter((card) => card.status !== 'pending')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Start over
        </Button>
        <Tag tone="neutral">{deckName}</Tag>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl">Check your cards</h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          {pending.length === 0
            ? 'Every card has been decided. Anything you accepted is already saved.'
            : `${pending.length} card${pending.length === 1 ? '' : 's'} to check, from ${sourceLabel.toLowerCase()}. Accept the ones that are right — nothing is saved until you do.`}
        </p>
      </header>

      <Summary progress={progress} />

      {pending.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={saving} onClick={onAcceptAll}>
            Accept all {pending.length} remaining
          </Button>
        </div>
      ) : null}

      {pending.length === 0 ? (
        <EmptyState
          icon={<Tag tone="success">✓</Tag>}
          title="Nothing left to check"
          message="Everything you accepted is saved in your deck and will come back on schedule."
          action={<Button onClick={onFinish}>Back to my decks</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((card) => (
            <li key={card.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4">
                  <p className="font-display text-base font-semibold text-ink">{card.front}</p>
                  <p className="text-sm leading-relaxed text-ink-muted">{card.back}</p>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" loading={saving} onClick={() => onAccept(card.id)}>
                      Accept
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onEdit(card)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDiscard(card.id)}>
                      Not a card
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {answered.length > 0 ? (
        <details className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer font-display text-sm font-semibold text-ink">
            {answered.length} already decided
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {answered.map((card) => (
              <li key={card.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-ink-muted">{card.front}</span>
                <Tag tone={card.status === 'accepted' ? 'success' : 'neutral'}>
                  {card.status === 'accepted' ? 'Saved' : 'Skipped'}
                </Tag>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {unconverted.length > 0 ? (
        <section className="flex flex-col gap-3">
          <header className="flex flex-col gap-1">
            <h2 className="text-lg text-ink">Couldn&rsquo;t turn these into cards</h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              Nothing here is lost — it&rsquo;s waiting for you. Turn a line into a card by hand, or
              leave it. As long as it&rsquo;s listed here it stays in your notes.
            </p>
          </header>

          <ul className="flex flex-col gap-2">
            {unconverted.map((entry) => (
              <li key={entryId(entry)}>
                <Card>
                  <CardContent className="flex flex-col gap-2 p-4">
                    <p className="text-sm leading-relaxed text-ink">{entry.text}</p>
                    <p className="text-xs text-ink-faint">{reasonLabel(entry.reason)}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onConvertLeftover(entry)}
                      >
                        Make a card
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDiscardLeftover(entry)}>
                        Not a card
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error !== undefined ? (
        <p role="alert" className="text-sm font-semibold text-accent">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onFinish}>
          Done — back to my decks
        </Button>
      </div>
    </div>
  )
}

function Summary({ progress }: { progress: IngestReviewViewProps['progress'] }) {
  return (
    <p className="text-sm text-ink-muted" role="status">
      {progress.accepted} saved
      {progress.discarded > 0 ? ` · ${progress.discarded} skipped` : ''}
      {progress.leftoverRemaining > 0 ? ` · ${progress.leftoverRemaining} waiting below` : ''}
    </p>
  )
}

/**
 * Plain words for why a line is here.
 *
 * The reason exists so the queue can explain itself: "no separator found" and "this is an
 * answer that lost its question" look identical in the text and call for different edits.
 */
function reasonLabel(reason: LeftoverReason): string {
  switch (reason) {
    case 'prose':
      return 'Looks like a sentence rather than a definition'
    case 'unpaired-question':
      return 'A question with no answer under it'
    case 'unpaired-answer':
      return 'An answer whose question didn’t come through'
    case 'no-separator':
      return 'No “:” or “ - ” to split on'
  }
}
