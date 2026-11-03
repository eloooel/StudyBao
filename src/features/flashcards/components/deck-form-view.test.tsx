import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test/render'

import { DeckFormView } from './deck-form-view'

/**
 * The "new deck" form, as Layer 3 — rendered from props, no database and no routing.
 *
 * The case worth having is the first one: a deck with no name is a deck she cannot find again, and
 * the form has to refuse it *and say so*, rather than closing and silently doing nothing.
 */
const noop = () => {
  /* a handler that is not the subject of the test */
}

describe('DeckFormView', () => {
  it('asks for a name instead of making an unnamed deck', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<DeckFormView open onClose={noop} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Make the deck' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)
  })

  it('submits the name, the part and the scope, trimmed', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<DeckFormView open onClose={noop} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Deck name'), '  Fluid and electrolytes  ')
    await user.selectOptions(screen.getByLabelText('Which part is it for?'), 'practice-iii')
    // Matched as a regex so the typographic apostrophe is not part of the assertion.
    await user.type(screen.getByLabelText(/What.s in it/), '  Sodium  ')
    await user.click(screen.getByRole('button', { name: 'Make the deck' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Fluid and electrolytes',
      subject: 'practice-iii',
      scope: 'Sodium',
    })
  })

  it('offers every part, and defaults to the first one', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<DeckFormView open onClose={noop} onSubmit={onSubmit} />)

    const select = screen.getByLabelText('Which part is it for?')
    expect(select.querySelectorAll('option')).toHaveLength(5)

    await user.type(screen.getByLabelText('Deck name'), 'Anything')
    await user.click(screen.getByRole('button', { name: 'Make the deck' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ subject: 'practice-i' }))
  })

  it('is empty every time it opens, so a cancelled draft does not come back', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<DeckFormView open onClose={noop} onSubmit={noop} />)

    await user.type(screen.getByLabelText('Deck name'), 'Half typed')
    expect(screen.getByLabelText('Deck name')).toHaveValue('Half typed')

    rerender(<DeckFormView open={false} onClose={noop} onSubmit={noop} />)
    rerender(<DeckFormView open onClose={noop} onSubmit={noop} />)

    expect(screen.getByLabelText('Deck name')).toHaveValue('')
  })
})
