import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen, waitFor } from '@/test/render'
import { Button } from './button'
import { Modal } from './modal'

describe('Modal', () => {
  it('is not visible when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Add a card">
        Body
      </Modal>,
    )

    // A closed <dialog> is not rendered to the accessibility tree.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows its title and content when open', () => {
    render(
      <Modal open onClose={() => {}} title="Add a card" description="Front and back">
        Body
      </Modal>,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add a card' })).toBeInTheDocument()
    expect(screen.getByText('Front and back')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('labels the dialog with its title so it is announced on open', () => {
    render(
      <Modal open onClose={() => {}} title="Add a card">
        Body
      </Modal>,
    )

    expect(screen.getByRole('dialog', { name: 'Add a card' })).toBeInTheDocument()
  })

  it('calls onClose when the close button is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <Modal open onClose={onClose} title="Add a card">
        Body
      </Modal>,
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()

    render(
      <Modal open onClose={onClose} title="Add a card">
        Body
      </Modal>,
    )

    // The browser fires `cancel` on Escape; jsdom does not, so it is dispatched
    // directly. This tests our handler, which is the part we own.
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('renders footer actions', () => {
    render(
      <Modal open onClose={() => {}} title="Delete this card?" footer={<Button>Delete</Button>}>
        This cannot be undone.
      </Modal>,
    )

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn()

    render(
      <Modal open onClose={onClose} title="Add a card">
        Body
      </Modal>,
    )

    // A click on the backdrop is dispatched to the dialog element itself, which is
    // how outside-click is detected without a separate backdrop node.
    fireEvent.mouseDown(screen.getByRole('dialog'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when the panel content is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <Modal open onClose={onClose} title="Add a card">
        Body
      </Modal>,
    )

    await user.click(screen.getByText('Body'))

    expect(onClose).not.toHaveBeenCalled()
  })
})
