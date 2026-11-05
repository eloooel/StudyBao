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
  restorable,
  onOpenDeck,
  onStartReview,
  onAddFromNotes,
  onDeleteDeck,
  onRestoreDeck,
  onNewDeck,
}: DeckListViewProps) {
  const totalCards = decks.reduce((total, summary) => total + summary.totalCards, 0)
  const hasDecks = decks.length > 0

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl">Cards</h1>
        <p className="text-sm text-ink-muted">
          {/* The count is deliberately not stated: a deck can be deleted now, so "five" is a claim
              the screen can stop being true about. The *structure* — one deck per exam part — is the
              part worth saying, and it survives a deletion. */}
          One deck for each Nursing Practice part you&rsquo;ll sit.
        </p>
      </header>

      {/*
        **Deck first, notes second.** "Add from your notes" files cards into a deck, so offering it
        with no deck to file them into is a dead end — which became reachable the moment a deck could
        be deleted. With no decks this screen offers making one instead; the notes path appears only
        once there is somewhere for the cards to land.
      */}
      {hasDecks ? (
        <div className="flex flex-col gap-3">
          <Button size="lg" fullWidth onClick={onAddFromNotes}>
            Add from your notes
          </Button>
          <Button variant="secondary" fullWidth onClick={onNewDeck}>
            New deck
          </Button>
        </div>
      ) : null}

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

      {/*
        **Restore, only when there is something to restore.** In normal use this renders nothing, so
        the Cards screen is unchanged.

        It sits above the empty states on purpose: when every deck has been deleted, the screen
        would otherwise lead with "Start with a deck" while a deck she can get back sits below it.
        And it is a row rather than an Undo toast because a toast is time-limited — a missed one
        would be the same permanent loss this exists to close.
      */}
      {restorable.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="font-display text-base font-semibold text-ink">
                {restorable.length === 1
                  ? 'You deleted 1 deck.'
                  : `You deleted ${String(restorable.length)} decks.`}
              </p>
              <p className="text-sm leading-relaxed text-ink-muted">
                Nothing is gone for good — bring a deck back whenever you want.
              </p>
            </div>

            <ul className="flex flex-col gap-2">
              {restorable.map(({ deck, cardCount }) => (
                <li key={deck.id}>
                  {/*
                    One tap, no confirmation: undoing is not destructive, and the asymmetry with
                    delete is the point. The card count is the one the repository promised the
                    restore would deliver, not "everything in the deck".
                  */}
                  <Button
                    variant="secondary"
                    fullWidth
                    className="justify-start text-left"
                    onClick={() => onRestoreDeck(deck)}
                  >
                    {`Restore ${deck.name}${
                      cardCount > 0
                        ? ` and its ${String(cardCount)} card${cardCount === 1 ? '' : 's'}`
                        : ''
                    }`}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {!loading && !hasDecks ? (
        <EmptyState
          icon={<CardsIcon className="size-6" />}
          title="Start with a deck"
          message="A deck is where your cards live. Make one for a topic you’re working through, and then you can bring cards in from your notes."
          action={<Button onClick={onNewDeck}>New deck</Button>}
        />
      ) : null}

      {!loading && hasDecks && totalCards === 0 ? (
        <EmptyState
          icon={<CardsIcon className="size-6" />}
          title="Your decks are ready"
          message="Open a part below and add your first card. Nothing is due yet, so there’s no rush — a handful a day adds up fast."
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

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" onClick={() => onOpenDeck(deck.id)}>
                    Open deck
                  </Button>
                  {/*
                    The only place a deck is deleted from. `ghost` and small, because it is not a
                    thing to invite a tap: the common action on this screen is "open". It opens a
                    confirmation rather than deleting, which is why the handler is named for the
                    dialog and this view has no way to remove anything by itself.
                  */}
                  <Button variant="ghost" size="sm" onClick={() => onDeleteDeck(deck)}>
                    Delete deck
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
