import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import type { PendingBackup } from '@/features/settings/hooks/use-backup'
import {
  BACKUP_COPY,
  COUNTED_TABLES,
  TABLE_LABELS,
  formatCount,
} from '@/features/settings/lib/backup-messages'
import type { TableCounts } from '@/lib/backup-format'

/**
 * The "Your data" card and its confirmation dialog.
 *
 * Its own component for two reasons. The quiet one is that this is a self-contained interaction —
 * a card, a hidden file input and a modal — and the settings screen is long enough already. The
 * loud one is that **reading the dialog's contents is not how you test it**: `Modal` keeps its
 * children mounted while closed, and jsdom has no visibility model for a closed `<dialog>`, so a
 * query for this dialog's copy succeeds whether or not it is open. See docs/HANDOFF.md §4. The
 * tests that mean anything here assert the *effect* — that nothing was written until the confirm
 * was pressed — and they live in `pages/settings.test.tsx`, against the real database.
 */

export interface BackupPanelProps {
  /** Attach to the hidden file input below. */
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onOpenFilePicker: () => void
  onFileChosen: (file: File | undefined) => void
  onExport: () => void
  onSaveBeforeImport: () => void
  onConfirmImport: () => void
  onCancelImport: () => void
  /** A file that parsed and is waiting for her to confirm replacing everything. */
  pending: PendingBackup | null
  busy: boolean
  savedFirst: boolean
}

export function BackupCard({ backup }: { backup: BackupPanelProps }) {
  return (
    <>
      <Card>
        <CardHeader
          title="Your data"
          description="A backup is one file you keep. No account, no internet — and it works even if sync is broken."
        />
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={backup.onExport} disabled={backup.busy}>
              Save a backup
            </Button>
            <Button variant="secondary" onClick={backup.onOpenFilePicker} disabled={backup.busy}>
              Restore a backup
            </Button>
          </div>

          {/*
            Hidden, and driven by the button above: a visible file input is browser chrome she has to
            read, and the button says what it does. `hidden` rather than `sr-only` because a control
            that is focusable but invisible is a keyboard trap, and the button is the real control.
          */}
          <input
            ref={backup.fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              backup.onFileChosen(event.target.files?.[0])
            }}
          />

          <p className="text-sm leading-relaxed text-ink-muted">
            Moving between your iPad and your laptop? Save the file on one, restore it on the other.
            Restoring <strong className="font-semibold text-ink">replaces</strong> what&rsquo;s here
            — it doesn&rsquo;t combine the two.
          </p>
          <p className="text-xs text-ink-faint">
            Keep the file somewhere you&rsquo;ll find it again, and keep one on the other device too.
            It isn&rsquo;t locked with a password, so treat it like your notes.
          </p>
        </CardContent>
      </Card>

      <Modal
        open={backup.pending !== null}
        onClose={backup.onCancelImport}
        title="Restore this file and replace everything here?"
        description="This is the one thing in the app that can lose something, so here's exactly what it will do."
        footer={
          <>
            <Button variant="ghost" onClick={backup.onCancelImport} disabled={backup.busy}>
              Cancel
            </Button>
            <Button variant="strong" onClick={backup.onConfirmImport} loading={backup.busy}>
              Replace everything with this file
            </Button>
          </>
        }
      >
        {backup.pending ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-muted">
              From{' '}
              <span className="font-display font-semibold break-all text-ink">
                {backup.pending.fileName}
              </span>
            </p>

            <div className="grid grid-cols-2 gap-3">
              <CountsTable title="In this file" counts={backup.pending.fileCounts} />
              <CountsTable title="On this device now" counts={backup.pending.deviceCounts} />
            </div>

            <p className="text-sm leading-relaxed text-ink-muted">
              Restoring replaces all of it — cards, reviews, lessons and your settings (the exam date
              included). It doesn&rsquo;t combine the two, so anything here that isn&rsquo;t in the
              file will be gone.
            </p>

            <div className="flex flex-col gap-2">
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={backup.onSaveBeforeImport}
                  disabled={backup.busy}
                >
                  Save what&rsquo;s here first
                </Button>
              </div>

              {backup.savedFirst ? (
                // Plain text, deliberately not a live region: the toast has already announced the
                // save, and two announcements of one fact is noise. This is here for the moment
                // after the toast has gone, while she is still deciding.
                <p className="text-xs text-ink-muted">{BACKUP_COPY.preImportSaved}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  )
}

/**
 * One side of the comparison.
 *
 * The settings row is deliberately not a line here: "Your settings — 1" tells her nothing, and what
 * actually matters about it is said in the paragraph above instead.
 */
function CountsTable({ title, counts }: { title: string; counts: TableCounts }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-line bg-canvas p-3">
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <dl className="mt-2 flex flex-col gap-1 text-sm">
        {COUNTED_TABLES.map((table) => (
          <div key={table} className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">{TABLE_LABELS[table]}</dt>
            <dd className="font-display font-semibold text-ink">{formatCount(counts[table])}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
