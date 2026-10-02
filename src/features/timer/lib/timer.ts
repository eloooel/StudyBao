/**
 * The Pomodoro state machine. Pure: no clock, no timers, no database, no DOM.
 *
 * ## The one rule that matters
 *
 * **Remaining time is derived from `startedAt` and `now`, never counted down.** `CLAUDE.md` lists
 * "never use a decrementing timer" as non-negotiable, and the reason is that a decrementing counter
 * is wrong in exactly the situation she is in: iOS suspends timers in a backgrounded tab. A counter
 * that ticks is a number that drifts, and the drift grows with every interruption. A subtraction
 * cannot drift — when she comes back after ten minutes away, the clock is simply correct.
 *
 * That also makes the whole thing testable with an injected `now`, which is why there is not a
 * single `Date.now()` call in this file.
 *
 * ## What a "cycle" is
 *
 * Four work blocks, with a short break between them, then a long break. The guide's defaults are
 * 25/5/15 and N = 4. `cyclesCompleted` counts **finished work blocks**, not transitions, so the
 * long break is chosen after the Nth work block rather than after the Nth break.
 */

/** The four phases. `idle` is "nothing running"; the other three are durations. */
export type TimerPhase = 'idle' | 'working' | 'break' | 'longBreak'

export interface TimerDurations {
  workMin: number
  breakMin: number
  longBreakMin: number
  /** Work blocks completed before a long break instead of a short one. */
  cyclesBeforeLongBreak: number
}

export interface TimerState {
  phase: TimerPhase
  /** Epoch ms the current phase began. Absent only while `idle`. */
  startedAt?: number
  /** Epoch ms the current phase is expected to end: `startedAt + plannedMs`. */
  endsAt?: number
  /** Length of the current phase. Derived from the durations, stored so the display is stable. */
  plannedMs: number
  /** Work blocks finished since the timer was last idle. Drives the long-break decision. */
  cyclesCompleted: number
  /** How many times the tab went hidden during the current phase. See the hook. */
  tabHiddenCount: number
}

export interface TimerSnapshot {
  phase: TimerPhase
  /** Milliseconds left in the current phase, floored at zero. Zero while idle. */
  remainingMs: number
  /** 0–1 through the current phase. Zero while idle. Used for the progress ring. */
  progress: number
  /** True once the clock has reached `endsAt` and the phase is ready to be advanced. */
  elapsed: boolean
  /** How many work blocks are done toward the next long break. */
  cyclesCompleted: number
  /** Work blocks still to go before the long break. */
  cyclesUntilLongBreak: number
  /** Total length of the phase, for "25:00" style display and for the accessible label. */
  plannedMs: number
}

const MS_PER_MINUTE = 60_000

/** The guide's defaults: 25/5/15, long break after 4 work blocks. */
export const DEFAULT_DURATIONS: TimerDurations = {
  workMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cyclesBeforeLongBreak: 4,
}

/** Minutes for a phase. `idle` has no length of its own. */
export function minutesFor(phase: TimerPhase, durations: TimerDurations): number {
  switch (phase) {
    case 'working':
      return durations.workMin
    case 'break':
      return durations.breakMin
    case 'longBreak':
      return durations.longBreakMin
    case 'idle':
      return 0
  }
}

/**
 * Guard the stored durations.
 *
 * She can type into these fields, and a `0` or a `NaN` would produce a phase that ends the instant
 * it starts — an infinite transition loop, on a device we cannot inspect. Clamping here rather than
 * in the form means every entry point is covered, including a value that arrived from a stale
 * settings row.
 */
export function sanitizeDurations(durations: Partial<TimerDurations>): TimerDurations {
  return {
    workMin: clampMinutes(durations.workMin, DEFAULT_DURATIONS.workMin),
    breakMin: clampMinutes(durations.breakMin, DEFAULT_DURATIONS.breakMin),
    longBreakMin: clampMinutes(durations.longBreakMin, DEFAULT_DURATIONS.longBreakMin),
    cyclesBeforeLongBreak: clampCycles(durations.cyclesBeforeLongBreak),
  }
}

function clampMinutes(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(180, Math.max(1, Math.round(value)))
}

function clampCycles(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DURATIONS.cyclesBeforeLongBreak
  }
  // At least 1: zero would mean "long break after no work blocks", which is not a cycle.
  return Math.min(12, Math.max(1, Math.round(value)))
}

/** The state before anything has started. */
export function idleState(durations: TimerDurations): TimerState {
  return {
    phase: 'idle',
    plannedMs: minutesFor('working', durations) * MS_PER_MINUTE,
    cyclesCompleted: 0,
    tabHiddenCount: 0,
  }
}

/**
 * Which phase comes after finishing this one.
 *
 * The long break is decided here, from `cyclesCompleted` **after** the work block was counted —
 * which is why the caller must increment before asking. Getting that order wrong produces a long
 * break after three blocks or after five, and it is the kind of off-by-one that is invisible until
 * she has used it for a week.
 */
export function nextPhaseAfter(
  phase: TimerPhase,
  cyclesCompleted: number,
  durations: TimerDurations,
): TimerPhase {
  switch (phase) {
    case 'idle':
      return 'working'
    case 'working':
      return cyclesCompleted > 0 && cyclesCompleted % durations.cyclesBeforeLongBreak === 0
        ? 'longBreak'
        : 'break'
    case 'break':
    case 'longBreak':
      return 'working'
  }
}

/**
 * Start a phase.
 *
 * `tabHiddenCount` resets per phase, because it is a property of *this* block of attention rather
 * than of the sitting. A count that accumulated across a whole afternoon would make every block
 * look abandoned.
 */
export function startPhase(
  phase: Exclude<TimerPhase, 'idle'>,
  durations: TimerDurations,
  now: number,
  cyclesCompleted: number,
): TimerState {
  const plannedMs = minutesFor(phase, durations) * MS_PER_MINUTE
  return {
    phase,
    startedAt: now,
    endsAt: now + plannedMs,
    plannedMs,
    cyclesCompleted,
    tabHiddenCount: 0,
  }
}

/**
 * What to do when a phase ends.
 *
 * The single place that decides the transition, so the hook does not have to. `completed` is
 * whether the block actually finished — the clock reached zero — as opposed to being skipped,
 * which matters because a skipped work block must not earn a long break.
 *
 * Returns the phase to begin and the cycle count to carry into it.
 */
export function transition(
  current: TimerState,
  completed: boolean,
  durations: TimerDurations,
): { phase: Exclude<TimerPhase, 'idle'>; cyclesCompleted: number } {
  // Only a *completed* work block advances the cycle. This is the off-by-one that decides whether
  // the long break arrives after four blocks of focus or after four presses of Start.
  const cyclesCompleted =
    current.phase === 'working' && completed ? current.cyclesCompleted + 1 : current.cyclesCompleted

  const following = nextPhaseAfter(current.phase, cyclesCompleted, durations)

  return {
    phase: following === 'idle' ? 'working' : following,
    cyclesCompleted,
  }
}

/**
 * Everything the view needs, derived from the state and the clock.
 *
 * Pure, so the "does the timer lie?" question is answered by unit tests rather than by watching a
 * screen for 25 minutes.
 */
export function snapshot(state: TimerState, now: number, durations: TimerDurations): TimerSnapshot {
  if (state.phase === 'idle' || state.endsAt === undefined) {
    return {
      phase: 'idle',
      remainingMs: 0,
      progress: 0,
      elapsed: false,
      cyclesCompleted: state.cyclesCompleted,
      cyclesUntilLongBreak: 0,
      plannedMs: state.plannedMs,
    }
  }

  const remainingMs = Math.max(0, state.endsAt - now)
  const progress =
    state.plannedMs <= 0
      ? 1
      : Math.min(1, Math.max(0, (state.plannedMs - remainingMs) / state.plannedMs))

  return {
    phase: state.phase,
    remainingMs,
    progress,
    elapsed: remainingMs <= 0,
    cyclesCompleted: state.cyclesCompleted,
    cyclesUntilLongBreak: cyclesToLongBreak(state, durations),
    plannedMs: state.plannedMs,
  }
}

/**
 * Work blocks remaining before the long break.
 *
 * Purely the "3 of 4 to a long break" hint, so an off-by-one here is cosmetic — which is exactly
 * why it is a separate function from the decision in `nextPhaseAfter`. The decision must be right;
 * this must merely be reasonable.
 *
 * While working, the block in progress counts toward the total she is heading for, so the label
 * reads "1 of 4" during the first block rather than "4 of 4". While on a break, the block is
 * already done, so the count is simply how many remain in the cycle.
 */
export function cyclesToLongBreak(state: TimerState, durations: TimerDurations): number {
  const perCycle = durations.cyclesBeforeLongBreak
  if (perCycle <= 0) return 0

  const done = state.phase === 'working' ? state.cyclesCompleted + 1 : state.cyclesCompleted
  const remainder = done % perCycle
  return remainder === 0 ? 0 : perCycle - remainder
}
