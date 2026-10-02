import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DURATIONS,
  cyclesToLongBreak,
  idleState,
  minutesFor,
  nextPhaseAfter,
  sanitizeDurations,
  snapshot,
  startPhase,
  transition,
  type TimerDurations,
} from './timer'

/**
 * The timer's rules.
 *
 * Time is always injected, so every case here is deterministic and none of them waits. The two
 * properties worth protecting above all others:
 *
 * 1. **Remaining time is a subtraction, not a countdown.** A test that walked a fake clock forward
 *    in steps would pass for a decrementing counter too, so the cases below jump the clock by large,
 *    irregular amounts instead — which is what the suspended-tab situation actually looks like.
 * 2. **The long break comes after the Nth work block.** An off-by-one there is invisible until she
 *    has used it for a week.
 */
const DURATIONS: TimerDurations = {
  workMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cyclesBeforeLongBreak: 4,
}
const MIN = 60_000
const T0 = 1_800_000_000_000

describe('phase lengths', () => {
  it('maps each phase to its configured minutes', () => {
    expect(minutesFor('working', DURATIONS)).toBe(25)
    expect(minutesFor('break', DURATIONS)).toBe(5)
    expect(minutesFor('longBreak', DURATIONS)).toBe(15)
    expect(minutesFor('idle', DURATIONS)).toBe(0)
  })

  it('ships the guide default of 25/5/15', () => {
    expect(DEFAULT_DURATIONS).toMatchObject({ workMin: 25, breakMin: 5, longBreakMin: 15 })
  })
})

describe('sanitizeDurations', () => {
  it('falls back to the default for anything unusable', () => {
    // These fields are typed into by hand, and a zero would make a phase end the instant it
    // started — an infinite transition loop on a device nobody can inspect.
    expect(sanitizeDurations({ workMin: 0 }).workMin).toBe(1)
    expect(sanitizeDurations({ workMin: Number.NaN }).workMin).toBe(DEFAULT_DURATIONS.workMin)
    expect(sanitizeDurations({ workMin: undefined }).workMin).toBe(DEFAULT_DURATIONS.workMin)
    expect(sanitizeDurations({ workMin: -5 }).workMin).toBe(1)
  })

  it('caps absurd values rather than accepting them', () => {
    expect(sanitizeDurations({ workMin: 9999 }).workMin).toBe(180)
  })

  it('rounds a fractional minute', () => {
    expect(sanitizeDurations({ workMin: 24.6 }).workMin).toBe(25)
  })

  it('never allows a cycle of zero work blocks', () => {
    // "Long break after no work blocks" is not a cycle; it would make the first break long.
    expect(sanitizeDurations({ cyclesBeforeLongBreak: 0 }).cyclesBeforeLongBreak).toBe(1)
    expect(sanitizeDurations({ cyclesBeforeLongBreak: -3 }).cyclesBeforeLongBreak).toBe(1)
  })
})

describe('startPhase', () => {
  it('derives the end from the start, not from a countdown', () => {
    const state = startPhase('working', DURATIONS, T0, 0)

    expect(state.startedAt).toBe(T0)
    expect(state.endsAt).toBe(T0 + 25 * MIN)
    expect(state.plannedMs).toBe(25 * MIN)
  })

  it('resets the hidden-tab count per phase', () => {
    // The count describes one block of attention, not the whole afternoon. Carrying it over would
    // make every block look abandoned.
    const state = startPhase('break', DURATIONS, T0, 2)

    expect(state.tabHiddenCount).toBe(0)
  })
})

describe('snapshot — remaining time is a subtraction', () => {
  it('reports the full duration at the instant the phase starts', () => {
    const state = startPhase('working', DURATIONS, T0, 0)

    expect(snapshot(state, T0, DURATIONS).remainingMs).toBe(25 * MIN)
  })

  it('is still correct after a long, irregular jump — the suspended-tab case', () => {
    // The test a decrementing counter fails. iOS suspends timers in a backgrounded tab, so the
    // real situation is a jump of minutes, not a tidy sequence of one-second ticks.
    const state = startPhase('working', DURATIONS, T0, 0)

    expect(snapshot(state, T0 + 7 * MIN + 13_000, DURATIONS).remainingMs).toBe(
      25 * MIN - 7 * MIN - 13_000,
    )
    expect(snapshot(state, T0 + 24 * MIN + 59_000, DURATIONS).remainingMs).toBe(1_000)
  })

  it('floors at zero rather than going negative when she comes back late', () => {
    const state = startPhase('working', DURATIONS, T0, 0)

    const late = snapshot(state, T0 + 90 * MIN, DURATIONS)
    expect(late.remainingMs).toBe(0)
    expect(late.elapsed).toBe(true)
    // Not -260%: a progress bar that overshoots renders as a broken ring.
    expect(late.progress).toBe(1)
  })

  it('reports elapsed exactly at the boundary, not a millisecond later', () => {
    const state = startPhase('break', DURATIONS, T0, 1)

    expect(snapshot(state, T0 + 5 * MIN - 1, DURATIONS).elapsed).toBe(false)
    expect(snapshot(state, T0 + 5 * MIN, DURATIONS).elapsed).toBe(true)
  })

  it('advances progress from 0 to 1 across the phase', () => {
    const state = startPhase('working', DURATIONS, T0, 0)

    expect(snapshot(state, T0, DURATIONS).progress).toBe(0)
    expect(snapshot(state, T0 + 12.5 * MIN, DURATIONS).progress).toBeCloseTo(0.5)
    expect(snapshot(state, T0 + 25 * MIN, DURATIONS).progress).toBe(1)
  })

  it('reports an idle timer as empty rather than as a zero-length phase', () => {
    const state = idleState(DURATIONS)

    const idle = snapshot(state, T0, DURATIONS)
    expect(idle.phase).toBe('idle')
    expect(idle.remainingMs).toBe(0)
    expect(idle.elapsed).toBe(false)
    // Idle is not "finished", so the finished state must not be triggered.
    expect(idle.progress).toBe(0)
  })
})

describe('nextPhaseAfter', () => {
  it('goes idle → working and break → working', () => {
    expect(nextPhaseAfter('idle', 0, DURATIONS)).toBe('working')
    expect(nextPhaseAfter('break', 1, DURATIONS)).toBe('working')
    expect(nextPhaseAfter('longBreak', 4, DURATIONS)).toBe('working')
  })

  it('takes a short break after each work block except the Nth', () => {
    // `cyclesCompleted` is read *after* the finished block was counted, which is why 1 is the
    // first block and 4 is the fourth.
    expect(nextPhaseAfter('working', 1, DURATIONS)).toBe('break')
    expect(nextPhaseAfter('working', 2, DURATIONS)).toBe('break')
    expect(nextPhaseAfter('working', 3, DURATIONS)).toBe('break')
  })

  it('takes a long break after the fourth work block', () => {
    expect(nextPhaseAfter('working', 4, DURATIONS)).toBe('longBreak')
  })

  it('takes a long break again on every multiple of the cycle', () => {
    expect(nextPhaseAfter('working', 8, DURATIONS)).toBe('longBreak')
    expect(nextPhaseAfter('working', 9, DURATIONS)).toBe('break')
  })

  it('honours a non-default cycle length', () => {
    const short: TimerDurations = { ...DURATIONS, cyclesBeforeLongBreak: 2 }

    expect(nextPhaseAfter('working', 2, short)).toBe('longBreak')
    expect(nextPhaseAfter('working', 3, short)).toBe('break')
  })

  it('never chooses a long break at zero completed blocks', () => {
    // Guards the `% 0` shape: with the count at zero the modulo test must not fire, or the very
    // first break would be a long one.
    expect(nextPhaseAfter('working', 0, DURATIONS)).toBe('break')
  })
})

describe('transition', () => {
  it('counts a completed work block and takes a short break', () => {
    const state = startPhase('working', DURATIONS, T0, 0)

    expect(transition(state, true, DURATIONS)).toEqual({ phase: 'break', cyclesCompleted: 1 })
  })

  it('does NOT count a skipped work block, so a long break is never handed out unearned', () => {
    // The core reason `completed` is a parameter rather than an assumption. Four presses of Start
    // are not four blocks of focus.
    const state = startPhase('working', DURATIONS, T0, 0)

    expect(transition(state, false, DURATIONS)).toEqual({ phase: 'break', cyclesCompleted: 0 })
  })

  it('takes a long break after the fourth completed work block', () => {
    const state = startPhase('working', DURATIONS, T0, 3)

    expect(transition(state, true, DURATIONS)).toEqual({ phase: 'longBreak', cyclesCompleted: 4 })
  })

  it('does not take a long break after the fourth *skipped* block', () => {
    const state = startPhase('working', DURATIONS, T0, 3)

    expect(transition(state, false, DURATIONS)).toEqual({ phase: 'break', cyclesCompleted: 3 })
  })

  it('carries the cycle count through a break without changing it', () => {
    const state = startPhase('break', DURATIONS, T0, 2)

    expect(transition(state, true, DURATIONS)).toEqual({ phase: 'working', cyclesCompleted: 2 })
  })

  it('does not count a break as a block even when it completes', () => {
    // Only a *work* phase advances the cycle. Counting a completed break would halve the number of
    // blocks between long breaks.
    const rest = startPhase('longBreak', DURATIONS, T0, 4)

    expect(transition(rest, true, DURATIONS).cyclesCompleted).toBe(4)
  })

  it('starts work from idle', () => {
    expect(transition(idleState(DURATIONS), true, DURATIONS)).toEqual({
      phase: 'working',
      cyclesCompleted: 0,
    })
  })
})

describe('cyclesToLongBreak', () => {
  it('counts the block in progress, so the first block reads 1 of 4', () => {
    // `cyclesCompleted` is 0 at the start of the first work block, so this is "this block plus two
    // more": the hint reads "1 of 4".
    const state = { ...startPhase('working', DURATIONS, T0, 0) }

    expect(cyclesToLongBreak(state, DURATIONS)).toBe(3)
  })

  it('reads 1 of 4 again at the start of the next cycle', () => {
    // After four work blocks she is at position 5, which is the first block of the second cycle.
    // Reporting 0 here would tell her a long break was due when the long break has just ended.
    const state = { ...startPhase('working', DURATIONS, T0, 4) }

    expect(cyclesToLongBreak(state, DURATIONS)).toBe(3)
  })

  it('does not count the block during a break, because it is already finished', () => {
    const state = { ...startPhase('break', DURATIONS, T0, 1) }

    expect(cyclesToLongBreak(state, DURATIONS)).toBe(3)
  })

  it('reaches zero on the block that triggers the long break', () => {
    // The fourth work block started with three completed, so this is the one that earns it.
    const state = { ...startPhase('working', DURATIONS, T0, 3) }

    expect(cyclesToLongBreak(state, DURATIONS)).toBe(0)
  })

  it('never reports a negative count', () => {
    const state = { ...startPhase('working', DURATIONS, T0, 99) }

    expect(cyclesToLongBreak(state, DURATIONS)).toBeGreaterThanOrEqual(0)
  })

  it('returns zero for a zero-length cycle rather than dividing by zero', () => {
    const broken: TimerDurations = { ...DURATIONS, cyclesBeforeLongBreak: 0 }
    const state = { ...startPhase('working', DURATIONS, T0, 0) }

    expect(cyclesToLongBreak(state, broken)).toBe(0)
  })
})
