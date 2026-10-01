import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { IngestView } from '../components/ingest-view'
import { useIngestActions } from '../hooks/use-ingest-draft'
import { useIngestDecks } from '../hooks/use-ingest-decks'
import { DRAFT_SIZE_CEILING_BYTES, keepUnpersistedBatch } from '../lib/draft-storage'
import { normalize } from '../lib/normalize'
import type { IngestTab, IngestTabStatus } from '../types'

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

  const lineCount = useMemo(() => normalize(text).length, [text])

  // PDF and OCR arrive in commits 2 and 3. Until then they are visible with a reason, which is
  // the pattern the Timer's disabled Start button already set — hiding them would make her
  // wonder whether a photo path exists at all.
  const tabs: IngestTabStatus[] = [
    { id: 'paste', label: 'Paste text', enabled: true },
    {
      id: 'pdf',
      label: 'Upload PDF',
      enabled: false,
      note: 'Reading PDFs is coming next. For now, open the PDF and copy the text into the paste tab — the parser gets exactly the same text, and often cleaner.',
    },
    {
      id: 'photo',
      label: 'Upload photo',
      enabled: false,
      note: 'Reading photos is coming next. Your phone is better at this than we are: on an iPhone use Live Text, or Google Lens on Android, to copy the words out of a photo and paste them here.',
    },
  ]

  const activeTab = tabs.find((entry) => entry.id === tab)
  const canSubmit = tab === 'paste' && lineCount > 0 && deckId !== ''

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
        if (tabs.find((entry) => entry.id === next)?.enabled !== true) return
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
          sourceLabel: activeTab?.label ?? 'Pasted text',
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
      {...(note === undefined ? {} : { persistenceNote: note })}
      error={decks.length === 0 ? 'There are no decks to add cards to yet.' : undefined}
    />
  )
}

/** Bytes as something she can compare against the stated limit. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} bytes`
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
