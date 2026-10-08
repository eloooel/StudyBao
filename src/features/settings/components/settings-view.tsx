import { BowIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Tag } from '@/components/ui/tag'
import {
  HomeScreenAddedNotice,
  HomeScreenExplanation,
  HomeScreenHelpButton,
  HomeScreenNotNeededNotice,
} from '@/features/first-run/components/home-screen-explanation'
import type { HomeScreenState } from '@/features/first-run/lib/home-screen'
import {
  DEFAULT_DURATIONS,
  sanitizeDurations,
  type TimerDurations,
} from '@/features/timer/lib/timer'
import type { Theme } from '@/lib/theme'
import { BackupCard, type BackupPanelProps } from './backup-card'

/**
 * Layer 3 — pure view. Theme and settings are passed in, so this file stays hook-free and
 * testable with plain props.
 */
export interface SettingsViewProps {
  theme: Theme
  onToggleTheme: () => void
  examDateInput: string
  onExamDateChange: (value: string) => void
  daysUntilExam?: number
  cramThresholdDays: number
  onCramThresholdChange: (days: number) => void
  /** Timer lengths. Optional fields in the row, so this arrives already defaulted. */
  timerDurations: TimerDurations
  onTimerDurationsChange: (patch: Partial<TimerDurations>) => void
  /**
   * Where this device stands on the Home Screen question. Owned by `useHomeScreenSetup`, so this
   * view never reads `window` and the same decision cannot be made twice in two ways.
   */
  homeScreenState: HomeScreenState
  /** Whether the "How to add it" explanation is open. */
  homeScreenHelpOpen: boolean
  onOpenHomeScreenHelp: () => void
  onCloseHomeScreenHelp: () => void
  /**
   * The backup card's interaction: save, restore, and the confirmation dialog. Grouped into one
   * prop because it is one state machine, and ten loose props would bury the settings above it.
   */
  backup: BackupPanelProps
}

export function SettingsView({
  theme,
  onToggleTheme,
  examDateInput,
  onExamDateChange,
  daysUntilExam,
  cramThresholdDays,
  onCramThresholdChange,
  timerDurations,
  onTimerDurationsChange,
  homeScreenState,
  homeScreenHelpOpen,
  onOpenHomeScreenHelp,
  onCloseHomeScreenHelp,
  backup,
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

      {/*
        Permanent, and deliberately not dismissible. It was a "Got it" card that could be dismissed
        and gone forever, which is the wrong shape twice over: a card she can dismiss is a card she
        loses the instructions from, and one that looks the same before and after she has added the
        icon is a nag. So it has three states and always says which one applies.
      */}
      <Card>
        <CardHeader
          title="Keeping your notes safe"
          description={
            homeScreenState === 'already-added'
              ? 'You\u2019re all set.'
              : 'Worth knowing, because it\u2019s not obvious.'
          }
        />
        <CardContent className="flex flex-col gap-3">
          {homeScreenState === 'add-now' ? (
            <>
              <p className="text-sm leading-relaxed text-ink-muted">
                iPads clear a website&rsquo;s saved data after about a week away. A Home Screen icon
                is the one copy that&rsquo;s kept safe — it&rsquo;s two taps, and it&rsquo;s worth
                doing before you&rsquo;ve built up a lot of cards.
              </p>
              <HomeScreenHelpButton onOpen={onOpenHomeScreenHelp} />
            </>
          ) : null}

          {homeScreenState === 'already-added' ? <HomeScreenAddedNotice /> : null}
          {homeScreenState === 'desktop' ? <HomeScreenNotNeededNotice /> : null}
        </CardContent>
      </Card>

      {/*
        The same explanation the first-run prompt shows, from the same component — so the two can
        never disagree about which row she has to tap.
      */}
      <Modal
        open={homeScreenHelpOpen}
        onClose={onCloseHomeScreenHelp}
        title="Add StudyBao to your Home Screen"
        description="It takes about ten seconds, and it's the thing that keeps your notes."
        className="w-[min(34rem,calc(100vw-2rem))]"
        footer={
          <Button variant="secondary" onClick={onCloseHomeScreenHelp}>
            Close
          </Button>
        }
      >
        <HomeScreenExplanation />
      </Modal>

      {/*
        Its own component: a card, a hidden file input and a confirmation dialog are one
        interaction, and this screen is long enough without them inline. See backup-card.tsx for
        why the dialog's copy is not what the tests assert.
      */}
      <BackupCard backup={backup} />

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
