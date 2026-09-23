import { CardsIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Layer 3 — pure view.
 *
 * The "New deck" button is intentionally disabled rather than hidden or faked.
 * This is the honest state of the app shell, and it means the disabled styling is
 * exercised on a real screen instead of only in a test.
 */
export interface FlashcardsViewProps {
  deckCount: number
}

export function FlashcardsView({ deckCount }: FlashcardsViewProps) {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl">Cards</h1>
        <p className="text-sm text-ink-muted">
          Five decks, matching the five Nursing Practice parts of the exam.
        </p>
      </header>

      {deckCount === 0 ? (
        <EmptyState
          icon={<CardsIcon className="size-6" />}
          title="No decks yet"
          message="Your decks will cover Nursing Practice I to V — the same five parts you'll sit. Building and reviewing cards is the next thing being wired up."
          action={
            <div className="flex flex-col items-center gap-2">
              <Button disabled>New deck</Button>
              <p className="text-xs text-ink-faint">Arrives with the flashcard engine</p>
            </div>
          }
        />
      ) : null}
    </div>
  )
}
