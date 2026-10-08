import { BowIcon, CardsIcon, SparkleIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Tag } from '@/components/ui/tag'

/**
 * Layer 3 — a pure view. Typed props, no hooks, no data access. See CLAUDE.md.
 *
 * Nothing here is wired to real data yet beyond the deck count: the dashboard aggregate is Workflow
 * F, which needs review history from Workflow B. Rather than show invented numbers (a streak of 0
 * that is really "unknown" is a lie she would act on), this screen says plainly what will appear and
 * when.
 *
 * `deckCount` is real and is the one number here that is not F's: it is a fact about what is on the
 * device, not an aggregate over history, and the empty state below cannot say anything honest without
 * it. A hardcoded 0 made this view render the *wrong branch* — telling her to get her notes into
 * cards while five seeded PRC decks sat one tap away.
 */
export interface DashboardViewProps {
  deckCount: number
  reviewedToday: number
  onSeeDecks: () => void
  onAddFromNotes: () => void
}

export function DashboardView({
  deckCount,
  reviewedToday,
  onSeeDecks,
  onAddFromNotes,
}: DashboardViewProps) {
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

      <Card elevated>
        <CardHeader
          title="Study streak"
          description="A day counts once you've reviewed a card or finished a session."
          action={
            <Tag tone="success" dot>
              Day 0
            </Tag>
          }
        />
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <BowIcon className="size-7 text-primary" />
            <p className="text-sm text-ink-muted">
              Streaks start counting from your first review. Nothing to lose yet 💗
            </p>
          </div>

          <ProgressBar label="Cards mastered" value={0} max={1} showValue={false} />

          {/*
            `reviewedToday` reaches a real screen again: the old card used it for a "no reviews
            logged today" line, and deleting that card silently dropped the prop. It stays 0 until
            Workflow F can derive it from `ReviewLog`, so the only honest thing it can say is nothing.
            The line comes back the day the number is real.
          */}
          {reviewedToday > 0 ? (
            <p className="text-sm text-ink-muted">
              {reviewedToday} review{reviewedToday === 1 ? '' : 's'} logged today. Nice.
            </p>
          ) : null}
        </CardContent>
      </Card>

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
              ? `Five decks are ready, one for each Nursing Practice part.`
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
