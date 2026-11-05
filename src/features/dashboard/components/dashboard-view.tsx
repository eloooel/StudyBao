import { CardsIcon, SparkleIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Layer 3 — a pure view. Typed props, no hooks, no data access. See CLAUDE.md.
 *
 * ## There is no streak or mastery number here, on purpose
 *
 * This screen used to carry a "Study streak" card: a `Day 0` tag, a `0 / 1` "Cards mastered" bar, and
 * the line *"Streaks start counting from your first review."* As a **pre-first-review placeholder** it
 * was honest. The moment she graded a card it became the opposite: `Day 0` was a **false number printed
 * beside a real review history**, and the sentence explaining it stopped being true.
 *
 * So it is gone rather than made conditional. The aggregate is Workflow F, F needs history, and a
 * number nobody can compute should not be on screen at all — "unknown" and "0" look identical to her
 * and only one of them is a lie. It comes back the day it can be computed.
 *
 * What remains is checkable: the deck count is a **fact about the device**, not an aggregate over
 * history, and the two placeholders left say only what is true — "Not enough history yet", and the
 * empty state that names what will fill in.
 *
 * `deckCount` being real is itself a fixed bug: a hardcoded `0` made this view take the
 * `hasDecks === false` branch on every launch, telling her to get her notes into cards while five
 * seeded PRC decks sat one tap away.
 */
export interface DashboardViewProps {
  deckCount: number
  onSeeDecks: () => void
  onAddFromNotes: () => void
}

export function DashboardView({ deckCount, onSeeDecks, onAddFromNotes }: DashboardViewProps) {
  const hasDecks = deckCount > 0
  const deckLabel = `See ${deckCount > 0 ? `your ${String(deckCount)} deck${deckCount === 1 ? '' : 's'}` : 'your decks'}`

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl">Today</h1>
        <p className="text-sm text-ink-muted">
          {hasDecks
            ? 'Your review queue will show up here.'
            : "Let's get your notes into cards first."}
        </p>
      </header>

      {hasDecks ? (
        <Card>
          <CardHeader title="Weak spots" description="Surfaced from cards you've missed." />
          <CardContent>
            <EmptyState
              icon={<SparkleIcon className="size-6" />}
              title="Not enough history yet"
              message="Once you've graded a few cards, the ones you keep missing will appear here so you know what to review tomorrow."
            />
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={<SparkleIcon className="size-6" />}
          title="Nothing to show yet"
          message="This screen fills in as you study: per-subject progress, your weakest topics, and how many cards you've truly mastered. It needs some reviews behind it first."
        />
      )}

      {/*
        The primary action, and the reason this screen is not a dead end. She is one tap from the five
        seeded PRC decks and from the ingest flow, and before this nothing on the first screen she sees
        said so — the "no empty state that asks her to create something first" rule in CLAUDE.md.

        Shown in BOTH branches: with decks it is the next step, and without them it is the way out. No
        redirect and no first-run flag — it is a link, so it works on every fresh install rather than
        only on the first open.
      */}
      <Card>
        <CardHeader
          title={hasDecks ? 'Ready when you are' : 'Start here'}
          description={
            hasDecks
              ? `Your decks are ready, one for each Nursing Practice part.`
              : `Bring your notes in and StudyBao turns them into cards.`
          }
        />
        <CardContent className="flex flex-wrap gap-2">
          <Button leadingIcon={<CardsIcon className="size-5" />} onClick={onSeeDecks}>
            {deckLabel}
          </Button>
          <Button variant="secondary" onClick={onAddFromNotes}>
            Add from your notes
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
