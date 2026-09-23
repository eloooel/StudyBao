import { BowIcon, SparkleIcon } from '@/components/icons'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Tag } from '@/components/ui/tag'

/**
 * Layer 3 — a pure view. Typed props, no hooks, no data access. See CLAUDE.md.
 *
 * Nothing here is wired to real data yet: the dashboard aggregate is Workflow F,
 * which needs review history from Workflow B. Rather than show invented numbers
 * (a streak of 0 that is really "unknown" is a lie she would act on), this screen
 * says plainly what will appear and when.
 */
export interface DashboardViewProps {
  deckCount: number
  reviewedToday: number
}

export function DashboardView({ deckCount, reviewedToday }: DashboardViewProps) {
  const hasDecks = deckCount > 0

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

      <Card>
        <CardHeader title="Coming together" />
        <CardContent className="flex flex-col gap-2 text-sm text-ink-muted">
          <p>
            You're looking at the app shell. Decks, reviews, the timer and the lesson tracker arrive
            next — this page will start filling itself in on its own once they do.
          </p>
          {reviewedToday === 0 ? <p>No reviews logged today. No pressure 🎀</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
