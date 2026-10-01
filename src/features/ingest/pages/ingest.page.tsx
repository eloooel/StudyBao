import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { IngestView } from '../components/ingest-view'
import { useIngestActions } from '../hooks/use-ingest-draft'
import { useIngestDecks } from '../hooks/use-ingest-decks'
import { usePhotoIngest } from '../hooks/use-ingest-photo'
import { usePdfIngest } from '../hooks/use-ingest-pdf'
import { DRAFT_SIZE_CEILING_BYTES, keepUnpersistedBatch } from '../lib/draft-storage'
import { normalize } from '../lib/normalize'
import type { IngestTab, IngestTabStatus, PdfStatus, PhotoStatus } from '../types'

/**
 * Layer 1 — where notes come in.
 *
 * The tab lives in the URL (`?tab=pdf`) rather than in component state, matching the review
 * page's `?mode=due`: a tab is then a link she can bookmark and refresh into, and an iPad tab
 * restore does not silently move her.
 *
 * The draft is written to session storage **before** navigating, so the review screen has
 * something to restore even if the navigation is interrupted. When it is too large to keep,
 * this screen says so and the batch is held in memory for the tab instead — losing it outright
 * is the outcome the ceiling exists to make visible, not to cause.
 */
export default function IngestPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { decks, deckId, setDeckId, loading } = useIngestDecks()
  const { startBatch } = useIngestActions(undefined, () => undefined)

  const tabParam = searchParams.get('tab')
  const tab: IngestTab = tabParam === 'pdf' || tabParam === 'photo' ? tabParam : 'paste'

  const [text, setText] = useState('')
  const [note, setNote] = useState<string | undefined>(undefined)

  // Extraction and OCR both fill the same `text` the paste tab writes to, so the parser has one
  // entry point and no path can drift from the others.
  const onExtracted = useCallback((extracted: string) => {
    setText(extracted)
    setNote(undefined)
  }, [])
  const pdf = usePdfIngest({ onExtracted })
  // `enabled` is what triggers the warm-up, and it is true only on the photo tab — the worker is
  // several megabytes and must not be fetched on app load.
  const photo = usePhotoIngest({ onExtracted }, tab === 'photo')

  const lineCount = useMemo(() => normalize(text).length, [text])

  const tabs: IngestTabStatus[] = [
    { id: 'paste', label: 'Paste text', enabled: true },
    { id: 'pdf', label: 'Upload PDF', enabled: true },
    { id: 'photo', label: 'Upload photo', enabled: true },
  ]

  const activeTab = tabs.find((entry) => entry.id === tab)
  const canSubmit = lineCount > 0 && deckId !== ''

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-ink-muted" role="status">
        Getting your decks ready…
      </p>
    )
  }

  return (
    <IngestView
      tab={tab}
      tabs={tabs}
      onSelectTab={(next) => {
        setSearchParams(next === 'paste' ? {} : { tab: next })
      }}
      decks={decks}
      deckId={deckId}
      onSelectDeck={setDeckId}
      text={text}
      onChangeText={(next) => {
        setText(next)
        setNote(undefined)
      }}
      onSubmit={() => {
        if (!canSubmit) return

        const { draft, outcome } = startBatch({
          text,
          deckId,
          // The label records where the lines came from, so the review screen can say so. A file
          // name is more useful to her than "Upload photo".
          sourceLabel: sourceLabelFor(tab, pdf.status, photo.status, activeTab?.label),
        })

        keepUnpersistedBatch(outcome.persisted ? undefined : draft)

        if (!outcome.persisted) {
          // Said plainly, with the reassurance that is actually true: accepted cards are
          // durable the moment they are accepted, so only the unreviewed remainder is at risk.
          setNote(
            outcome.reason === 'too-large'
              ? `This batch is large (${formatBytes(outcome.bytes)} — the reload limit is ${formatBytes(DRAFT_SIZE_CEILING_BYTES)}), so it can't be kept if the page reloads. Nothing is lost right now: carry on, and anything you accept is saved the moment you accept it. Just don't reload until you're done.`
              : "This browser won't let us hold the batch across a reload, so it lives on this screen only. Anything you accept is saved immediately — just don't reload until you're done.",
          )
        }

        void navigate('/cards/ingest/review')
      }}
      lineCount={lineCount}
      pdfStatus={pdf.status}
      onPickPdfFile={pdf.pickFile}
      photoStatus={photo.status}
      onPickPhotoFile={photo.pickFile}
      {...(note === undefined ? {} : { persistenceNote: note })}
      error={decks.length === 0 ? 'There are no decks to add cards to yet.' : undefined}
    />
  )
}

/**
 * What to call the source on the review screen.
 *
 * A file name beats "Upload photo" because by the time she is reviewing thirty cards, which file
 * they came from is the thing she might need to check.
 */
function sourceLabelFor(
  tab: IngestTab,
  pdfStatus: PdfStatus,
  photoStatus: PhotoStatus,
  tabLabel: string | undefined,
): string {
  if (tab === 'pdf' && pdfStatus.state === 'ready') return pdfStatus.fileName
  if (tab === 'photo' && photoStatus.state === 'ready') return photoStatus.fileName
  return tabLabel ?? 'Pasted text'
}

/** Bytes as something she can compare against the stated limit. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} bytes`
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
