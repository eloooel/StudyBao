import { describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen } from '@/test/render'

import { UpdatePrompt } from './update-prompt'

const noop = () => {
  /* a handler that is not the subject of the test */
}

describe('UpdatePrompt', () => {
  it('shows nothing when the running version is the newest one', () => {
    const { container } = render(
      <UpdatePrompt needRefresh={false} onUpdate={noop} onDismiss={noop} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('announces the new version politely, not as an alert', () => {
    render(<UpdatePrompt needRefresh onUpdate={noop} onDismiss={noop} />)

    expect(screen.getByRole('status')).toHaveTextContent(/a new version is ready/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('takes the update when she asks for it', () => {
    const onUpdate = vi.fn()
    render(<UpdatePrompt needRefresh onUpdate={onUpdate} onDismiss={noop} />)

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('lets her put it off, and reports that instead', () => {
    const onDismiss = vi.fn()
    render(<UpdatePrompt needRefresh onUpdate={noop} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('never takes the update on its own', () => {
    // The entire reason this is a prompt rather than an automatic reload: an unsolicited reload can
    // land mid-card in a review session. Her data would survive it; her place would not.
    const onUpdate = vi.fn()
    render(<UpdatePrompt needRefresh onUpdate={onUpdate} onDismiss={noop} />)

    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('names both buttons, so voice control can reach them', () => {
    render(<UpdatePrompt needRefresh onUpdate={noop} onDismiss={noop} />)

    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument()
  })
})
