import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test/render'
import { formatRemaining } from '../lib/format'
import { TimerView } from './timer-view'

/**
 * The timer screen.
 *
 * Deliberately thin: the arithmetic is tested in `lib/timer.test.ts`, so what is left here is the
 * few things only rendering can get wrong — the rounding that decides whether a running block can
 * display `00:00`, whether the Start button exists when it should, and the voice of the copy.
 */
function renderView(overrides: Partial<Parameters<typeof TimerView>[0]> = {}) {
  const props = {
    phase: 'idle' as const,
    remainingMs: 25 * 60_000,
    progress: 0,
    cyclesUntilLongBreak: 4,
    running: false,
    awaitingNext: false,
    focusBlocksToday: 0,
    onStart: vi.fn(),
    onSkip: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  }

  return { ...render(<TimerView {...props} />), props }
}

describe('formatRemaining', () => {
  it('renders minutes and seconds with leading zeroes', () => {
    expect(formatRemaining(25 * 60_000)).toBe('25:00')
    expect(formatRemaining(9 * 60_000 + 5_000)).toBe('09:05')
  })

  it('rounds up, so a running block never shows 00:00', () => {
    // The bug this prevents: with floor rounding, the last second of every block displays `00:00`
    // while the block is still running, which reads as broken.
    expect(formatRemaining(1_000)).toBe('00:01')
    expect(formatRemaining(999)).toBe('00:01')
    expect(formatRemaining(1)).toBe('00:01')
  })

  it('shows zero only when there really is nothing left', () => {
    expect(formatRemaining(0)).toBe('00:00')
  })

  it('floors a negative remainder rather than rendering a minus sign', () => {
    // `snapshot` already clamps, but a negative reaching the formatter must not print "-01:-30".
    expect(formatRemaining(-90_000)).toBe('00:00')
  })
})

describe('TimerView', () => {
  it('offers Start when idle and no Skip', () => {
    renderView()

    expect(screen.getByRole('button', { name: 'Start focusing' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Skip/ })).toBeNull()
  })

  it('offers Skip and Stop while running, and no Start', () => {
    renderView({ phase: 'working', running: true })

    expect(screen.getByRole('button', { name: /^Skip/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start focusing' })).toBeNull()
  })

  it('says which phase she is in, since that is the news a screen reader should hear', () => {
    renderView({ phase: 'longBreak', running: true })

    expect(screen.getByText(/Long break\./)).toBeInTheDocument()
  })

  it('turns the button into Next once the phase has run out', () => {
    renderView({ phase: 'break', running: true, awaitingNext: true })

    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })

  it('calls the handler she pressed', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const { props } = renderView()

    await user.click(screen.getByRole('button', { name: 'Start focusing' }))

    expect(props.onStart).toHaveBeenCalledOnce()
  })

  it('mentions the focus count only once there is one', () => {
    // Voice rules: warm, never a score, and never shown as a zero.
    const { unmount } = renderView({ focusBlocksToday: 0 })
    expect(screen.queryByText(/focus breaks?/)).toBeNull()
    unmount()

    renderView({ focusBlocksToday: 1 })
    expect(screen.getByText(/One focus break today/)).toBeInTheDocument()
  })

  it('counts the blocks to a long break while working', () => {
    renderView({ phase: 'working', running: true, cyclesUntilLongBreak: 1 })

    expect(screen.getByText(/1 more block until a long break/)).toBeInTheDocument()
  })

  it('always warns that the tab has to stay open', () => {
    // Not decoration: with in-app notifications only (ADR 0006) a closed tab means the cue never
    // arrives, and this is the only place she can be told before it happens.
    renderView()

    expect(screen.getByText('Keep this tab open')).toBeInTheDocument()
  })
})
