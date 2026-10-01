import { CardsIcon, SparkleIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Tag } from '@/components/ui/tag'
import type { DeckListViewProps } from '../types'

/**
 * Layer 3 — pure JSX from typed props. No hooks, no database.
 *
 * The empty state is the honest one for a first launch: a brand-new install has no cards, but it
 * does have the five decks, so this screen leads with "start with a card" rather than pretending
 * a deck needs creating. Copy follows docs/BUILD_GUIDE.md §5 — warm and specific, never
 * "No data available", never guilt-inducing.
 */
export function DeckListView({
  decks,
  loading,
  totalDue,
  onOpenDeck,
  onStartReview,
  onAddFromNotes,
}: DeckListViewProps) {
  const totalCards = decks.reduce((total, summary) => total + summary.totalCards, 0)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl">Cards</h1>
        <p className="text-sm text-ink-muted">
          Five decks, one for each Nursing Practice part you&rsquo;ll sit.
        </p>
      </header>

      {/*
        Primary, and above the fold, because typing every card by hand is the thing that stops
        her using this at all. Ingest is a screen rather than a sixth bottom-nav item: the bar is
        already five, which is the practical ceiling on an iPad, and "add cards" is something she
        looks for where the decks are.
      */}
      <Button size="lg" fullWidth onClick={onAddFromNotes}>
        Add from your notes
      </Button>

      {totalDue > 0 ? (
        <Card elevated>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-lg font-semibold text-ink">
                {totalDue === 1 ? '1 card is ready' : `${totalDue} cards are ready`}
              </p>
              <SparkleIcon className="size-5 text-accent" />
            </div>
            <Button size="lg" fullWidth onClick={onStartReview}>
              Review now
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!loading && totalCards === 0 ? (
        <EmptyState
          icon={<CardsIcon className="size-6" />}
          title="Your decks are ready"
          message="Open a part below and add your first card. Nothing is due yet, so there's no rush — a handful a day adds up fast."
        />
      ) : null}

      {totalDue === 0 && totalCards > 0 ? (
        <EmptyState
          icon={<SparkleIcon className="size-6" />}
          title="Nothing due right now"
          message="That's the spacing working. Come back when a card is ready, or open a deck to add more."
        />
      ) : null}

      <ul className="flex flex-col gap-3">
        {decks.map(({ deck, totalCards: cardCount, dueCards, masteredCards }) => (
          <li key={deck.id}>
            <Card className="transition-colors hover:border-accent">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold text-ink">{deck.name}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">{deck.scope}</p>
                  </div>
                  {dueCards > 0 ? <Tag tone="accent">{dueCards} due</Tag> : null}
                </div>

                {cardCount > 0 ? (
                  <>
                    <ProgressBar
                      value={masteredCards}
                      max={cardCount}
                      label={`${masteredCards} of ${cardCount} mature`}
                    />
                    <p className="text-xs text-ink-faint">
                      {cardCount === 1 ? '1 card' : `${cardCount} cards`}
                      {dueCards === 0 ? ' · none due yet' : ''}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-ink-faint">No cards in here yet.</p>
                )}

                <div>
                  <Button variant="secondary" onClick={() => onOpenDeck(deck.id)}>
                    Open deck
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
