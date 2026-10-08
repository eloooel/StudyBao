import { useCallback, useRef, useState } from 'react'

import { useToast } from '@/components/ui/use-toast'
import { exportBackup, importBackup, listTableCounts } from '@/db/repositories/backup'
import { parseBackup, type TableCounts } from '@/lib/backup-format'
import { notifyDataChanged } from '@/lib/use-database-value'

import { backupFilename, downloadTextFile } from '../lib/backup-file'
import { BACKUP_COPY, backupFailureMessage } from '../lib/backup-messages'

/**
 * Layer 2 — the backup actions, and the state of a confirmation that has not happened yet.
 *
 * The screen below this stays a pure view: the file input's ref, the "we are mid-read" flag and the
 * chosen-but-unconfirmed file all live here.
 *
 * ## Two things it deliberately does
 *
 * **It holds the file as text, not as a parsed envelope.** What the dialog reports and what gets
 * written are then the same bytes read twice, so the counts she approved cannot come from a
 * different reading than the write. Re-parsing on confirm is free at her scale.
 *
 * **It clears the file input after every pick.** Without that, choosing the same file twice fires
 * no `change` event, so a file that was refused once appears to make the Import button stop working
 * — the exact moment she is most likely to try again with the same file.
 */

export interface PendingBackup {
  /** The chosen file's text. See the note above on why this is not an envelope. */
  text: string
  fileName: string
  /** What is in the file. */
  fileCounts: TableCounts
  /** What is on this device right now, read when the file was chosen. */
  deviceCounts: TableCounts
}

export interface BackupActions {
  /** Attach to the hidden file input the view renders. */
  fileInputRef: React.RefObject<HTMLInputElement | null>
  openFilePicker: () => void
  onFileChosen: (file: File | undefined) => Promise<void>
  exportNow: () => Promise<void>
  /** The pre-import save, from inside the dialog. */
  saveBeforeImport: () => Promise<void>
  confirmImport: () => Promise<void>
  cancelImport: () => void
  /** Non-null while a valid file is waiting for her to confirm replacing everything. */
  pending: PendingBackup | null
  /** A read, write or download is in flight; the buttons are disabled. */
  busy: boolean
  /** Whether she has already saved a copy from inside the dialog. */
  savedFirst: boolean
}

export function useBackup(): BackupActions {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingBackup | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedFirst, setSavedFirst] = useState(false)

  const save = useCallback(
    async (messageFor: (fileName: string) => string): Promise<boolean> => {
      setBusy(true)
      try {
        // One clock reading for both the name and the stamp, so a save that lands exactly at
        // midnight cannot name the file for one day and date its contents for another.
        const now = Date.now()
        const { text } = await exportBackup(now)
        const fileName = backupFilename(now)

        downloadTextFile(fileName, text)
        toast.show(messageFor(fileName), { tone: 'success' })
        return true
      } catch {
        toast.show(BACKUP_COPY.exportFailed, { tone: 'attention' })
        return false
      } finally {
        setBusy(false)
      }
    },
    [toast],
  )

  const exportNow = useCallback(async () => {
    await save(BACKUP_COPY.exportSuccess)
  }, [save])

  const saveBeforeImport = useCallback(async () => {
    const saved = await save(() => BACKUP_COPY.preImportSaved)
    if (saved) setSavedFirst(true)
  }, [save])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const onFileChosen = useCallback(
    async (file: File | undefined) => {
      if (!file) return

      setBusy(true)
      try {
        let text: string
        try {
          text = await file.text()
        } catch {
          toast.show(BACKUP_COPY.unreadable, { tone: 'attention', sticky: true })
          return
        }

        const parsed = parseBackup(text)
        if (!parsed.ok) {
          // The reason is the whole point of this branch, so it stays on screen until she dismisses
          // it rather than timing out while she reads it.
          toast.show(backupFailureMessage(parsed.failure), { tone: 'attention', sticky: true })
          return
        }

        setSavedFirst(false)
        setPending({
          text,
          fileName: file.name,
          fileCounts: parsed.envelope.counts,
          deviceCounts: await listTableCounts(),
        })
      } finally {
        setBusy(false)
        // See the module comment: this is what lets her pick the same file again.
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [toast],
  )

  const confirmImport = useCallback(async () => {
    if (!pending) return

    setBusy(true)
    try {
      const outcome = await importBackup(pending.text)

      if (!outcome.ok) {
        // Not reachable through the dialog — the file was parsed before it opened — but a refusal is
        // reported the same way wherever it comes from.
        toast.show(backupFailureMessage(outcome.failure), { tone: 'attention', sticky: true })
        return
      }

      setPending(null)
      // Every screen reads through the shared signal, so this is what stops the deck list showing
      // pre-import data after she has just replaced it.
      notifyDataChanged()
      toast.show(BACKUP_COPY.importSuccess, { tone: 'success' })
    } catch {
      // The transaction has already rolled back. Saying so is the difference between a scary moment
      // and "did that half-work?".
      toast.show(BACKUP_COPY.importFailed, { tone: 'attention', sticky: true })
    } finally {
      setBusy(false)
    }
  }, [pending, toast])

  const cancelImport = useCallback(() => {
    setPending(null)
    setSavedFirst(false)
  }, [])

  return {
    fileInputRef,
    openFilePicker,
    onFileChosen,
    exportNow,
    saveBeforeImport,
    confirmImport,
    cancelImport,
    pending,
    busy,
    savedFirst,
  }
}
