import { BowIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tag } from '@/components/ui/tag'
import {
  DEFAULT_DURATIONS,
  sanitizeDurations,
  type TimerDurations,
} from '@/features/timer/lib/timer'
import type { Theme } from '@/lib/theme'

/**
 * Layer 3 — pure view. Theme and settings are passed in, so this file stays hook-free and
 * testable with plain props.
 */
export interface SettingsViewProps {
  theme: Theme
  onToggleTheme: () => void
  storageNoticeDismissed: boolean
  onDismissStorageNotice: () => void
  examDateInput: string
  onExamDateChange: (value: string) => void
  daysUntilExam?: number
  cramThresholdDays: number
  onCramThresholdChange: (days: number) => void
  /** Timer lengths. Optional fields in the row, so this arrives already defaulted. */
  timerDurations: TimerDurations
  onTimerDurationsChange: (patch: Partial<TimerDurations>) => void
}

export function SettingsView({
  theme,
  onToggleTheme,
  storageNoticeDismissed,
  onDismissStorageNotice,
  examDateInput,
  onExamDateChange,
  daysUntilExam,
  cramThresholdDays,
  onCramThresholdChange,
  timerDurations,
  onTimerDurationsChange,
}: SettingsViewProps) {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl">Settings</h1>
        <p className="text-sm text-ink-muted">Small app, few knobs.</p>
      </header>

      <Card>
        <CardHeader
          title="Your exam"
          description="This sets the countdown and when cram mode switches itself on."
        />
        <CardContent className="flex flex-col gap-3">
          <Input
            label="Exam date"
            type="date"
            value={examDateInput}
            onChange={(event) => onExamDateChange(event.target.value)}
          />

          {daysUntilExam === undefined ? (
            <p className="text-xs text-ink-faint">
              Set a date and the app stops waiting for cards to come due on their own once
              you&rsquo;re close to it.
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              {daysUntilExam === 0
                ? 'That’s today. Good luck — you’ve done the work.'
                : `${daysUntilExam} day${daysUntilExam === 1 ? '' : 's'} to go.`}
            </p>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="font-display text-sm font-semibold text-ink">
              Start cram mode this many days before
            </span>
            <input
              type="number"
              min={1}
              max={180}
              value={cramThresholdDays}
              onChange={(event) => {
                const days = Number(event.target.value)
                if (Number.isFinite(days) && days >= 1 && days <= 180) {
                  onCramThresholdChange(Math.round(days))
                }
              }}
              className="min-h-12 w-32 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base text-ink focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
            <span className="text-xs text-ink-muted">
              Inside that window, reviews ignore due dates and go to whatever you’ve missed most.
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Focus timer"
          description="How long a block runs. Changing these affects the next block, not one already going."
        />
        <CardContent className="flex flex-col gap-4">
          {/*
            No Save button, deliberately. These commit as she types a valid number, like the cram
            threshold above — and a number input that refuses invalid keystrokes cannot leave the
            row in a state the timer has to defend against. `sanitizeDurations` still guards the
            read path, because a stored value could always have come from somewhere else.
          */}
          <div className="flex flex-wrap gap-4">
            <DurationField
              label="Focus"
              minutes={timerDurations.workMin}
              onCommit={(workMin) => onTimerDurationsChange({ workMin })}
            />
            <DurationField
              label="Short break"
              minutes={timerDurations.breakMin}
              onCommit={(breakMin) => onTimerDurationsChange({ breakMin })}
            />
            <DurationField
              label="Long break"
              minutes={timerDurations.longBreakMin}
              onCommit={(longBreakMin) => onTimerDurationsChange({ longBreakMin })}
            />
            <DurationField
              label="Blocks to a long break"
              minutes={timerDurations.cyclesBeforeLongBreak}
              // The cycle count is a count, not minutes, so the guard differs.
              onCommit={(cyclesBeforeLongBreak) =>
                onTimerDurationsChange({
                  cyclesBeforeLongBreak: sanitizeDurations({ cyclesBeforeLongBreak })
                    .cyclesBeforeLongBreak,
                })
              }
            />
          </div>

          <div>
            <Button
              variant="ghost"
              size="sm"
              disabled={
                timerDurations.workMin === DEFAULT_DURATIONS.workMin &&
                timerDurations.breakMin === DEFAULT_DURATIONS.breakMin &&
                timerDurations.longBreakMin === DEFAULT_DURATIONS.longBreakMin &&
                timerDurations.cyclesBeforeLongBreak === DEFAULT_DURATIONS.cyclesBeforeLongBreak
              }
              onClick={() => onTimerDurationsChange(DEFAULT_DURATIONS)}
            >
              Back to 25 / 5 / 15, four blocks
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Appearance"
          description="Night mode is easier on the eyes at 2am."
          action={<Tag tone="neutral">{theme === 'night' ? 'Night' : 'Light'}</Tag>}
        />
        <CardContent>
          <Button variant="secondary" onClick={onToggleTheme}>
            {theme === 'night' ? 'Switch to light' : 'Switch to night'}
          </Button>
        </CardContent>
      </Card>

      {!storageNoticeDismissed ? (
        <Card>
          <CardHeader
            title="Keeping your notes safe"
            description="Worth knowing, because it's not obvious."
          />
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-ink-muted">
              iPads clear a website's saved data if you don't visit it for about a week. Adding
              StudyBao to your Home Screen stops that happening — it's two taps in the Share menu,
              and nothing gets installed.
            </p>
            <div>
              <Button variant="ghost" size="sm" onClick={onDismissStorageNotice}>
                Got it
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Your data"
          description="Everything lives on your device and in your own account."
        />
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled>
              Export
            </Button>
            <Button variant="secondary" disabled>
              Import
            </Button>
          </div>
          <p className="text-xs text-ink-faint">
            Backup lands with the sync work — it'll be the one thing you control completely.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="About" />
        <CardContent className="flex flex-col gap-2 text-sm text-ink-muted">
          <div className="flex items-center gap-2">
            <BowIcon className="size-5 text-primary" />
            <span className="font-display font-bold text-ink">StudyBao</span>
            <Tag tone="attention">v0.1.0</Tag>
          </div>
          <p>Made for the PNLE. Five decks, one for each Nursing Practice part.</p>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * One number field for a timer length.
 *
 * Commits on change rather than on blur or via a Save button. That is the pattern the cram
 * threshold above already uses, and it is the right one here for the same reason: there is no
 * partial value worth protecting. A number input that will not accept `0` or `abc` cannot leave a
 * state the timer has to defend against, and `sanitizeDurations` still guards the read path because
 * a stored row could have come from anywhere.
 */
function DurationField({
  label,
  minutes,
  onCommit,
}: {
  label: string
  minutes: number
  onCommit: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-sm font-semibold text-ink">{label}</span>
      <input
        type="number"
        min={1}
        max={180}
        value={minutes}
        onChange={(event) => {
          const parsed = Number(event.target.value)
          // Ignore an empty field or an out-of-range value rather than writing it: the input keeps
          // showing what she typed, and nothing invalid reaches the database.
          if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 180) onCommit(Math.round(parsed))
        }}
        className="min-h-12 w-28 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base text-ink focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />
    </label>
  )
}
