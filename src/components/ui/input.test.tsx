import { describe, expect, it } from 'vitest'

import { render, screen } from '@/test/render'
import { Input } from './input'

describe('Input', () => {
  it('associates its label with the field', () => {
    render(<Input label="Deck name" />)

    expect(screen.getByLabelText('Deck name')).toBeInTheDocument()
  })

  it('describes the field with its hint when there is no error', () => {
    render(<Input label="Deck name" hint="Something short and recognisable" />)

    const input = screen.getByLabelText('Deck name')
    const hint = screen.getByText('Something short and recognisable')

    expect(input).toHaveAccessibleDescription('Something short and recognisable')
    expect(hint).toBeInTheDocument()
  })

  it('announces an error and replaces the hint with it', () => {
    render(<Input label="Deck name" hint="A hint" error="Give the deck a name" />)

    const input = screen.getByLabelText('Deck name')
    const alert = screen.getByRole('alert')

    expect(alert).toHaveTextContent('Give the deck a name')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    // Exactly one description, and it is the error — not both concatenated.
    expect(input).toHaveAccessibleDescription('Give the deck a name')
    expect(screen.queryByText('A hint')).not.toBeInTheDocument()
  })

  it('does not mark itself invalid when the error is an empty string', () => {
    render(<Input label="Deck name" error="" />)

    expect(screen.getByLabelText('Deck name')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('hides the label visually but keeps it for screen readers', () => {
    render(<Input label="Search" hideLabel />)

    expect(screen.getByLabelText('Search')).toBeInTheDocument()
  })

  it('passes native input attributes through', () => {
    render(<Input label="Deck name" placeholder="Cardiology" maxLength={40} />)

    const input = screen.getByLabelText('Deck name')
    expect(input).toHaveAttribute('placeholder', 'Cardiology')
    expect(input).toHaveAttribute('maxlength', '40')
  })
})
