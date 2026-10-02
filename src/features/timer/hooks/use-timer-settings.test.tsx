import { describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import { getSettings } from '@/db/repositories/settings'
import { DEFAULT_DURATIONS } from '../lib/timer'
import { useTimerSettings } from './use-timer-settings'

/**
 * The timer's configurable lengths, end to end against a real in-memory IndexedDB.
 *
 * `docs/BUILD_GUIDE.md` §4 item 2 asks for "configurable durations (defaults 25/5/15)", and this is
 * the seam where that can silently not work: the row fields are **optional**, so a write that never
 * lands, or a read that ignores what was written, both look like "the defaults are in force" and
 * nothing would fail. The timer would simply always be 25 minutes.
 */
describe('useTimerSettings', () => {
  it('reports the defaults when the settings row has no timer fields', async () => {
    // The state a Workflow B/C settings row is in: no timer fields at all. Absent must mean "use the
    // default", never "zero minutes" — a zero would make every phase end the instant it started.
    const { result } = renderHook(() => useTimerSettings())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.durations).toEqual(DEFAULT_DURATIONS)
  })

  it('persists a change to the settings row', async () => {
    const { result } = renderHook(() => useTimerSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateDurations({ workMin: 50 })
    })

    expect((await getSettings()).workMin).toBe(50)
  })

  it('reads back what was written, so the change is not silently ignored', async () => {
    const { result, unmount } = renderHook(() => useTimerSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateDurations({ workMin: 40, breakMin: 8, longBreakMin: 20 })
    })

    expect(result.current.durations).toMatchObject({ workMin: 40, breakMin: 8, longBreakMin: 20 })

    // A fresh mount, as a reload would produce: the values must come from the database, not from
    // component state.
    unmount()
    const remounted = renderHook(() => useTimerSettings())
    await waitFor(() => expect(remounted.result.current.loading).toBe(false))

    expect(remounted.result.current.durations).toMatchObject({
      workMin: 40,
      breakMin: 8,
      longBreakMin: 20,
    })
  })

  it('sanitizes an impossible stored value on read instead of trusting it', async () => {
    // The guard that matters most. A stored `0` would make a phase end the instant it began, and
    // the timer would loop forever on a device nobody can inspect — so the read path clamps rather
    // than the write path being the only defence. This is why `sanitizeDurations` is applied here
    // as well as in the state machine.
    const { result } = renderHook(() => useTimerSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      // Bypasses the Settings form on purpose, as a hand-edited or migrated row would.
      await result.current.updateDurations({ workMin: 0, cyclesBeforeLongBreak: 0 })
    })

    const { result: after } = renderHook(() => useTimerSettings())
    await waitFor(() => expect(after.current.loading).toBe(false))

    expect(after.current.durations.workMin).toBe(1)
    expect(after.current.durations.cyclesBeforeLongBreak).toBe(1)
  })

  it('changes only the field it was given', async () => {
    const { result } = renderHook(() => useTimerSettings())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateDurations({ breakMin: 7 })
    })

    expect(result.current.durations).toMatchObject({
      breakMin: 7,
      workMin: DEFAULT_DURATIONS.workMin,
      longBreakMin: DEFAULT_DURATIONS.longBreakMin,
    })
  })
})
