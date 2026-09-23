import { CalendarIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Layer 3 — pure view.
 */
export interface TrackerViewProps {
  lessonCount: number
}

export function TrackerView({ lessonCount }: TrackerViewProps) {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl">Lessons</h1>
        <p className="text-sm text-ink-muted">What you've covered, and what's still waiting.</p>
      </header>

      {lessonCount === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="size-6" />}
          title="No lessons yet"
          message="Add the topics you're working through and mark them as you go — not started, reviewing, or mastered. Sorting that out is the next thing being built."
          action={
            <div className="flex flex-col items-center gap-2">
              <Button disabled>Add a lesson</Button>
              <p className="text-xs text-ink-faint">Arrives with the lesson tracker</p>
            </div>
          }
        />
      ) : null}
    </div>
  )
}
