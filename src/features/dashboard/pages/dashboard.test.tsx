import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Route, Routes } from 'react-router-dom'

import { countDecks } from '@/db/repositories/decks'
import { render, screen } from '@/test/render'
import DashboardPage from './dashboard.page'

/**
 * The first screen she sees, against the real database.
 *
 * Two things are pinned here, and the first is a **regression guard** rather than a feature test.
 *
 * 1. The deck count is real. The page used to pass a literal `deckCount={0}`, which meant
 *    `DashboardView` took the `hasDecks === false` branch on every launch — telling her to get her
 *    notes into cards while five seeded decks were one tap away. Against the real database that is
 *    five decks, so `expect(await countDecks()).toBe(5)` below is what makes the assertion meaningful:
 *    if someone puts the zero back, this file goes red instead of quietly rendering the wrong branch.
 * 2. The "Coming together" card is gone. Its copy said decks, reviews, the timer and the tracker
 *    "arrive next" — all four had already shipped, so on first open it told her the app's contents did
 *    not exist while she held them one tap away. That read as broken, not unfinished.
 *
 * The prompt is asserted absent, not mocked away: `HomeScreenPrompt` reads the environment through
 * `useHomeScreenSetup`, jsdom is not an iPad, so the real shell renders without it. That keeps this
 * file testing the dashboard rather than the prompt.
 */
const WAIT = { timeout: 5000 } as const

function renderDashboard() {
  return render(<DashboardPage />, { initialPath: '/' })
}

/**
 * The dashboard with a stub `/cards` route beside it, so the click can be asserted **without**
 * importing the real one.
 *
 * `AppRoutes` lazy-loads every page, so mounting `/cards` imports the flashcards chunk and opens
 * IndexedDB a second time. Measured: 841ms alone, but over 5s under full-suite `--coverage`
 * contention. That is a slow test rather than a slow route, so the fix is to stop paying for a chunk
 * this assertion does not examine. What is under test here is whether the button drives the router;
 * `router.test.tsx` covers the real routes mounting.
 */
function renderWithStubDeckRoute() {
  return render(
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/cards" element={<h1>Cards stub</h1>} />
    </Routes>,
    { initialPath: '/' },
  )
}

describe('the Today screen is not a dead end', () => {
  it('leads to the decks instead of stopping at a message', async () => {
    renderDashboard()

    // The action is what makes the empty state a next step rather than a full stop.
    expect(
      await screen.findByRole('button', { name: /see your 5 decks/i }, WAIT),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add from your notes/i })).toBeInTheDocument()
  })

  it('takes the seeded branch, because five decks really are seeded', async () => {
    renderDashboard()

    // The other branch would say "Let's get your notes into cards first" — which is the bug in prose.
    await screen.findByRole('heading', { name: 'Today', level: 1 }, WAIT)
    await screen.findByText('Ready when you are', {}, WAIT)

    expect(screen.queryByText(/get your notes into cards first/i)).not.toBeInTheDocument()
    expect(await countDecks()).toBe(5)
  })

  it('no longer claims the decks, reviews, timer and tracker have yet to arrive', async () => {
    renderDashboard()

    await screen.findByRole('heading', { name: 'Today', level: 1 }, WAIT)

    expect(screen.queryByText(/Coming together/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/arrive next/i)).not.toBeInTheDocument()
  })

  it('keeps the honest parts of the placeholder it replaced', async () => {
    renderDashboard()

    // Gated on the action, which only renders once `countDecks()` has resolved — the "Today" heading
    // is static markup and appears before the deck count does, so waiting on it would race.
    await screen.findByRole('button', { name: /see your 5 decks/i }, WAIT)

    // Still refuses to invent a streak or a percentage, which is the part that was always right.
    expect(screen.getByText(/Streaks start counting from your first review/i)).toBeInTheDocument()
    expect(screen.getByText('Not enough history yet')).toBeInTheDocument()
    expect(screen.getByText(/Your review queue will show up here/i)).toBeInTheDocument()
  })
})

describe('the deck count is read, not assumed', () => {
  it('renders the number of decks that actually exist', async () => {
    renderDashboard()

    // One deck, one label. This is the assertion the hardcoded zero cannot satisfy.
    expect(
      await screen.findByRole('button', { name: /see your 5 decks/i }, WAIT),
    ).toBeInTheDocument()
  })
})

describe('the shell around it', () => {
  /**
   * This one case carries its own timeout, and it is the only assertion in this file that needs one.
   *
   * The runner's default is 5s and `vitest.config.ts` raises it for nobody. Under full-suite
   * `--coverage` contention — with the parallel export/import work adding IndexedDB traffic to every
   * file — a read plus a click measured over 5s, so the runner killed the test *before* the `WAIT`
   * above could apply. A per-test budget is the narrowest fix available: it does not loosen the wait
   * for the five assertions that are fast, and it does not change global config for one test.
   *
   * If this number needs raising again, read it as a finding about suite speed rather than as tuning —
   * the same note `src/router.test.tsx` carries.
   */
  it('navigates from the Today screen into the decks', { timeout: 15000 }, async () => {
    const user = userEvent.setup()

    renderWithStubDeckRoute()

    await user.click(await screen.findByRole('button', { name: /see your 5 decks/i }, WAIT))

    expect(
      await screen.findByRole('heading', { name: 'Cards stub', level: 1 }, WAIT),
    ).toBeInTheDocument()
  })
})
