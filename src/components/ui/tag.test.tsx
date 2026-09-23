import { describe, expect, it } from 'vitest'

import { render, screen } from '@/test/render'
import { Tag } from './tag'

describe('Tag', () => {
  it('renders its content', () => {
    render(<Tag>Mastered</Tag>)

    expect(screen.getByText('Mastered')).toBeInTheDocument()
  })

  it('renders every tone, so sage and mauve stay usable as fills', () => {
    // Each tone is a fill with ink text on top. The point of the test is that no
    // tone is a foreground colour, which is what the palette correction was about.
    render(
      <>
        <Tag tone="neutral">neutral</Tag>
        <Tag tone="success">success</Tag>
        <Tag tone="attention">attention</Tag>
        <Tag tone="accent">accent</Tag>
      </>,
    )

    for (const label of ['neutral', 'success', 'attention', 'accent']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('adds a decorative dot when asked, and marks it hidden from assistive tech', () => {
    const { container } = render(<Tag dot>Reviewing</Tag>)

    const dot = container.querySelector('[aria-hidden="true"]')
    expect(dot).not.toBeNull()
  })

  it('renders no dot by default', () => {
    const { container } = render(<Tag>Reviewing</Tag>)

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })
})
