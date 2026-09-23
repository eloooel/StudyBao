import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test/render'
import { Button } from './button'

describe('Button', () => {
  it('renders its label and is a real button element', () => {
    render(<Button>Start</Button>)

    const button = screen.getByRole('button', { name: 'Start' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('type', 'button')
  })

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    render(<Button onClick={onClick}>Start</Button>)
    await user.click(screen.getByRole('button', { name: 'Start' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    render(
      <Button disabled onClick={onClick}>
        New deck
      </Button>,
    )
    await user.click(screen.getByRole('button', { name: 'New deck' }))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('marks itself busy and unclickable while loading', () => {
    render(<Button loading>Saving</Button>)

    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
  })

  it('merges caller className so a caller can override the variant', () => {
    // Proves tailwind-merge is doing its job. Assert on exact tokens: a substring
    // check would pass on `bg-primary-hover`, which is a different utility.
    render(<Button className="bg-sage">Overridden</Button>)

    const tokens = screen.getByRole('button', { name: 'Overridden' }).className.split(/\s+/)

    expect(tokens).toContain('bg-sage')
    expect(tokens).not.toContain('bg-primary')
    // The rest of the variant survives: only the conflicting utility was dropped.
    expect(tokens).toContain('text-on-primary')
    expect(tokens).toContain('hover:bg-primary-hover')
  })

  it('renders every variant and size without crashing', () => {
    render(
      <>
        <Button variant="primary" size="sm">
          a
        </Button>
        <Button variant="secondary" size="md">
          b
        </Button>
        <Button variant="ghost" size="lg">
          c
        </Button>
        <Button variant="strong" fullWidth>
          d
        </Button>
      </>,
    )

    expect(screen.getAllByRole('button')).toHaveLength(4)
  })
})
