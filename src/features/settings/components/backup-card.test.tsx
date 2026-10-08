import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { fireEvent, render, screen, within } from '@/test/render'
import { SETTINGS_ROW_ID } from '@/lib/backup-format'

import { BackupCard, type BackupPanelProps } from './backup-card'

/**
 * The backup card as a pure view.
 *
 * What it pins is the *comparison*: the two columns really are two different sets of numbers under
 * the same labels, which is the whole point of showing them before a destructive action. The
 * behaviour — nothing written until she confirms — is asserted against the database in
 * `pages/settings.test.tsx`, because a query inside a closed `<dialog>` proves nothing here.
 */

const FILE_COUNTS = {
  decks: 5,
  cards: 412,
  reviewLogs: 1208,
  settings: 1,
  sessions: 12,
  lessons: 34,
}

const DEVICE_COUNTS = {
  decks: 5,
  cards: 0,
  reviewLogs: 0,
  settings: 1,
  sessions: 0,
  lessons: 0,
}

function props(overrides: Partial<BackupPanelProps> = {}): BackupPanelProps {
  return {
    fileInputRef: { current: null },
    onOpenFilePicker: vi.fn(),
    onFileChosen: vi.fn(),
    onExport: vi.fn(),
    onSaveBeforeImport: vi.fn(),
    onConfirmImport: vi.fn(),
    onCancelImport: vi.fn(),
    pending: null,
    busy: false,
    savedFirst: false,
    ...overrides,
  }
}

/** The confirmation dialog, which is the second `<dialog>` on the screen. */
function dialogWithCounts(): HTMLElement {
  const dialog = [...document.querySelectorAll('dialog')].find((element) =>
    element.textContent?.includes('In this file'),
  )
  if (!dialog) throw new Error('No dialog is showing counts.')
  return dialog
}

describe('the backup card', () => {
  it('offers to save and to restore, in her words', () => {
    render(<BackupCard backup={props()} />)

    expect(screen.getByRole('button', { name: 'Save a backup' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore a backup' })).toBeInTheDocument()
  })

  it('says that restoring replaces rather than combines, before anything is opened', () => {
    render(<BackupCard backup={props()} />)

    expect(screen.getByText(/replaces/)).toBeInTheDocument()
    expect(screen.getByText(/keep one on the other device too/)).toBeInTheDocument()
  })

  it('hands the picked file up rather than reading it here', () => {
    const onFileChosen = vi.fn()
    const file = new File(['{}'], 'studybao-backup-2026-10-08.json')
    render(<BackupCard backup={props({ onFileChosen })} />)

    const input = document.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('No file input rendered.')
    // `fireEvent`, not `user.upload`: the input is deliberately hidden, and a pointer-based helper
    // refuses to interact with something the layout says is invisible.
    fireEvent.change(input, { target: { files: [file] } })

    expect(onFileChosen).toHaveBeenCalledWith(file)
  })

  it('shows the file and the device side by side, with their own numbers', () => {
    render(
      <BackupCard
        backup={props({
          pending: {
            text: '{}',
            fileName: 'studybao-backup-2026-10-08.json',
            fileCounts: FILE_COUNTS,
            deviceCounts: DEVICE_COUNTS,
          },
        })}
      />,
    )

    const dialog = dialogWithCounts()

    expect(within(dialog).getByText('In this file')).toBeInTheDocument()
    expect(within(dialog).getByText('On this device now')).toBeInTheDocument()
    expect(within(dialog).getByText('studybao-backup-2026-10-08.json')).toBeInTheDocument()

    // 412 in the file, 0 here: the two columns are genuinely two readings, not one repeated.
    const columns = within(dialog).getAllByRole('definition')
    expect(columns.map((cell) => cell.textContent)).toEqual(['5', '412', '1,208', '12', '34', '5', '0', '0', '0', '0'])
  })

  it('keeps the settings singleton out of the comparison, and mentions it in words instead', () => {
    render(
      <BackupCard
        backup={props({
          pending: {
            text: '{}',
            fileName: 'studybao-backup-2026-10-08.json',
            fileCounts: FILE_COUNTS,
            deviceCounts: DEVICE_COUNTS,
          },
        })}
      />,
    )

    const dialog = dialogWithCounts()

    expect(within(dialog).queryByText('Your settings')).toBeNull()
    expect(within(dialog).getByText(/the exam date included/)).toBeInTheDocument()
  })

  it('calls the confirm and the cancel, and shows the save note only after a save', async () => {
    const user = userEvent.setup()
    const onConfirmImport = vi.fn()
    const onCancelImport = vi.fn()
    const onSaveBeforeImport = vi.fn()
    const pending = {
      text: '{}',
      fileName: 'studybao-backup-2026-10-08.json',
      fileCounts: FILE_COUNTS,
      deviceCounts: DEVICE_COUNTS,
    }

    const { rerender } = render(
      <BackupCard backup={props({ pending, onConfirmImport, onCancelImport, onSaveBeforeImport })} />,
    )

    await user.click(screen.getByRole('button', { name: 'Save what’s here first' }))
    await user.click(screen.getByRole('button', { name: 'Replace everything with this file' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSaveBeforeImport).toHaveBeenCalledTimes(1)
    expect(onConfirmImport).toHaveBeenCalledTimes(1)
    expect(onCancelImport).toHaveBeenCalledTimes(1)

    // The note is what tells her the file she just saved is the way back.
    expect(screen.queryByText(/way back/)).toBeNull()
    rerender(<BackupCard backup={props({ pending, savedFirst: true })} />)
    expect(screen.getByText(/way back/)).toBeInTheDocument()
  })

  it('refuses to look busy while it is, so she cannot press twice', () => {
    render(
      <BackupCard
        backup={props({
          busy: true,
          pending: {
            text: '{}',
            fileName: 'studybao-backup-2026-10-08.json',
            fileCounts: FILE_COUNTS,
            deviceCounts: DEVICE_COUNTS,
          },
        })}
      />,
    )

    expect(screen.getByRole('button', { name: 'Save a backup' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Restore a backup' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Replace everything with this file' })).toBeDisabled()
  })

  it('uses the singleton id this feature and the schema agree on', () => {
    // A guard on the constant the card's copy refers to; the schema comparison is in the
    // repository's own test, next to the code that would drift.
    expect(SETTINGS_ROW_ID).toBe('app')
  })
})
