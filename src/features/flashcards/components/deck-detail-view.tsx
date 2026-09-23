import { CardsIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Tag } from '@/components/ui/tag'
import { isMastered } from '../lib/sm2'
import type { DeckDetailViewProps } from '../types'
import type { Card as StudyCard } from '@/db/types'

/**
 * Layer 3 — one deck's cards. No hooks, no database.
 *
 * The status column is deliberately three plain words rather than a number: "Learning",
 * "Reviewing", "Mature". She is not tuning an algorithm, she is deciding whether to trust a
 * card — and "12 days" reads as a promise the scheduler may not keep if she grades it Again
 * tomorrow.
 */
export function DeckDetailView({
  deck,
  cards,
  loading,
  dueCount,
  onBack,
  onStartReview,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: DeckDetailViewProps) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← All decks
        </Button>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl">{deck.name}</h1>
        <p className="text-sm leading-relaxed text-ink-muted">{deck.scope}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={dueCount === 0} onClick={() => onStartReview(deck.id)}>
          {dueCount === 0
            ? 'Nothing due yet'
            : `Review ${dueCount} card${dueCount === 1 ? '' : 's'}`}
        </Button>
        <Button variant="secondary" size="lg" onClick={onAddCard}>
          Add a card
        </Button>
      </div>

      {!loading && cards.length === 0 ? (
        <EmptyState
          icon={<CardsIcon className="size-6" />}
          title="This deck is empty"
          message="Add the first card and it'll come back to you in about a minute, then ten, then tomorrow. That's the spacing starting."
          action={<Button onClick={onAddCard}>Add a card</Button>}
        />
      ) : null}

      {cards.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {cards.map((card) => (
            <li key={card.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-base font-semibold text-ink">{card.front}</p>
                    <StatusTag card={card} />
                  </div>

                  <p className="text-sm leading-relaxed text-ink-muted">{card.back}</p>

                  {card.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {card.tags.map((tag) => (
                        <Tag key={tag} tone="neutral">
                          {tag}
                        </Tag>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onEditCard(card)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDeleteCard(card)}>
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function StatusTag({ card }: { card: StudyCard }) {
  if (isMastered(card)) return <Tag tone="success">Mature</Tag>
  if (card.learningStep !== null) return <Tag tone="attention">Learning</Tag>
  return <Tag tone="neutral">Reviewing</Tag>
}
