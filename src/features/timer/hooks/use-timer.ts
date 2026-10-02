import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  abandonSession,
  completeSession,
  recordTabHide,
  startSession,
} from '@/db/repositories/sessions'
import { playCue, type CueKind } from '../lib/cue'
import {
  DEFAULT_DURATIONS,
  idleState,
  minutesFor,
  sanitizeDurations,
  snapshot,
  startPhase,
  transition,
  type TimerDurations,
  type TimerPhase,
  type TimerState,
} from '../lib/timer'

/**
 * Layer 2 — the running timer.
 *
 * ## What this owns, and what it deliberately does not
 *
 * The **rules** live in `lib/timer.ts` as pure functions: which phase follows which, how long each
 * lasts, and what the remaining time is. This hook owns only what a pure function cannot: the
 * interval that repaints, the visibility listener, the sound, and the two database writes per
 * block.
 *
 * ## The clock
 *
 * `Date.now()` is read on every tick and the remaining time is **derived**, never accumulated. The
 * one-second interval is only a repaint trigger: if it fires late, or not at all for ten minutes
 * because iOS suspended the tab, the displayed time is still correct the moment it runs. That is
 * why `CLAUDE.md` bans a decrementing counter, and why nothing here subtracts from a stored number.
 *
 * ## Two writes per block
 *
 * A session row is created when a block starts and completed when it ends — see
 * `db/repositories/sessions.ts` for why. A block interrupted by a closed tab leaves its row
 * unfinished, which is the honest record of what happened.
 */

export interface TimerController {
  phase: TimerPhase
  remainingMs: number
  progress: number
  cyclesCompleted: number
  cyclesUntilLongBreak: number
  plannedMs: number
  durations: TimerDurations
  running: boolean
  /** True when the clock has run out and the next phase has not begun yet. */
  awaitingNext: boolean
  start: () => void
  /** End the current phase early and move on. A skipped work block does not count toward a cycle. */
  skip: () => void
  /** Abandon everything and go back to idle, recording the block as unfinished. */
  reset: () => void
}

export interface UseTimerOptions {
  /** From settings. Sanitized here, so an impossible value cannot reach the state machine. */
  durations?: Partial<TimerDurations>
  /**
   * Fired when a phase begins. Workflow G's nudges and Workflow F's dashboard need this rather
   * than polling.
   */
  onPhaseChange?: (phase: TimerPhase, cyclesCompleted: number) => void
}

/** Repaint cadence. See the doc comment: this drives rendering, not the arithmetic. */
const TICK_MS = 1000

/**
 * How long a finished phase waits before advancing itself.
 *
 * Non-zero on purpose. Advancing the instant the clock hits zero would start her break clock while
 * she is still reading the cue, so part of the break would be spent before she noticed. A short
 * pause lets the sound and the visual change land first.
 */
const AUTO_ADVANCE_MS = 3000

function cueFor(phase: TimerPhase): CueKind {
  switch (phase) {
    case 'working':
      return 'workStarted'
    case 'longBreak':
      return 'longBreakStarted'
    case 'break':
    case 'idle':
      return 'breakStarted'
  }
}

export function useTimer(options: UseTimerOptions = {}): TimerController {
  const durations = useMemo(() => sanitizeDurations(options.durations ?? {}), [options.durations])

  const [state, setState] = useState<TimerState>(() => idleState(DEFAULT_DURATIONS))
  const [now, setNow] = useState(() => Date.now())

  /**
   * The latest state, readable from callbacks without making them depend on it.
   *
   * Declared before everything that reads it, and written in an effect rather than during render —
   * `react-hooks` forbids the latter, correctly.
   */
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  /** The open session row for the running block. A ref because it is never rendered. */
  const sessionId = useRef<string | undefined>(undefined)
  /** Hides counted during the current block, mirrored into the row when it closes. */
  const hiddenCount = useRef(0)

  const onPhaseChange = useRef(options.onPhaseChange)
  useEffect(() => {
    onPhaseChange.current = options.onPhaseChange
  }, [options.onPhaseChange])

  /**
   * Durations behind a ref, read inside callbacks.
   *
   * Re-creating the interval or the callbacks whenever Settings changes would restart the tick
   * mid-block. A running block keeps the lengths it started with; the next one picks up the change.
   */
  const durationsRef = useRef(durations)
  useEffect(() => {
    durationsRef.current = durations
  }, [durations])

  /**
   * Repaint trigger only — the arithmetic reads the clock itself.
   *
   * One second, and its lateness does not matter: if iOS suspends the tab and this fires ten
   * minutes late, the next render computes the correct remaining time from `endsAt`. A decrementing
   * counter would have lost those ten minutes; this cannot.
   */
  useEffect(() => {
    if (state.phase === 'idle') return undefined

    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [state.phase])

  /**
   * Count a hide, and write it immediately.
   *
   * Written at the time rather than only at completion because the interesting case is the one that
   * never completes: a block abandoned by switching away should still know it was interrupted.
   */
  useEffect(() => {
    function onVisibilityChange(): void {
      if (document.visibilityState !== 'hidden') return
      const id = sessionId.current
      if (id === undefined) return

      hiddenCount.current += 1
      void recordTabHide(id).catch(() => {
        // A failed counter write must not interrupt the timer. It is a statistic, not the record
        // of whether she studied.
      })
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  /** Close the open row, if there is one. */
  const closeSession = useCallback((completed: boolean) => {
    const current = stateRef.current
    const id = sessionId.current
    sessionId.current = undefined

    if (id === undefined || current.startedAt === undefined) return

    const elapsed = Date.now() - current.startedAt
    const write = completed
      ? completeSession(id, { actualMs: elapsed, tabHiddenCount: hiddenCount.current })
      : abandonSession(id, elapsed)

    void write.catch(() => {
      // A missing history row is a smaller loss than a timer that refuses to move on, so this is
      // deliberately not surfaced to her.
    })
  }, [])

  /** Begin a phase: create its row, then start the clock. */
  const begin = useCallback((phase: Exclude<TimerPhase, 'idle'>, cyclesCompleted: number) => {
    const currentDurations = durationsRef.current
    const begunAt = Date.now()

    setState(startPhase(phase, currentDurations, begunAt, cyclesCompleted))
    setNow(begunAt)
    hiddenCount.current = 0
    sessionId.current = undefined

    void startSession(
      { type: phase, plannedMs: minutesFor(phase, currentDurations) * 60_000 },
      begunAt,
    )
      .then((session) => {
        // Guard against adopting the id after she has already reset or moved on, which would leave
        // a row nobody ever completes.
        if (stateRef.current.startedAt === begunAt) sessionId.current = session.id
      })
      .catch(() => undefined)

    onPhaseChange.current?.(phase, cyclesCompleted)
  }, [])

  /** Finish the current phase and begin the next one, cueing the transition. */
  const moveOn = useCallback(
    (completed: boolean) => {
      const current = stateRef.current
      if (current.phase === 'idle') return

      closeSession(completed)

      const next = transition(current, completed, durationsRef.current)
      playCue(cueFor(next.phase))
      begin(next.phase, next.cyclesCompleted)
    },
    [begin, closeSession],
  )

  const start = useCallback(() => {
    // Inside a press handler, which is what unlocks audio. See lib/cue.ts.
    playCue('workStarted')
    begin('working', 0)
  }, [begin])

  const skip = useCallback(() => moveOn(false), [moveOn])

  const reset = useCallback(() => {
    closeSession(false)
    setState(idleState(durationsRef.current))
    hiddenCount.current = 0
  }, [closeSession])

  const view = snapshot(state, now, durations)

  /**
   * True once the clock has run out, **derived during render** rather than held in state.
   *
   * This started as `useState` written from an effect, which the `react-hooks` lint rule flagged as
   * a cascading render — and it was right to. Whether the clock has run out is a pure function of
   * `state` and `now`, so storing it in state would be a second copy able to disagree with the
   * first. `snapshot` already computes it as `elapsed`.
   */
  const awaitingNext = state.phase !== 'idle' && view.elapsed

  /**
   * Schedule the automatic move to the next phase.
   *
   * The **only** thing this effect does is set a timeout; the fact that the phase has ended is
   * derived above, so nothing here can cascade a render. The delay is what stops a break starting
   * while she is still reading the cue — see `AUTO_ADVANCE_MS`.
   */
  useEffect(() => {
    if (state.phase === 'idle' || state.endsAt === undefined) return undefined

    const remaining = state.endsAt - Date.now()
    if (remaining > AUTO_ADVANCE_MS) return undefined

    const timer = setTimeout(() => moveOn(true), Math.max(0, remaining) + AUTO_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [now, state.phase, state.endsAt, moveOn])

  return {
    phase: view.phase,
    remainingMs: view.remainingMs,
    progress: view.progress,
    cyclesCompleted: state.cyclesCompleted,
    cyclesUntilLongBreak: view.cyclesUntilLongBreak,
    plannedMs: state.plannedMs,
    durations,
    running: state.phase !== 'idle',
    awaitingNext,
    start,
    skip,
    reset,
  }
}
