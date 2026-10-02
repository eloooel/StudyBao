import { TimerView } from '../components/timer-view'
import { useTimerPage } from '../hooks/use-timer-page'

/**
 * Layer 1 — thin route component.
 *
 * The screen is deliberately usable standalone, which `docs/BUILD_GUIDE.md` §4 asks for: it needs
 * no cards, no exam date and no settings to work. Every dependency it does have — the configured
 * lengths, the day's completed blocks — arrives through Layer 2.
 */
export default function TimerPage() {
  const timer = useTimerPage()

  if (timer.loading) {
    return (
      <p className="py-16 text-center text-sm text-ink-muted" role="status">
        Getting your timer ready…
      </p>
    )
  }

  return (
    <TimerView
      phase={timer.phase}
      remainingMs={timer.remainingMs}
      progress={timer.progress}
      cyclesUntilLongBreak={timer.cyclesUntilLongBreak}
      running={timer.running}
      awaitingNext={timer.awaitingNext}
      focusBlocksToday={timer.focusBlocksToday}
      onStart={timer.start}
      onSkip={timer.skip}
      onReset={timer.reset}
    />
  )
}
