import { useCallback } from 'react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '@/components/ui/toast'
import { listAllCards } from '@/db/repositories/cards'
import { getDb } from '@/db/schema'
import type { AppSettings, Card } from '@/db/types'
import { SETTINGS_ROW_ID, buildEnvelope, serializeBackup } from '@/lib/backup-format'
import { useDatabaseValue } from '@/lib/use-database-value'
import { fireEvent, render, screen, waitFor, within } from '@/test/render'

import type * as BackupFile from '../lib/backup-file'
import SettingsPage from './settings.page'

/**
 * The settings screen with backup wired in: Layer 1, Layer 2, Layer 3 and a real database.
 *
 * ## What is asserted, and what cannot go red
 *
 * `Modal` keeps its title and footer mounted while closed, so **a text query** for a label in this
 * dialog succeeds whether or not it is open — asserting that copy proves nothing. What *is* asserted
 * instead is the effect: the counts appear only once a file has been read, and the database is
 * untouched until the confirm is pressed.
 *
 * **A role query behaves the opposite way, and that was worth measuring.** Verified here: with the
 * counts rendered but before `showModal()` runs, `getByRole('button', { name: 'Cancel' })` finds
 * **nothing** — jsdom gives `dialog:not([open])` the `display: none` a browser gives it, and RTL's
 * role queries honour that — while `findByText('In this file')` finds the node in the same state.
 * That asymmetry is a flake source in a role query issued straight after a text query, which is why
 * `confirmDialog()` below waits for the `open` attribute before anything is clicked.
 *
 * **The download is mocked at the module boundary, and everything else is real.** jsdom has no
 * `URL.createObjectURL`, so `downloadTextFile` is replaced and the file it is handed is inspected.
 * The database, the parser, the format and the screen are the real ones.
 */

vi.mock('../lib/backup-file', async (importOriginal) => {
  const actual = await importOriginal<typeof BackupFile>()
  return { ...actual, downloadTextFile: vi.fn() }
})

import { downloadTextFile } from '../lib/backup-file'

const NOW = 1_800_000_000_000
const FILE_NAME = 'studybao-backup-2026-10-08.json'

/**
 * A wait budget **below** `testTimeout` (20000ms in `vitest.config.ts`), which is the invariant that
 * matters: a wait whose budget equals the test's can never report its own failure — vitest kills the
 * test first with "Test timed out", naming no element. This file had exactly that bug at 5000 against
 * a 5000ms default, and it was found as an intermittent failure under coverage load.
 *
 * 10000 rather than 5000 because the first render here pays for creating and seeding the in-memory
 * database and then drives a real file read on top of it. Raising it again is a finding about speed,
 * not tuning.
 */
const WAIT = { timeout: 10000 } as const

/** The cards that live only in the file — the laptop's copy. Two, so a count can change. */
const FILE_CARDS: Card[] = [
  {
    id: 'card-from-the-file',
    deckId: 'deck-practice-i',
    front: 'From the laptop',
    back: 'Restored.',
    tags: [],
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    learningStep: 0,
    nextReview: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'card-from-the-file-2',
    deckId: 'deck-practice-i',
    front: 'Also from the laptop',
    back: 'Restored too.',
    tags: [],
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    learningStep: 0,
    nextReview: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  },
]

const FILE_CARD_IDS = FILE_CARDS.map((card) => card.id).sort()

/** The card that lives only on this device, and must not survive a restore. */
const DEVICE_CARD: Card = { ...FILE_CARDS[0]!, id: 'card-only-on-this-device' }

const FILE_SETTINGS: AppSettings = {
  id: SETTINGS_ROW_ID,
  cramThresholdDays: 30,
  cloudSync: true,
  seededAt: NOW - 1000,
  updatedAt: NOW,
}

function validFileText(): string {
  return serializeBackup(
    buildEnvelope(
      {
        decks: [],
        cards: FILE_CARDS,
        reviewLogs: [],
        settings: [FILE_SETTINGS],
        sessions: [],
        lessons: [],
      },
      NOW,
    ),
  )
}

function damagedFileText(change: (file: Record<string, unknown>) => void): string {
  const file = JSON.parse(validFileText()) as Record<string, unknown>
  change(file)
  return JSON.stringify(file)
}

function fileFrom(text: string): File {
  return new File([text], FILE_NAME, { type: 'application/json' })
}

/** The one hidden input the backup card owns. */
function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('No file input on the screen.')
  return input
}

/**
 * The confirmation dialog, found by its content rather than by position, and waited for until it is
 * really open.
 *
 * The screen has two `<dialog>` elements — this one and the Home Screen explanation — and `Modal`
 * renders both whether or not they are open. The `open` wait is not ceremony: `showModal()` runs
 * from an effect, jsdom hides a *closed* dialog's contents from role queries the way a browser does,
 * and a synchronous role query can otherwise land in the frame between "the counts have rendered"
 * and "the dialog is open". That is a flake, not a defect, and waiting for the attribute is what
 * makes the difference visible instead of intermittent.
 */
async function confirmDialog(): Promise<HTMLElement> {
  await waitFor(() => {
    const dialog = [...document.querySelectorAll('dialog')].find((element) =>
      element.textContent?.includes('In this file'),
    )
    expect(dialog?.hasAttribute('open')).toBe(true)
  }, WAIT)

  return backupDialog()
}

/** The confirmation dialog, without waiting for it — for asserting that it did *not* open. */
function backupDialog(): HTMLElement {
  const dialog = [...document.querySelectorAll('dialog')].find((element) =>
    element.textContent?.includes('In this file'),
  )
  if (!dialog) throw new Error('The confirmation dialog is not showing any counts.')
  return dialog
}

async function chooseFile(text: string): Promise<void> {
  fireEvent.change(fileInput(), { target: { files: [fileFrom(text)] } })
}

async function liveCardIds(): Promise<string[]> {
  return (await listAllCards()).map((card) => card.id).sort()
}

/** Puts the device-only card in place, so "replaced" is distinguishable from "unchanged". */
async function seedDeviceCard(): Promise<void> {
  const db = await getDb()
  await db.cards.put(DEVICE_CARD)
}

function renderSettings(extra?: React.ReactNode) {
  return render(
    <ToastProvider>
      <SettingsPage />
      {extra}
    </ToastProvider>,
    { initialPath: '/settings' },
  )
}

/** A second screen's view of the data, to prove an import tells the app to re-read. */
function CardWitness() {
  const load = useCallback(async () => (await listAllCards()).length, [])
  const { value } = useDatabaseValue(load, -1)

  return <span data-testid="witness">{value}</span>
}

beforeEach(() => {
  vi.mocked(downloadTextFile).mockClear()
})

describe('saving a backup', () => {
  it('downloads a file named for the day, and says which file it saved', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('button', { name: 'Save a backup' }, WAIT))

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))

    const [fileName, text] = vi.mocked(downloadTextFile).mock.calls[0] ?? []
    expect(fileName).toMatch(/^studybao-backup-\d{4}-\d{2}-\d{2}\.json$/)
    expect(text).toContain('"format": "studybao-backup"')

    // The name she is shown is the name of the file she got, which is the only thing she can check.
    expect(
      await screen.findByText(new RegExp(String(fileName)), undefined, WAIT),
    ).toBeInTheDocument()
  })
})

describe('choosing a file to restore', () => {
  it('opens the file picker from the Restore button', async () => {
    const user = userEvent.setup()
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')
    renderSettings()

    await user.click(await screen.findByRole('button', { name: 'Restore a backup' }, WAIT))

    expect(click).toHaveBeenCalled()
  })

  it('shows what is in the file and what is here, and writes nothing yet', async () => {
    await seedDeviceCard()
    renderSettings()

    await chooseFile(validFileText())

    // The counts render only once a file has been read, so their appearance is the signal that the
    // confirmation is genuinely open — unlike the dialog's title, which is in the DOM either way.
    const dialog = await confirmDialog()
    expect(within(dialog).getByText('In this file')).toBeInTheDocument()
    expect(within(dialog).getByText('On this device now')).toBeInTheDocument()

    expect(await liveCardIds()).toEqual([DEVICE_CARD.id])
  })

  it('leaves everything alone when she cancels', async () => {
    const user = userEvent.setup()
    await seedDeviceCard()
    renderSettings()

    await chooseFile(validFileText())
    const dialog = await confirmDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(await liveCardIds()).toEqual([DEVICE_CARD.id])
  })

  it('offers to save what is here first, and replaces nothing when she takes it', async () => {
    const user = userEvent.setup()
    await seedDeviceCard()
    renderSettings()

    await chooseFile(validFileText())
    const dialog = await confirmDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Save what’s here first' }))

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    // The note stays in the dialog after the toast has gone, which is why it is asserted inside the
    // dialog rather than by text alone — the toast carries the same sentence.
    expect(within(dialog).getByText(/way back/)).toBeInTheDocument()

    // Saving a copy is not the destructive step; the device is still hers.
    expect(await liveCardIds()).toEqual([DEVICE_CARD.id])
  })
})

describe('restoring', () => {
  it('replaces what is here with the file, and tells the other screens to re-read', async () => {
    const user = userEvent.setup()
    await seedDeviceCard()
    renderSettings(<CardWitness />)

    await waitFor(() => expect(screen.getByTestId('witness')).toHaveTextContent('1'), WAIT)

    await chooseFile(validFileText())
    const dialog = await confirmDialog()

    await user.click(
      within(dialog).getByRole('button', { name: 'Replace everything with this file' }),
    )

    expect(
      await screen.findByText(/everything from that file/i, undefined, WAIT),
    ).toBeInTheDocument()
    expect(await liveCardIds()).toEqual(FILE_CARD_IDS)

    // The row that was only on this device is gone: a restore is a transfer, not a merge.
    const db = await getDb()
    expect(await db.cards.get(DEVICE_CARD.id)).toBeUndefined()

    // And the other screen re-read without a reload, which is what the shared signal buys.
    await waitFor(() => expect(screen.getByTestId('witness')).toHaveTextContent('2'), WAIT)
  })

  it('refuses a file from a newer version, and writes nothing', async () => {
    await seedDeviceCard()
    renderSettings()

    await chooseFile(damagedFileText((file) => (file.formatVersion = 2)))

    expect(await screen.findByRole('alert', undefined, WAIT)).toHaveTextContent(/newer version/i)
    expect(await liveCardIds()).toEqual([DEVICE_CARD.id])
  })

  it('refuses a file that is not a backup at all, and writes nothing', async () => {
    await seedDeviceCard()
    renderSettings()

    await chooseFile('{"hello":"world"}')

    expect(await screen.findByRole('alert', undefined, WAIT)).toHaveTextContent(
      /doesn’t look like a StudyBao backup/,
    )
    expect(await liveCardIds()).toEqual([DEVICE_CARD.id])
  })

  it('can be offered the same file twice after a refusal', async () => {
    renderSettings()

    // A refused file leaves the input holding it; without clearing the value, choosing it again
    // fires no change event and the button looks broken at the moment she is most likely to retry.
    await chooseFile(damagedFileText((file) => (file.formatVersion = 2)))
    await screen.findByRole('alert', undefined, WAIT)

    expect(fileInput().value).toBe('')
  })
})
