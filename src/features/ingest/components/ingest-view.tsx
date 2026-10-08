import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Deck } from '@/db/types'
import { cn } from '@/lib/cn'
import type { IngestTabStatus, IngestViewProps, PdfStatus, PhotoStatus } from '../types'
import { PasteTextArea } from './paste-text-area'

/**
 * Layer 3 — the ingest screen. No hooks, no database.
 *
 * The tabs are the three paths `BUILD_GUIDE.md` §4 names, in the order the guide recommends
 * trying them: paste, then PDF, then photo. Paste is the default because it is the
 * highest-fidelity path — no recognition step at all — and photo OCR is labelled best-effort
 * because Tesseract is trained on printed text and is poor at handwriting.
 *
 * PDF and photo are the same text with no recognition step or with one, so all three share the
 * single parse path; only where the lines come from differs.
 */
export function IngestView({
  tab,
  tabs,
  onSelectTab,
  decks,
  deckId,
  onSelectDeck,
  text,
  onChangeText,
  onSubmit,
  lineCount,
  pdfStatus,
  onPickPdfFile,
  photoStatus,
  onPickPhotoFile,
  persistenceNote,
  error,
}: IngestViewProps) {
  const active = tabs.find((entry) => entry.id === tab)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl">Add from your notes</h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          Paste your notes, open a PDF, or photograph a page, and StudyBao will pull out the
          definitions it recognises. You get to check every card before anything is saved.
        </p>
      </header>

      <div role="tablist" aria-label="Where the notes come from" className="flex flex-wrap gap-2">
        {tabs.map((entry) => (
          <TabButton
            key={entry.id}
            entry={entry}
            selected={entry.id === tab}
            onSelect={() => onSelectTab(entry.id)}
          />
        ))}
      </div>

      <Card>
        <CardHeader title={active?.label ?? 'Add notes'} description={active?.note ?? undefined} />
        <CardContent className="flex flex-col gap-4">
          {tab === 'paste' ? (
            <PasteTextArea
              label="Your notes"
              value={text}
              onChange={onChangeText}
              placeholder={
                'Vitamin C: ascorbic acid\nIron - ferrous sulfate\nQ1. What is the antidote?\nA1. N-acetylcysteine'
              }
              hint="One definition per line works best, either “Term: definition” or “Term - definition”. Anything it can't turn into a card waits for you on the next screen — nothing is thrown away."
            />
          ) : tab === 'pdf' ? (
            <FilePanel
              kind="pdf"
              label="Choose a PDF"
              accept="application/pdf,.pdf"
              status={pdfStatus}
              onPickFile={onPickPdfFile}
              foundLines={lineCount}
              text={text}
            />
          ) : (
            <FilePanel
              kind="photo"
              label="Choose a photo"
              accept="image/*"
              status={photoStatus}
              onPickFile={onPickPhotoFile}
              foundLines={lineCount}
              text={text}
            />
          )}

          {tab !== undefined ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="font-display text-sm font-semibold text-ink">
                  Which deck should these go in?
                </span>
                <select
                  value={deckId}
                  onChange={(event) => onSelectDeck(event.target.value)}
                  className={cn(
                    'min-h-12 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base text-ink',
                    'focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent',
                  )}
                >
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" disabled={lineCount === 0} onClick={onSubmit}>
                  Find my cards
                </Button>
                {/* A second status region can be on screen at once — the panel's own progress
                    line — so each carries a name, for a screen reader and for the tests. */}
                <span className="text-sm text-ink-muted" role="status" aria-label="Lines ready">
                  {lineCount === 0
                    ? tab === 'paste'
                      ? 'Nothing to read yet'
                      : 'No text read yet'
                    : `${lineCount} line${lineCount === 1 ? '' : 's'} ready`}
                </span>
              </div>
            </>
          ) : null}

          {persistenceNote !== undefined ? (
            <p className="rounded-[var(--radius-card)] border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink-muted">
              {persistenceNote}
            </p>
          ) : null}

          {error !== undefined ? (
            <p role="alert" className="text-sm font-semibold text-accent">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * The PDF and photo tabs' shared body.
 *
 * One component for both because the shape is genuinely the same — choose a file, watch it be
 * read, find out what happened — and two near-identical panels would drift. What differs is the
 * copy, and that is what the `kind` tag selects.
 *
 * The props are a **discriminated union** rather than `kind` plus a union-typed `status`: a PDF's
 * progress is "page 3 of 40" and a photo's is "recognizing text, 62%", and typing them as one
 * union means every field access needs a cast and can be wrong. Tagging the pair makes TypeScript
 * check it instead.
 *
 * Every state says what is happening and what to do about it, especially the failure states. The
 * two common real ones are opposite in cause and identical in answer: a **scanned PDF** has no
 * text layer at all, and **handwriting** is what Tesseract is worst at — both are better served
 * by the text recognition she already has on the device in her hands, and saying so is better than
 * a vague "couldn't read it".
 *
 * **That advice names the local tools and never a second device**, and it is one sentence rather
 * than a platform branch. She has an iPad and a Windows laptop, and iPadOS and Windows each carry
 * a text feature of their own; a sentence naming both is correct on every device, where
 * `navigator.platform` would be a feature-to-feature import and a predicate that misfires on a
 * device nobody tested. See `docs/DECISIONS.md` D14.
 */
type FilePanelProps = {
  label: string
  accept: string
  onPickFile: (file: File | undefined) => void
  foundLines: number
  text: string
} & ({ kind: 'pdf'; status: PdfStatus } | { kind: 'photo'; status: PhotoStatus })

function FilePanel(props: FilePanelProps) {
  const { kind, label, accept, onPickFile, foundLines, text } = props
  const { status } = props

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="font-display text-sm font-semibold text-ink">{label}</span>
        <input
          type="file"
          accept={accept}
          {...(kind === 'photo' ? { capture: 'environment' as const } : {})}
          onChange={(event) => onPickFile(event.target.files?.[0])}
          className={cn(
            'rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2.5 text-base text-ink',
            'file:mr-3 file:min-h-9 file:rounded-[var(--radius-control)] file:border-0 file:bg-primary file:px-3 file:font-display file:font-semibold file:text-on-primary',
            'focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent',
          )}
        />
      </label>

      {kind === 'photo' ? <PhotoAdvice /> : null}

      {status.state === 'preparing' ? (
        <p role="status" aria-label="Reading progress" className="text-sm text-ink-muted">
          Getting {status.fileName} ready…
        </p>
      ) : null}

      {status.state === 'reading' ? <ReadingLine kind={kind} status={status} /> : null}

      {status.state === 'ready' ? (
        <p role="status" aria-label="Reading progress" className="text-sm text-ink-muted">
          {kind === 'pdf' && 'pageCount' in status ? (
            <>
              Read {String(status.pageCount)} page{status.pageCount === 1 ? '' : 's'} from{' '}
              {status.fileName}.
            </>
          ) : (
            <>Read {status.fileName}.</>
          )}{' '}
          {String(foundLines)} line{foundLines === 1 ? '' : 's'} ready — tap &ldquo;Find my
          cards&rdquo; to see what it made of them.
        </p>
      ) : null}

      {kind === 'pdf' && status.state === 'scanned' ? (
        <p role="alert" className="text-sm leading-relaxed text-ink-muted">
          {status.fileName} has no text in it — {String(status.pageCount)} page
          {status.pageCount === 1 ? '' : 's'} of images, which usually means it was scanned. We
          can&rsquo;t read a scan reliably, and guessing would give you cards you can&rsquo;t trust.
          Open the file and copy the words out with the text feature already on the device
          you&rsquo;re using — Live Text on an iPad, or the Snipping Tool&rsquo;s text actions on
          Windows — then paste them into the first tab.
        </p>
      ) : null}

      {kind === 'photo' && status.state === 'empty' ? (
        <p role="alert" className="text-sm leading-relaxed text-ink-muted">
          We couldn&rsquo;t find any words in {status.fileName}. That is usually handwriting, a
          blurry photo, or a picture of something that isn&rsquo;t text. Try a flatter, brighter
          photo taken straight on — or, if it is handwriting, copy it with the text feature already
          on the device you&rsquo;re using (Live Text on an iPad, or the Snipping Tool&rsquo;s text
          actions on Windows) and paste it into the first tab. That reads handwriting far better
          than we can, and guessing at words would give you cards you can&rsquo;t trust.
        </p>
      ) : null}

      {status.state === 'failed' ? (
        <p role="alert" className="text-sm font-semibold text-accent">
          {status.message}
        </p>
      ) : null}

      {text.length > 0 && status.state === 'ready' ? (
        <details className="rounded-[var(--radius-card)] border border-line bg-canvas px-4 py-3">
          <summary className="cursor-pointer font-display text-sm font-semibold text-ink">
            Check what was read
          </summary>
          <pre className="mt-3 max-h-64 overflow-auto text-xs leading-relaxed whitespace-pre-wrap text-ink-muted">
            {text}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

/**
 * The "still working" line.
 *
 * OCR takes 20–30 seconds, which is long enough that a static message reads as a frozen screen —
 * the failure `docs/WORKFLOW-C-PROMPT.md` names. Saying "this takes about half a minute; it is
 * working" plus Tesseract's own percentage is what stops her closing the tab.
 */
function ReadingLine({
  kind,
  status,
}: {
  kind: 'pdf' | 'photo'
  status: Extract<PdfStatus, { state: 'reading' }> | Extract<PhotoStatus, { state: 'reading' }>
}) {
  if (kind === 'pdf' && 'total' in status) {
    return (
      <p role="status" aria-label="Reading progress" className="text-sm text-ink-muted">
        {status.total > 0
          ? `Reading ${status.fileName} — page ${String(status.done)} of ${String(status.total)}…`
          : `Opening ${status.fileName}…`}
      </p>
    )
  }

  if ('progress' in status) {
    return (
      <p role="status" aria-label="Reading progress" className="text-sm text-ink-muted">
        Reading {status.fileName} — {status.stage}, {String(Math.round(status.progress * 100))}%.
        This takes about half a minute; it is working.
      </p>
    )
  }

  return null
}

/**
 * The honest framing for the photo tab, from `docs/BUILD_GUIDE.md` §3 and ADR 0004.
 *
 * Tesseract is trained on printed text. Saying so *before* she takes a photo, and naming the free
 * text feature she already has for the hard case, is the difference between a feature that
 * occasionally disappoints and one that looks broken.
 *
 * It names the **capability** rather than one menu path on purpose: nobody on this project has
 * used the Windows side, and a tool named wrongly sends her hunting for a button that is not
 * there.
 */
function PhotoAdvice() {
  return (
    <p className="text-xs leading-relaxed text-ink-faint">
      Printed text works best — flat, bright, straight on. For handwriting, the text feature already
      on your device is better at this than we are: use Live Text on an iPad, or a screenshot
      tool&rsquo;s text actions on Windows, and paste the words into the first tab. The first photo
      you read downloads a small reading engine, so it needs the network once.
    </p>
  )
}

function TabButton({
  entry,
  selected,
  onSelect,
}: {
  entry: IngestTabStatus
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      disabled={!entry.enabled}
      onClick={onSelect}
      className={cn(
        'min-h-11 rounded-[var(--radius-control)] border px-4 font-display text-sm font-semibold transition-colors',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent',
        selected
          ? 'border-accent bg-primary text-on-primary'
          : 'border-line bg-surface text-ink-muted hover:text-ink',
        !entry.enabled && 'cursor-not-allowed opacity-55',
      )}
    >
      {entry.label}
    </button>
  )
}

/** Deck list for the picker, kept here so the page does not import a `<select>` shape. */
export type IngestDeckOption = Pick<Deck, 'id' | 'name'>
