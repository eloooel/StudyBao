import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AppRoutes } from '@/router'
import { render, screen, within } from '@/test/render'
import { ToastProvider } from '@/components/ui/toast'

/**
 * How long to wait for a lazy route to resolve.
 *
 * `findByRole` defaults to 1s, which turned out to be too tight. Every route here is
 * `React.lazy`, so resolving one imports a chunk *and* mounts a page whose hooks open IndexedDB —
 * and under `--coverage`, where instrumentation slows the suite and the worker threads contend,
 * the index route was measured at **1404ms**. It failed once in three full runs and passed in the
 * others, which is the signature of a real timeout rather than a real break.
 *
 * This is deliberately a per-suite budget on the *wait*, not a global `testTimeout` bump: it makes
 * the assertion honest about what it is waiting for instead of loosening every test in the repo.
 *
 * **If this ever needs raising again, treat it as a finding, not as tuning** — a lazy route that
 * takes seconds to appear is a slow first paint on a phone, and the fix belongs in the route, not
 * here. `docs/WORKFLOW-B-REMAINING.md` records the same class of problem: lazy-route tests under
 * contention.
 */
const ROUTE_READY_MS = 4000

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

    expect(
      await screen.findByRole('heading', { name: 'Today', level: 1 }, { timeout: ROUTE_READY_MS }),
    ).toBeInTheDocument()
  })

  it.each([
    ['/cards', 'Cards'],
    ['/timer', 'Focus'],
    ['/lessons', 'Lessons'],
    ['/settings', 'Settings'],
  ])('renders %s with the heading %s', async (path, heading) => {
    renderAt(path)

    expect(
      await screen.findByRole('heading', { name: heading, level: 1 }, { timeout: ROUTE_READY_MS }),
    ).toBeInTheDocument()
  })

  it('always renders the five-item navigation', async () => {
    renderAt('/')

    const nav = await screen.findByRole('navigation', { name: 'Main' }, { timeout: ROUTE_READY_MS })

    for (const label of ['Today', 'Cards', 'Timer', 'Lessons', 'Settings']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('navigates between sections from the bottom bar', async () => {
    const user = userEvent.setup()
    renderAt('/')

    await user.click(
      await screen.findByRole('link', { name: 'Timer' }, { timeout: ROUTE_READY_MS }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Focus', level: 1 }, { timeout: ROUTE_READY_MS }),
    ).toBeInTheDocument()
  })

  it('marks the current section with aria-current, not colour alone', async () => {
    renderAt('/cards')

    await screen.findByRole('heading', { name: 'Cards', level: 1 }, { timeout: ROUTE_READY_MS })

    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Timer' })).not.toHaveAttribute('aria-current')
  })

  it('offers a real empty state on an unknown path instead of a blank page', async () => {
    renderAt('/nope')

    expect(
      await screen.findByText("That page doesn't exist", {}, { timeout: ROUTE_READY_MS }),
    ).toBeInTheDocument()
  })

  it('exposes a skip link for keyboard users', async () => {
    renderAt('/')

    expect(
      await screen.findByRole('link', { name: 'Skip to content' }, { timeout: ROUTE_READY_MS }),
    ).toHaveAttribute('href', '#main')
  })

  it('toggles the theme from the header and reflects it on <html>', async () => {
    const user = userEvent.setup()
    renderAt('/')

    const toggle = await screen.findByRole(
      'button',
      { name: /theme/i },
      { timeout: ROUTE_READY_MS },
    )
    const before = document.documentElement.dataset['theme']

    await user.click(toggle)

    expect(document.documentElement.dataset['theme']).not.toBe(before)
  })
})
