import { describe, expect, it } from 'vitest'

import { render, screen } from '@/test/render'
import { ProgressBar } from './progress-bar'

describe('ProgressBar', () => {
  it('exposes progress to assistive tech rather than only by width', () => {
    render(<ProgressBar label="Cards mastered" value={30} max={60} />)

    const bar = screen.getByRole('progressbar', { name: 'Cards mastered' })
    expect(bar).toHaveAttribute('aria-valuenow', '30')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '60')
    expect(bar).toHaveAttribute('aria-valuetext', '50%')
  })

  it('shows the percentage by default', () => {
    render(<ProgressBar label="Progress" value={1} max={4} />)

    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('can hide the numeric value', () => {
    render(<ProgressBar label="Progress" value={1} max={4} showValue={false} />)

    expect(screen.queryByText('25%')).not.toBeInTheDocument()
  })

  it('clamps values above the maximum instead of overflowing the bar', () => {
    render(<ProgressBar label="Progress" value={99} max={10} />)

    const bar = screen.getByRole('progressbar', { name: 'Progress' })
    expect(bar).toHaveAttribute('aria-valuenow', '10')
    expect(bar).toHaveAttribute('aria-valuetext', '100%')
  })

  it('clamps negative values to zero', () => {
    render(<ProgressBar label="Progress" value={-5} max={10} />)

    expect(screen.getByRole('progressbar', { name: 'Progress' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    )
  })

  it('does not divide by zero when max is zero', () => {
    // A brand-new deck has zero cards; the dashboard must still render.
    render(<ProgressBar label="Progress" value={0} max={0} />)

    const bar = screen.getByRole('progressbar', { name: 'Progress' })
    expect(bar).toHaveAttribute('aria-valuemax', '1')
    expect(bar).toHaveAttribute('aria-valuetext', '0%')
  })

  it('supports the sage tone used for mastery', () => {
    const { container } = render(<ProgressBar label="Mastered" value={5} max={10} tone="success" />)

    expect(container.querySelector('.bg-sage')).not.toBeNull()
  })
})
