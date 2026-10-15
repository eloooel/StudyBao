import { useEffect, useId, useRef, useState } from 'react'

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
  MAX_CYCLES_BEFORE_LONG_BREAK,
  MAX_TIMER_MINUTES,
  MIN_CYCLES_BEFORE_LONG_BREAK,
  MIN_TIMER_MINUTES,
  type TimerDurations,
} from '@/features/timer/lib/timer'
import type { Theme } from '@/lib/theme'
import { cn } from '@/lib/cn'
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

          {/*
            The same field the timer lengths use, rather than a second copy of it. It had this
            defect inline: it committed on every keystroke behind the identical false comment, so
            this box could not be emptied either.
          */}
          <DurationField
            label="Start cram mode this many days before"
            minutes={cramThresholdDays}
            onCommit={onCramThresholdChange}
            hint="Inside that window, reviews ignore due dates and go to whatever you’ve missed most."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Focus timer"
          description="How long a block runs. Changing these affects the next block, not one already going."
        />
        <CardContent className="flex flex-col gap-4">
          {/*
            No Save button, deliberately. Each field commits when she leaves it (or presses Enter),
            which is what makes the field clearable — the defect this replaced committed on every
            keystroke, so an empty box was rejected and React wrote the old value straight back,
            leaving her unable to delete the last digit. A field that holds raw text while she types
            can be emptied, and nothing invalid reaches the row because `sanitizeDurations` still
            guards the read path.
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
            {/*
              The cycle count is a count, not minutes, so it does not share the 1–180 bounds: its
              own range is the one `clampCycles` already enforces on every read.
            */}
            <DurationField
              label="Blocks to a long break"
              minutes={timerDurations.cyclesBeforeLongBreak}
              min={MIN_CYCLES_BEFORE_LONG_BREAK}
              max={MAX_CYCLES_BEFORE_LONG_BREAK}
              onCommit={(cyclesBeforeLongBreak) =>
                onTimerDurationsChange({ cyclesBeforeLongBreak })
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
 * One number field, for a timer length, the cycle count and the cram threshold.
 *
 * ## Why it holds text rather than a number
 *
 * This is a **controlled** input, and the version this replaced committed on every keystroke behind
 * a comment claiming that an empty field was ignored. It was not: clearing the box made
 * `event.target.value` `''`, `Number('')` is `0`, the range guard rejected it, `onCommit` never ran,
 * the stored value never changed, and React wrote the old value straight back into the DOM. **So the
 * field could not be emptied, and the last remaining digit reappeared as soon as she deleted it.**
 * That is the whole bug report — "it does not remove the first number in the text" — and the false
 * comment is why it survived.
 *
 * Holding the raw string while she types is what makes an empty box representable. The value only
 * reaches the database when she leaves the field or presses Enter, so `"2"` on the way to `"25"` is
 * never written as 2.
 *
 * ## It does not silently revert, and that is deliberate
 *
 * Reverting to the last valid value on blur would be the same silence in a different coat, so an
 * out-of-range entry keeps what she typed, writes nothing, and **says what the range is**. The range
 * is also shown when she leaves the box empty, because an empty box that still shows 25 on the next
 * screen is confusing unless the field tells her why.
 *
 * `lastCommitted` deserves its name to be read carefully: it is the last value this field
 * *committed or displayed*, not the last value she typed. Without it the sync effect below would
 * fight her own edit — an out-of-range `200` never reaches the prop, so the prop would look
 * "unchanged" and an effect keyed only on the prop would have nothing to compare against.
 */
function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
  hint,
  className,
}: {
  label: string
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
  /** Optional line shown under the field. The empty-on-blur message is generated from the range. */
  hint?: string
  /** Extra classes for the wrapper. The input is always `w-28`, so the row stays aligned. */
  className?: string
}) {
  const [text, setText] = useState(String(value))
  const [error, setError] = useState<string | undefined>(undefined)
  const lastCommitted = useRef(value)
  // Ties the label to the input across the sibling split described below.
  const inputId = useId()

  // Adopt a value that changed from outside — the "Back to 25 / 5 / 15" button, or a different
  // screen's write. Comparing against `lastCommitted` rather than against `text` is what stops this
  // overwriting what she is currently typing.
  useEffect(() => {
    if (value === lastCommitted.current) return
    lastCommitted.current = value
    setText(String(value))
    setError(undefined)
  }, [value])

  const range = `between ${String(min)} and ${String(max)}`

  function commit(): void {
    const trimmed = text.trim()

    // Empty is a real state, not a mistake: she cleared it. Keep the stored value rather than
    // guessing at a replacement, and say where the valid range is.
    if (trimmed === '') {
      setText(String(value))
      setError(`Give it a number ${range}.`)
      return
    }

    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      // Her text stays on screen. Nothing is written, and nothing is silently changed.
      setError(`Give it a whole number ${range}.`)
      return
    }

    const rounded = Math.round(parsed)
    setError(undefined)
    setText(String(rounded))
    lastCommitted.current = rounded
    onCommit(rounded)
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/*
        The input is wrapped by the label, but the range message is NOT: it is a sibling of the
        label, and the label points at the input by id.
        That is not layout tidiness. A message inside a `<label>` becomes part of the label's text,
        so the control's accessible name changes the moment validation fires — "Focus" becomes
        "FocusGive it a whole number between 1 and 180." — which breaks voice control and makes the
        field unaddressable by the name it had a second earlier. Measured, not assumed: it is what a
        `getByLabelText('Focus')` does on either side of a blur.
      */}
      <label className="flex flex-col gap-1.5" htmlFor={inputId}>
        <span className="font-display text-sm font-semibold text-ink">{label}</span>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={text}
          aria-invalid={error === undefined ? undefined : true}
          onChange={(event) => {
            setText(event.target.value)
            setError(undefined)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
          className={cn(
            'min-h-12 rounded-[var(--radius-control)] border bg-surface px-3.5 text-base text-ink',
            'focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent',
            error === undefined ? 'border-line' : 'border-accent',
            'w-28',
          )}
        />
      </label>
      <FieldMessage error={error} fallback={hint} visible={hint !== undefined} />
    </div>
  )
}

/**
 * One line under the field: the error if there is one, otherwise the fallback.
 *
 * Extracted from `NumberField` for the same reason `NumberField` itself is a component: two nested
 * ternaries in JSX is where a wrong condition hides.
 */
function FieldMessage({
  error,
  fallback,
  visible,
}: {
  error: string | undefined
  fallback: string | undefined
  visible: boolean
}) {
  if (error !== undefined) {
    return (
      <span role="alert" className="text-xs font-semibold text-accent">
        {error}
      </span>
    )
  }
  if (!visible || fallback === undefined) return null
  return <span className="text-xs text-ink-muted">{fallback}</span>
}

/**
 * A timer length in minutes.
 *
 * Thin wrapper over `NumberField` so the four call sites keep their own vocabulary — `minutes` —
 * and the shared bounds are stated once, in `timer.ts`, next to the clamps that enforce them.
 * `sanitizeDurations` still guards the read path, because a stored row could have come from an
 * older build or a hand-edited database.
 */
function DurationField({
  label,
  minutes,
  onCommit,
  hint,
  min = MIN_TIMER_MINUTES,
  max = MAX_TIMER_MINUTES,
}: {
  label: string
  minutes: number
  onCommit: (value: number) => void
  hint?: string
  min?: number
  max?: number
}) {
  return (
    <NumberField
      label={label}
      value={minutes}
      min={min}
      max={max}
      onCommit={onCommit}
      {...(hint === undefined ? {} : { hint })}
    />
  )
}
