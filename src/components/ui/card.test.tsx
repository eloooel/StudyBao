import { describe, expect, it } from 'vitest'

import { render, screen } from '@/test/render'
import { Card, CardContent, CardFooter, CardHeader } from './card'

describe('Card', () => {
  it('renders a composed card with title, description and action', () => {
    render(
      <Card>
        <CardHeader
          title="Study streak"
          description="A day counts once you review a card."
          action={<span>Day 0</span>}
        />
        <CardContent>Body</CardContent>
      </Card>,
    )

    expect(screen.getByRole('heading', { name: 'Study streak' })).toBeInTheDocument()
    expect(screen.getByText('A day counts once you review a card.')).toBeInTheDocument()
    expect(screen.getByText('Day 0')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('omits the description and action slots when they are not provided', () => {
    render(
      <Card>
        <CardHeader title="Focus" />
      </Card>,
    )

    expect(screen.getByRole('heading', { name: 'Focus' })).toBeInTheDocument()
  })

  it('renders a footer when given one', () => {
    render(
      <Card>
        <CardFooter>Footer</CardFooter>
      </Card>,
    )

    expect(screen.getByText('Footer')).toBeInTheDocument()
  })

  it('accepts caller className and merges it', () => {
    const { container } = render(<Card className="mt-4">x</Card>)

    expect(container.firstElementChild?.className).toContain('mt-4')
  })

  it('applies the soft shadow only when elevated', () => {
    const flat = render(<Card>x</Card>)
    // Note: assert on the specific token, not on the substring "shadow-" —
    // `shadow-none` contains it.
    expect(flat.container.firstElementChild?.className).toContain('shadow-none')

    flat.unmount()

    const raised = render(<Card elevated>x</Card>)
    expect(raised.container.firstElementChild?.className).toContain('shadow-[var(--shadow-soft)]')
  })
})
