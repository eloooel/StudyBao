import { useCallback, useState } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ToastProvider } from '@/components/ui/toast'
import { getSettings } from '@/db/repositories/settings'
import { useDatabaseValue } from '@/lib/use-database-value'
import { fireEvent, render, screen, waitFor } from '@/test/render'

import { SettingsView } from '../components/settings-view'
import SettingsPage from './settings.page'

/**
 * The number fields on the Settings screen.
 *
 * ## The regression these exist for, in her words
 *
 * > "the focus timer setting is buggy, it does not allow me to remove the type in 4, it does not
 * > remove the first number in the text, what if i want my short break to be only 3 mins?"
 *
 * The old field was controlled to the stored number and committed on every keystroke through a range
 * guard. Clearing it made the value `''` → `Number('')` → `0` → rejected, so the stored number never
 * changed and React wrote it straight back: **the box could not be emptied and the last digit
 * reappeared as soon as she deleted it.** The acceptance criterion is therefore literally her
 * sentence, and the first test below is that sentence end to end.
 *
 * ## Two levels, on purpose
 *
 * The first block renders `SettingsPage` against the real database, because "she can set Short break
 * to 3" spans Layer 1, Layer 2 and Dexie: the commit has to reach the row and come back through
 * `sanitizeDurations` without the field losing her edit. The second block renders the Layer 3 view
 * with spies, because the interesting cases are the ones where **nothing** should be written, and a
 * spy proves that more precisely than a database read.
 */

/** A wait budget below `testTimeout`. A wait equal to the test's own can never report its failure. */
const WAIT = { timeout: 10000 } as const

const DEFAULTS = { workMin: 25, breakMin: 5, longBreakMin: 15, cyclesBeforeLongBreak: 4 }

/** The page, wrapped as the app wraps it. No router needed: it renders no links. */
function renderPage() {
  return render(
    <ToastProvider>
      <SettingsPage />
    </ToastProvider>,
    { initialPath: '/settings' },
  )
}

describe('the settings number fields, through the page', () => {
  it('lets her empty Short break and set it to 3 — the reported bug', async () => {
    const user = userEvent.setup()
    renderPage()

    const shortBreak = await screen.findByLabelText('Short break', undefined, WAIT)
    expect(shortBreak).toHaveValue(DEFAULTS.breakMin)

    // 1. She selects the 5 and deletes it. The box must go empty — this is the regression: it used
    //    to snap straight back to 5, so the first digit could never be removed.
    await user.clear(shortBreak)
    expect(shortBreak).toHaveValue(null)

    // 2. She types 3 and leaves the field.
    await user.type(shortBreak, '3')
    await user.tab()

    // 3. It is what she asked for, on screen and in the row the timer reads.
    await waitFor(() => expect(shortBreak).toHaveValue(3), WAIT)
    await waitFor(async () => expect((await getSettings()).breakMin).toBe(3), WAIT)
  })

  it('writes nothing while she is still typing', async () => {
    const user = userEvent.setup()
    renderPage()

    const focus = await screen.findByLabelText('Focus', undefined, WAIT)
    await user.clear(focus)
    await user.type(focus, '4')

    // Mid-edit: "4" is on its way to "45". Nothing has been committed yet, which is the whole point
    // of committing on blur — the old field would have written 4 the instant it appeared.
    expect((await getSettings()).workMin).toBeUndefined()
  })
})

describe('the number field itself', () => {
  /**
   * The view with its props wired to local state, which is what the page does.
   *
   * `onCommit` is a spy so a test can assert that **nothing** was written, and the state update
   * keeps the field's prop honest for the cases that should land.
   */
  function renderForm(overrides: { cramThresholdDays?: number } = {}) {
    const commits = {
      cramThresholdDays: [] as number[],
      workMin: [] as number[],
      breakMin: [] as number[],
      longBreakMin: [] as number[],
      cyclesBeforeLongBreak: [] as number[],
    }

    function Harness() {
      const [cram, setCram] = useState(overrides.cramThresholdDays ?? 30)
      const [durations, setDurations] = useState(DEFAULTS)

      return (
        <SettingsView
          theme="light"
          onToggleTheme={() => {}}
          examDateInput="2027-02-26"
          onExamDateChange={() => {}}
          cramThresholdDays={cram}
          onCramThresholdChange={(days) => {
            commits.cramThresholdDays.push(days)
            setCram(days)
          }}
          timerDurations={durations}
          onTimerDurationsChange={(patch) => {
            for (const [key, value] of Object.entries(patch)) {
              commits[key as keyof typeof commits].push(value as number)
            }
            setDurations((previous) => ({ ...previous, ...patch }))
          }}
          homeScreenState="desktop"
          homeScreenHelpOpen={false}
          onOpenHomeScreenHelp={() => {}}
          onCloseHomeScreenHelp={() => {}}
          backup={{
            fileInputRef: { current: null },
            onOpenFilePicker: () => {},
            onFileChosen: () => {},
            onExport: () => {},
            onSaveBeforeImport: () => {},
            onConfirmImport: () => {},
            onCancelImport: () => {},
            pending: null,
            busy: false,
            savedFirst: false,
          }}
        />
      )
    }

    return { ...render(<Harness />), commits }
  }

  it('commits a typed value on Enter as well as on blur', async () => {
    const user = userEvent.setup()
    const { commits } = renderForm()

    const shortBreak = screen.getByLabelText('Short break')
    await user.clear(shortBreak)
    await user.type(shortBreak, '3{Enter}')

    expect(commits.breakMin).toEqual([3])
    expect(screen.getByLabelText('Short break')).toHaveValue(3)
  })

  it('does not clamp or commit an out-of-range value, and says what the range is', async () => {
    const user = userEvent.setup()
    const { commits } = renderForm()

    const focus = screen.getByLabelText('Focus')
    await user.clear(focus)
    await user.type(focus, '200')

    // Mid-typing: her text is untouched. The old field reverted it under her.
    expect(focus).toHaveValue(200)
    expect(commits.workMin).toEqual([])

    await user.tab()

    // On blur it still is not silently changed, nothing was written, and it now says why.
    expect(screen.getByLabelText('Focus')).toHaveValue(200)
    expect(commits.workMin).toEqual([])
    expect(screen.getByRole('alert')).toHaveTextContent('Give it a whole number between 1 and 180.')

    // The validation message sits beside the label, not inside it, so her field keeps the name it
    // had before the error appeared. Inside the label, the accessible name becomes
    // "FocusGive it a whole number between 1 and 180." — see the comment in NumberField.
    expect(screen.getByLabelText('Focus')).toBeInTheDocument()
  })

  it('treats input the browser cannot hold as a number as empty, and writes nothing', async () => {
    const user = userEvent.setup()
    const { commits } = renderForm()

    const focus = screen.getByLabelText('Focus')
    await user.clear(focus)
    // A `type="number"` input cannot hold `-` in jsdom — the DOM coerces it to `''` — so this is
    // the reachable half of the non-numeric case. The guard for genuinely unparseable text is the
    // same branch, and cannot be reached through a real number input at all; that is why it is
    // covered by the parse rather than by a keystroke.
    fireEvent.change(focus, { target: { value: '-' } })
    await user.tab()

    expect(commits.workMin).toEqual([])
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Give it a (whole )?number between 1 and 180\./,
    )
    expect(screen.getByLabelText('Focus')).toHaveValue(25)
  })

  it('keeps the stored value when she leaves the field empty, and says where the range is', async () => {
    const user = userEvent.setup()
    const { commits } = renderForm()

    const shortBreak = screen.getByLabelText('Short break')
    await user.clear(shortBreak)
    await user.tab()

    // Empty is a state she chose, not a mistake: nothing is written and nothing is invented.
    expect(commits.breakMin).toEqual([])
    expect(screen.getByLabelText('Short break')).toHaveValue(DEFAULTS.breakMin)
    expect(screen.getByText('Give it a number between 1 and 180.')).toBeInTheDocument()
  })

  it('accepts the boundary values and refuses one past each end', async () => {
    const user = userEvent.setup()
    const { commits } = renderForm()

    const longBreak = screen.getByLabelText('Long break')

    await user.clear(longBreak)
    await user.type(longBreak, '180{Enter}')
    expect(commits.longBreakMin).toEqual([180])

    await user.clear(longBreak)
    await user.type(longBreak, '181{Enter}')
    expect(commits.longBreakMin).toEqual([180])

    await user.clear(longBreak)
    await user.type(longBreak, '1{Enter}')
    expect(commits.longBreakMin).toEqual([180, 1])

    await user.clear(longBreak)
    await user.type(longBreak, '0{Enter}')
    expect(commits.longBreakMin).toEqual([180, 1])
  })

  it('gives the cycle count its own bounds, not the minutes range', async () => {
    const user = userEvent.setup()
    const { commits } = renderForm()

    const cycles = screen.getByLabelText('Blocks to a long break')

    // The defect this replaces: the component hardcoded min=1/max=180 for all four fields, so this
    // one accepted 180. The read path has always clamped it to 12.
    expect(cycles).toHaveAttribute('min', '1')
    expect(cycles).toHaveAttribute('max', '12')

    await user.clear(cycles)
    await user.type(cycles, '13{Enter}')

    // 13 is a legal Focus value, which is what makes this assertion meaningful.
    expect(commits.cyclesBeforeLongBreak).toEqual([])
    expect(screen.getByRole('alert')).toHaveTextContent('Give it a whole number between 1 and 12.')

    await user.clear(cycles)
    await user.type(cycles, '12{Enter}')
    expect(commits.cyclesBeforeLongBreak).toEqual([12])
  })

  it('adopts a value changed from outside, so the reset button still moves the fields', async () => {
    const user = userEvent.setup()
    renderPage()

    const focus = await screen.findByLabelText('Focus', undefined, WAIT)
    expect(focus).toHaveValue(DEFAULTS.workMin)

    await user.click(await screen.findByRole('button', { name: /Back to 25/ }, WAIT))

    // The reset writes through the row and the field adopts it, which is the path the prop sync in
    // `NumberField` exists for.
    await waitFor(() => expect(screen.getByLabelText('Focus')).toHaveValue(25), WAIT)
  })

  it('treats the cram threshold as a first-class number field', async () => {
    const user = userEvent.setup()
    const { commits } = renderForm()

    const cram = screen.getByLabelText('Start cram mode this many days before')

    // The same defect lived here inline, behind the same false comment: it committed on every
    // keystroke, so this box could not be emptied either.
    await user.clear(cram)
    expect(cram).toHaveValue(null)

    await user.type(cram, '3{Enter}')
    expect(commits.cramThresholdDays).toEqual([3])
    expect(screen.getByLabelText('Start cram mode this many days before')).toHaveValue(3)
  })
})

/** Kept in step with the cheap witness pattern the settings page test uses for the shared signal. */
function CardWitness() {
  const load = useCallback(async () => (await getSettings()).cramThresholdDays, [])
  const { value } = useDatabaseValue(load, -1)
  return <span data-testid="witness">{value}</span>
}

describe('the cram threshold reaches the database', () => {
  it('writes the new threshold through the real hook', async () => {
    const user = userEvent.setup()
    renderPage()

    const cram = await screen.findByLabelText(
      'Start cram mode this many days before',
      undefined,
      WAIT,
    )
    await user.clear(cram)
    await user.type(cram, '45{Enter}')

    await waitFor(async () => expect((await getSettings()).cramThresholdDays).toBe(45), WAIT)
  })

  it('tells the other screens to re-read', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <SettingsPage />
        <CardWitness />
      </ToastProvider>,
      { initialPath: '/settings' },
    )

    await waitFor(() => expect(screen.getByTestId('witness')).toHaveTextContent('30'), WAIT)

    const cram = await screen.findByLabelText(
      'Start cram mode this many days before',
      undefined,
      WAIT,
    )
    await user.clear(cram)
    await user.type(cram, '45{Enter}')

    await waitFor(() => expect(screen.getByTestId('witness')).toHaveTextContent('45'), WAIT)
  })
})
