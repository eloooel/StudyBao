import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Tag } from '@/components/ui/tag'
import { formatRemaining } from '../lib/format'
import type { TimerPhase } from '../lib/timer'

/**
 * Layer 3 — the timer screen. No hooks, no database.
 *
 * ## What the screen has to communicate
 *
 * A focus timer is a screen she looks at briefly and then ignores, so three things matter more than
 * polish: **which phase she is in**, **how long is left**, and **whether the tab has to stay open**.
 * The last one is not decoration — with in-app notifications only (ADR 0006) a closed tab means the
 * end-of-session cue never arrives, and this is the one place she can be told that before it happens
 * rather than after.
 *
 * The time is rendered from `remainingMs` and nothing else; there is no local countdown to drift out
 * of step with the hook.
 *
 * ## Voice
 *
 * `BUILD_GUIDE.md` §5: warm and playful, never clinical, never guilt-inducing. So the focus count is
 * "focus breaks", surfaced only when there is at least one, and framed as care rather than
 * surveillance — a block she abandoned is simply not mentioned.
 */

export interface TimerViewProps {
  phase: TimerPhase
  remainingMs: number
  progress: number
  cyclesUntilLongBreak: number
  running: boolean
  awaitingNext: boolean
  /** Completed work blocks today. Surfaced only when greater than zero. */
  focusBlocksToday: number
  onStart: () => void
  onSkip: () => void
  onReset: () => void
}

const PHASE_COPY: Record<TimerPhase, { title: string; blurb: string; tag: string | null }> = {
  idle: {
    title: 'Ready when you are',
    blurb: 'Twenty-five minutes of focus, then a five-minute break.',
    tag: null,
  },
  working: { title: 'Focus', blurb: 'Notes open, phone face down.', tag: 'Focus' },
  break: { title: 'Short break', blurb: 'Stand up, water, look out a window.', tag: 'Break' },
  longBreak: {
    title: 'Long break',
    blurb: 'You earned this one — take the whole fifteen.',
    tag: 'Long break',
  },
}

export function TimerView({
  phase,
  remainingMs,
  progress,
  cyclesUntilLongBreak,
  running,
  awaitingNext,
  focusBlocksToday,
  onStart,
  onSkip,
  onReset,
}: TimerViewProps) {
  const copy = PHASE_COPY[phase]
  const display = formatRemaining(remainingMs)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl">Focus</h1>
        <p className="text-sm text-ink-muted">One block at a time.</p>
      </header>

      <Card elevated>
        <CardContent className="flex flex-col items-center gap-5 py-10">
          {copy.tag !== null ? <Tag tone="accent">{copy.tag}</Tag> : null}

          <p
            className="font-display text-6xl font-bold text-ink tabular-nums"
            // A live value rather than decoration, so it is announced — but `aria-live` is off:
            // a screen reader reading "24:59, 24:58, 24:57" every second is unusable. The phase
            // label below is the live region instead, because *that* is the news.
            role="timer"
            aria-label={`${String(Math.ceil(remainingMs / 60_000))} minutes remaining`}
          >
            {display}
          </p>

          <p aria-live="polite" className="text-center text-sm text-ink-muted">
            <span className="font-display font-semibold text-ink">{copy.title}.</span> {copy.blurb}
          </p>

          {running ? (
            <ProgressBar
              value={progress}
              max={1}
              label={phase === 'working' ? 'Block progress' : 'Break progress'}
              showValue={false}
              tone={phase === 'working' ? 'primary' : 'success'}
              className="w-full max-w-xs"
            />
          ) : null}

          <div className="flex w-full max-w-xs flex-col gap-2">
            {running ? (
              <>
                <Button fullWidth variant="secondary" onClick={onSkip}>
                  {awaitingNext ? 'Next' : `Skip to ${phase === 'working' ? 'a break' : 'focus'}`}
                </Button>
                <Button fullWidth variant="ghost" onClick={onReset}>
                  Stop
                </Button>
              </>
            ) : (
              <Button fullWidth size="lg" onClick={onStart}>
                Start focusing
              </Button>
            )}

            {running && phase === 'working' && cyclesUntilLongBreak > 0 ? (
              <p className="text-center text-xs text-ink-faint">
                {cyclesUntilLongBreak} more block{cyclesUntilLongBreak === 1 ? '' : 's'} until a
                long break
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/*
        Surfaced only when > 0, and phrased as care rather than surveillance: "focus breaks" is a
        thing she took, not a score. A block she abandoned is deliberately not mentioned.
      */}
      {focusBlocksToday > 0 ? (
        <p className="text-center text-sm text-ink-muted">
          {focusBlocksToday === 1
            ? 'One focus break today 💗'
            : `${String(focusBlocksToday)} focus breaks today 💗`}
        </p>
      ) : null}

      <Card>
        <CardHeader title="Keep this tab open" />
        <CardContent className="text-sm leading-relaxed text-ink-muted">
          <p>
            The end-of-session chime only works while the page is open. If you switch to another app
            or close the tab, nothing can remind you — there are no background notifications by
            design.
          </p>
          <p className="mt-2">
            Leave StudyBao open next to your notes and it&rsquo;ll nudge you when it&rsquo;s time
            for a break.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
