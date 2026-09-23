import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test/render'
import { Button } from './button'
import { ToastProvider } from './toast'
import { useToast } from './use-toast'

function ToastTrigger({
  message = 'Still there? Your notes miss you',
  tone,
  sticky,
}: {
  message?: string
  tone?: 'info' | 'success' | 'attention'
  sticky?: boolean
}) {
  const toast = useToast()

  return <Button onClick={() => toast.show(message, { tone, sticky })}>Notify</Button>
}

function renderWithToasts(ui: React.ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

describe('useToast', () => {
  it('throws a helpful error when used outside the provider', () => {
    // A silent no-op here would look like a broken nudge later on; failing loudly
    // is the difference between a five-minute fix and an afternoon.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<ToastTrigger />)).toThrow(/ToastProvider/)

    spy.mockRestore()
  })

  it('shows a message when called', async () => {
    const user = userEvent.setup()
    renderWithToasts(<ToastTrigger />)

    await user.click(screen.getByRole('button', { name: 'Notify' }))

    expect(screen.getByText('Still there? Your notes miss you')).toBeInTheDocument()
  })

  it('announces informational toasts politely rather than interrupting', async () => {
    const user = userEvent.setup()
    renderWithToasts(<ToastTrigger />)

    await user.click(screen.getByRole('button', { name: 'Notify' }))

    expect(screen.getByRole('status')).toHaveTextContent('Still there?')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uses role=alert for the attention tone, which she must act on', async () => {
    const user = userEvent.setup()
    renderWithToasts(<ToastTrigger tone="attention" />)

    await user.click(screen.getByRole('button', { name: 'Notify' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Still there?')
  })

  it('dismisses on request', async () => {
    const user = userEvent.setup()
    renderWithToasts(<ToastTrigger sticky />)

    await user.click(screen.getByRole('button', { name: 'Notify' }))
    expect(screen.getByText('Still there? Your notes miss you')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText('Still there? Your notes miss you')).not.toBeInTheDocument()
  })

  it('auto-dismisses after a while so it never becomes permanent clutter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithToasts(<ToastTrigger />)

    await user.click(screen.getByRole('button', { name: 'Notify' }))
    expect(screen.getByText('Still there? Your notes miss you')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(7000)
    })

    expect(screen.queryByText('Still there? Your notes miss you')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('keeps a sticky toast until it is dismissed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithToasts(<ToastTrigger sticky />)

    await user.click(screen.getByRole('button', { name: 'Notify' }))

    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })

    expect(screen.getByText('Still there? Your notes miss you')).toBeInTheDocument()
    vi.useRealTimers()
  })
})
