import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

/**
 * Layer 3 — pure view.
 *
 * The clock is a static placeholder: the timer state machine is Workflow D, and a
 * fake countdown that looks live would be worse than an obviously static one.
 *
 * The "keep this tab open" line is here from the start on purpose. It is not
 * decoration — with in-app notifications only (docs/adr/0006), a closed tab means
 * no session-end cue, and this is the one place she can be told that before it
 * happens rather than after.
 */
export interface TimerViewProps {
  workMinutes: number
}

export function TimerView({ workMinutes }: TimerViewProps) {
  const display = `${String(workMinutes).padStart(2, '0')}:00`

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl">Focus</h1>
        <p className="text-sm text-ink-muted">One block at a time.</p>
      </header>

      <Card elevated>
        <CardContent className="flex flex-col items-center gap-6 py-10">
          <p
            className="font-display text-6xl font-bold text-ink tabular-nums"
            // Not a live timer, so it is announced as text rather than a value
            // that keeps changing under a screen reader.
            aria-hidden="false"
          >
            {display}
          </p>

          <p className="text-center text-sm text-ink-muted">Work session, {workMinutes} minutes</p>

          <div className="flex w-full max-w-xs flex-col gap-2">
            <Button fullWidth disabled>
              Start
            </Button>
            <p className="text-center text-xs text-ink-faint">
              The timer arrives next — this is the shell
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Keep this tab open" />
        <CardContent className="text-sm leading-relaxed text-ink-muted">
          <p>
            The end-of-session chime only works while the page is open. If you switch to another app
            or close the tab, nothing can remind you — there are no background notifications by
            design.
          </p>
          <p className="mt-2">
            Leave StudyBao open next to your notes and it'll nudge you when it's time for a break.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
