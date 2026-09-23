import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AppRoutes } from '@/router'
import { render, screen, within } from '@/test/render'
import { ToastProvider } from '@/components/ui/toast'

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>,
    { initialPath: path },
  )
}

describe('routing shell', () => {
  it('sends the index route to the dashboard', async () => {
    renderAt('/')

    expect(await screen.findByRole('heading', { name: 'Today', level: 1 })).toBeInTheDocument()
  })

  it.each([
    ['/cards', 'Cards'],
    ['/timer', 'Focus'],
    ['/lessons', 'Lessons'],
    ['/settings', 'Settings'],
  ])('renders %s with the heading %s', async (path, heading) => {
    renderAt(path)

    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
  })

  it('always renders the five-item navigation', async () => {
    renderAt('/')

    const nav = await screen.findByRole('navigation', { name: 'Main' })

    for (const label of ['Today', 'Cards', 'Timer', 'Lessons', 'Settings']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('navigates between sections from the bottom bar', async () => {
    const user = userEvent.setup()
    renderAt('/')

    await user.click(await screen.findByRole('link', { name: 'Timer' }))

    expect(await screen.findByRole('heading', { name: 'Focus', level: 1 })).toBeInTheDocument()
  })

  it('marks the current section with aria-current, not colour alone', async () => {
    renderAt('/cards')

    await screen.findByRole('heading', { name: 'Cards', level: 1 })

    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Timer' })).not.toHaveAttribute('aria-current')
  })

  it('offers a real empty state on an unknown path instead of a blank page', async () => {
    renderAt('/nope')

    expect(await screen.findByText("That page doesn't exist")).toBeInTheDocument()
  })

  it('exposes a skip link for keyboard users', async () => {
    renderAt('/')

    expect(await screen.findByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main',
    )
  })

  it('toggles the theme from the header and reflects it on <html>', async () => {
    const user = userEvent.setup()
    renderAt('/')

    const toggle = await screen.findByRole('button', { name: /theme/i })
    const before = document.documentElement.dataset['theme']

    await user.click(toggle)

    expect(document.documentElement.dataset['theme']).not.toBe(before)
  })
})
