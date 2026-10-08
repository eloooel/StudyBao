import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getSettings } from '@/db/repositories/settings'
import { ToastProvider } from '@/components/ui/toast'
import { render, screen, waitFor, within } from '@/test/render'
import SettingsPage from '@/features/settings/pages/settings.page'
import {
  HomeScreenExplanation,
  HomeScreenAddedNotice,
  HomeScreenNotNeededNotice,
} from '../components/home-screen-explanation'
import { HomeScreenPrompt } from '../components/home-screen-prompt'
import { useHomeScreenSetup } from '../hooks/use-home-screen-setup'

/**
 * The second AI-visible surface in this feature, and the one place the prompt's own copy is checked.
 *
 * ## What is asserted here, and why each part earns its place
 *
 * - **The word.** CLAUDE.md's UX rule is flat: never that word on a screen. It is asserted against
 *   `textContent` of what actually rendered, because a rule checked by reading source is a rule that
 *   survives exactly until someone edits a `title` attribute. Both a positive requirement (the rule as
 *   written) and the same string with "ing" appended are checked, since the first version of this
 *   component satisfied the letter of the rule and still contained it.
 * - **The four device cases**, through the *hook* this time rather than the pure function — the pure
 *   cases are in `home-screen.test.ts`, and the reason both exist is that the pure function can be
 *   right while the wiring that feeds it is wrong (a stubbed `navigator` read in the wrong place, a
 *   `standalone` check that never runs). jsdom is used as a device simulator, which is all it can be.
 * - **The three Settings states**, because the card is permanent and not dismissible: the one thing it
 *   must never do is repeat the instructions to someone who has already followed them.
 */

/** Everything the four device cases need, stubbed. jsdom reports no platform and no touch points. */
function stubDevice({
  platform,
  maxTouchPoints,
  homeScreen,
}: {
  platform: string
  maxTouchPoints: number
  homeScreen: boolean
}): void {
  Object.defineProperty(navigator, 'platform', { configurable: true, value: platform })
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints })
  // iOS-specific and not in TypeScript's Navigator; absent everywhere else.
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: homeScreen })
  window.matchMedia = vi.fn(() =>
    makeMediaQueryList(homeScreen),
  ) as unknown as typeof window.matchMedia
}

function makeMediaQueryList(matches: boolean) {
  return {
    matches,
    media: '(display-mode: standalone)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
}

const IPAD_IN_SAFARI = { platform: 'MacIntel', maxTouchPoints: 5, homeScreen: false }
const IPAD_HOME_SCREEN = { platform: 'MacIntel', maxTouchPoints: 5, homeScreen: true }
const IPHONE = { platform: 'iPhone', maxTouchPoints: 5, homeScreen: false }
const WINDOWS = { platform: 'Win32', maxTouchPoints: 0, homeScreen: false }

/** Renders the prompt through the real hook, so the wiring is under test and not just the view. */
function PromptHarness() {
  const { promptOpen, markSeen } = useHomeScreenSetup()
  return <HomeScreenPrompt open={promptOpen} onDismiss={markSeen} />
}

/**
 * Whether the prompt is *actually* on screen.
 *
 * Not `queryByText`: a closed `<dialog>` keeps its children in the DOM, and jsdom applies no UA
 * stylesheet, so a text query finds the copy through a closed modal and every negative case below
 * would fail for a reason that has nothing to do with the decision. `Modal` toggles the `open`
 * attribute, and a role query with `hidden: false` is the assertion that respects it.
 */
function promptIsShowing(): boolean {
  return screen.queryByRole('dialog') !== null
}

/**
 * How long to wait for anything that depends on an IndexedDB round trip.
 *
 * The framework default is 1s, which is enough when this file runs alone and was **measured** as not
 * enough under `--coverage`, where instrumentation slows the suite and the workers contend. The same
 * call `src/router.test.tsx` makes, and for the same reason: this is a per-suite budget on the wait,
 * not a global `testTimeout`, so each assertion stays honest about what it is waiting for.
 */
const WAIT = { timeout: 5000 } as const

afterEach(() => {
  // `restoreMocks` puts the vi.fn back, but these are plain definitions and would leak into the next
  // file the way the theme tests' `matchMedia` note describes.
  Reflect.deleteProperty(navigator, 'standalone')
})

describe('the prompt appears in the right places', () => {
  it('appears on iPadOS in a Safari tab', async () => {
    stubDevice(IPAD_IN_SAFARI)
    render(<PromptHarness />)

    expect(await screen.findByRole('dialog', {}, WAIT)).toBeInTheDocument()
    expect(screen.getByText(/Two taps, and it stops your notes from being cleared/i)).toBeVisible()
  })

  it('stays away inside the Home Screen app', async () => {
    stubDevice(IPAD_HOME_SCREEN)
    render(<PromptHarness />)

    // Give the settings read time to land before concluding it is absent: `useDatabaseValue` renders
    // nothing prompt-shaped until it resolves, so an immediate assertion would pass for the wrong
    // reason and keep passing if the wiring broke.
    await waitFor(async () => expect((await getSettings()).id).toBe('app'), WAIT)
    expect(promptIsShowing()).toBe(false)
  })

  it('stays away on an iPhone', async () => {
    stubDevice(IPHONE)
    render(<PromptHarness />)

    await waitFor(async () => expect((await getSettings()).id).toBe('app'), WAIT)
    expect(promptIsShowing()).toBe(false)
  })

  it('stays away on the Windows laptop', async () => {
    stubDevice(WINDOWS)
    render(<PromptHarness />)

    await waitFor(async () => expect((await getSettings()).id).toBe('app'), WAIT)
    expect(promptIsShowing()).toBe(false)
  })
})

describe('showing it once', () => {
  it('does not come back after a skip', async () => {
    stubDevice(IPAD_IN_SAFARI)
    const user = userEvent.setup()
    render(<PromptHarness />)

    // The skip is visible and named, never a disguised exit.
    const skip = await screen.findByRole('button', { name: /skip for now/i }, WAIT)
    await user.click(skip)

    await waitFor(async () => {
      expect(typeof (await getSettings()).installPromptSeenAt).toBe('number')
    }, WAIT)
  })

  it('stamps the same field when she accepts, so there is no second flag', async () => {
    stubDevice(IPAD_IN_SAFARI)
    const user = userEvent.setup()
    render(<PromptHarness />)

    await user.click(await screen.findByRole('button', { name: /^got it$/i }, WAIT))

    await waitFor(async () => {
      expect(typeof (await getSettings()).installPromptSeenAt).toBe('number')
    }, WAIT)
  })
})

describe('the copy rules', () => {
  it('never uses the word, or a word built from it', () => {
    render(<HomeScreenExplanation />)

    const text = document.body.textContent?.toLowerCase() ?? ''
    expect(text.length).toBeGreaterThan(0)
    expect(text).not.toContain('install')
    expect(text).not.toContain('installing')
    expect(text).not.toContain('pwa')
  })

  it('says the things the guideline requires', () => {
    render(<HomeScreenExplanation />)
    const words = within(document.body)

    expect(
      words.getByText(/Two taps, and it stops your notes from being cleared/i),
    ).toBeInTheDocument()
    // The step that names the row, which is the one instruction that has to be exact. Phrased as the
    // sentence rather than as the row's own label, because the label also appears in the diagram and
    // a loose query would match either.
    expect(words.getByText(/Scroll down and tap/i)).toBeInTheDocument()
    // The reason, in one sentence she can act on.
    expect(words.getByText(/clears a website/i)).toBeInTheDocument()
  })

  it('labels the diagram as a diagram, so iOS chrome is never passed off as a capture', () => {
    render(<HomeScreenExplanation />)

    expect(screen.getByText(/A diagram, not a screenshot/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Share menu/i })).toBeInTheDocument()
  })
})

describe('the Settings card has three states and repeats none of them', () => {
  /**
   * `SettingsPage` carries the export/import card, which raises toasts, so it needs the provider the
   * same way `settings.test.tsx` gives it one. Rendering the page here rather than the view is
   * deliberate: this is asserting that the *hook wiring* picks the right state on a real device
   * reading, which a pure-props render of `SettingsView` could not show.
   */
  function renderSettings() {
    return render(
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>,
      { initialPath: '/settings' },
    )
  }

  it('offers the how-to on iPadOS before it is added', async () => {
    stubDevice(IPAD_IN_SAFARI)
    renderSettings()

    expect(await screen.findByRole('button', { name: /how to add it/i }, WAIT)).toBeInTheDocument()
  })

  it('confirms instead of instructing once it is on the Home Screen', async () => {
    stubDevice(IPAD_HOME_SCREEN)
    renderSettings()

    expect(await screen.findByText(/Your notes are safe/i, {}, WAIT)).toBeInTheDocument()
    // ADR 0008 item 4: the icon, not the Safari tab. Reference information, so it lives here.
    expect(screen.getByText(/rather than this Safari tab/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /how to add it/i })).not.toBeInTheDocument()
  })

  it('says there is nothing to do on the laptop, rather than instructing anyway', async () => {
    stubDevice(WINDOWS)
    renderSettings()

    expect(await screen.findByText(/Nothing to do here/i, {}, WAIT)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /how to add it/i })).not.toBeInTheDocument()
  })

  it('never shows the steps to someone who has already added it', () => {
    render(<HomeScreenAddedNotice />)

    expect(screen.queryByText(/Scroll down and tap/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Tap the/i)).not.toBeInTheDocument()
  })

  it('never shows the steps on a device that does not need them', () => {
    render(<HomeScreenNotNeededNotice />)

    expect(screen.queryByText(/Scroll down and tap/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Tap the/i)).not.toBeInTheDocument()
  })
})
