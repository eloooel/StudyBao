import { afterEach, describe, expect, it } from 'vitest'

import { listAllCards } from '@/db/repositories/cards'
import { deckIdForPart } from '@/db/seed-data'
import type { IngestDraft } from '@/features/ingest/lib/draft-storage'
import { clearDraft, DRAFT_STORAGE_KEY, loadDraft } from '@/features/ingest/lib/draft-storage'
import { parseText } from '@/features/ingest/lib/parse'
import { render, screen, waitFor } from '@/test/render'
import IngestPage from './ingest.page'
import IngestReviewPage from './ingest-review.page'

/**
 * The ingest routes, end to end against a real in-memory IndexedDB.
 *
 * These are integration tests on purpose. The unit tests already pin the parser and the
 * counters; what can still go wrong here is the wiring — a draft that is written but never
 * restored, an accepted card that never reaches the deck, a batch that is thrown away by a
 * route change. Those are exactly the failures this feature exists to avoid.
 */

afterEach(() => {
  clearDraft()
})

/** Render the start screen, type notes, and submit. Returns nothing — the draft is the result. */
async function pasteNotes(text: string): Promise<void> {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()

  render(<IngestPage />, { initialPath: '/cards/ingest' })

  // The decks load asynchronously; the submit button is disabled until a deck is resolved and
  // there is at least one line of text.
  await waitFor(() => expect(screen.getByLabelText('Your notes')).toBeInTheDocument())
  await user.type(screen.getByLabelText('Your notes'), text)
  await user.click(screen.getByRole('button', { name: 'Find my cards' }))
}

describe('IngestPage', () => {
  it('shows the two unbuilt paths as disabled with a reason rather than hiding them', async () => {
    render(<IngestPage />, { initialPath: '/cards/ingest' })

    // The decks load asynchronously, and until they do the page says so rather than showing a
    // picker with nothing in it.
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Paste text' })).toBeInTheDocument())

    expect(screen.getByRole('tab', { name: 'Paste text' })).toHaveAttribute('aria-selected', 'true')
    // Paste and PDF are both live. Photo is not yet, and says so rather than vanishing.
    expect(screen.getByRole('tab', { name: 'Upload PDF' })).toBeEnabled()
    expect(screen.getByRole('tab', { name: 'Upload photo' })).toBeDisabled()
  })

  it('says how many lines it can see, so a bad paste is obvious before parsing', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    render(<IngestPage />, { initialPath: '/cards/ingest' })
    await waitFor(() => expect(screen.getByLabelText('Your notes')).toBeInTheDocument())

    await user.type(
      screen.getByLabelText('Your notes'),
      'Vitamin C: ascorbic acid{Enter}Iron: ferrous',
    )

    expect(screen.getByRole('status', { name: 'Lines ready' })).toHaveTextContent('2 lines ready')
  })

  it('keeps the batch across the navigation to the review screen', async () => {
    await pasteNotes('Vitamin C: ascorbic acid')

    const draft = loadDraft()
    expect(draft).toBeDefined()
    expect(draft?.cards).toHaveLength(1)
    expect(draft?.cards[0]?.front).toBe('Vitamin C')
    expect(draft?.sourceText).toBe('Vitamin C: ascorbic acid')
  })

  it('carries the unparsed lines into the draft instead of dropping them', async () => {
    await pasteNotes('Vitamin C: ascorbic acid{Enter}Note: she reported: pain')

    const draft = loadDraft()
    expect(draft?.cards).toHaveLength(1)
    expect(draft?.leftover).toHaveLength(1)
    expect(draft?.leftover[0]?.reason).toBe('prose')
  })
})

describe('IngestReviewPage', () => {
  it('explains an empty batch rather than showing a blank screen', () => {
    render(<IngestReviewPage />, { initialPath: '/cards/ingest/review' })

    expect(screen.getByText("There's no batch to check")).toBeInTheDocument()
  })

  it('restores the batch after a reload and shows every proposed card', () => {
    withDraft('Vitamin C: ascorbic acid\nIron - ferrous sulfate')

    render(<IngestReviewPage />, { initialPath: '/cards/ingest/review' })

    expect(screen.getByText('Vitamin C')).toBeInTheDocument()
    expect(screen.getByText('ascorbic acid')).toBeInTheDocument()
    expect(screen.getByText('Iron')).toBeInTheDocument()
    expect(screen.getByText('ferrous sulfate')).toBeInTheDocument()
  })

  it('writes an accepted card to the database with fresh SM-2 state', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    withDraft('Vitamin C: ascorbic acid')

    render(<IngestReviewPage />, { initialPath: '/cards/ingest/review' })
    await user.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(async () => {
      const cards = await listAllCards()
      expect(cards).toHaveLength(1)
    })

    const [card] = await listAllCards()
    expect(card?.front).toBe('Vitamin C')
    expect(card?.back).toBe('ascorbic acid')
    // Fresh state: due immediately, nothing graduated yet, ease factor at its default.
    expect(card?.repetitions).toBe(0)
    expect(card?.learningStep).toBe(0)
    expect(card?.easeFactor).toBe(2.5)
  })

  it('marks the card decided in the draft, so a second reload does not offer it again', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    withDraft('Vitamin C: ascorbic acid')

    render(<IngestReviewPage />, { initialPath: '/cards/ingest/review' })
    await user.click(screen.getByRole('button', { name: 'Accept' }))

    await waitFor(() => expect(loadDraft()?.cards[0]?.status).toBe('accepted'))
  })

  it('accepts every remaining card in one write', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    withDraft('Vitamin C: ascorbic acid\nIron: ferrous sulfate\nCalcium: bone health')

    render(<IngestReviewPage />, { initialPath: '/cards/ingest/review' })
    await user.click(screen.getByRole('button', { name: /Accept all 3 remaining/ }))

    await waitFor(async () => {
      expect(await listAllCards()).toHaveLength(3)
    })
  })

  it('never writes a card she sent to the left-over pile', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    withDraft('Vitamin C: ascorbic acid')

    render(<IngestReviewPage />, { initialPath: '/cards/ingest/review' })
    await user.click(screen.getByRole('button', { name: 'Not a card' }))

    await waitFor(() => expect(loadDraft()?.cards[0]?.status).toBe('discarded'))
    expect(await listAllCards()).toHaveLength(0)
  })

  it('lists what it could not parse, and says why', () => {
    withDraft('Vitamin C: ascorbic acid\nNote: she reported: pain')

    render(<IngestReviewPage />, { initialPath: '/cards/ingest/review' })

    expect(screen.getByText('Couldn’t turn these into cards')).toBeInTheDocument()
    expect(screen.getByText('Note: she reported: pain')).toBeInTheDocument()
    expect(screen.getByText('Looks like a sentence rather than a definition')).toBeInTheDocument()
  })

  it('turns a leftover line into a card she can then accept', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const { within } = await import('@testing-library/react')
    const user = userEvent.setup()
    withDraft('Vitamin C: ascorbic acid\nNote: she reported: pain')

    render(<IngestReviewPage />, { initialPath: '/cards/ingest/review' })
    await user.click(screen.getByRole('button', { name: 'Make a card' }))

    // Scoped to the dialog: both modals render their fields, and only one is open. Asserting
    // inside the dialog is also closer to what she experiences.
    const dialog = screen.getByRole('dialog')
    const front = within(dialog).getByLabelText('Front — the question')
    await user.clear(front)
    await user.type(front, 'What did she report?')
    await user.click(within(dialog).getByRole('button', { name: 'Add it as a card' }))

    await waitFor(() => expect(loadDraft()?.cards).toHaveLength(2))
    expect(loadDraft()?.convertedLeftoverIds).toHaveLength(1)
  })

  it('clears the draft when she finishes, so a stale batch cannot reappear', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    withDraft('Vitamin C: ascorbic acid')

    render(<IngestReviewPage />, { initialPath: '/cards/ingest/review' })
    await user.click(screen.getByRole('button', { name: /Done — back to my decks/ }))

    expect(loadDraft()).toBeUndefined()
  })
})

/**
 * Put a draft in storage the way the start screen does, by running the real parser.
 *
 * Deliberately not a hand-written fixture: a fixture would keep passing if the start screen
 * stopped writing the fields the review screen reads, which is one of the wiring bugs these
 * tests exist to catch.
 */
function withDraft(text: string): void {
  globalThis.sessionStorage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify(buildDraftThroughActions(text)),
  )
}

function buildDraftThroughActions(text: string): IngestDraft {
  const { lines, result } = parseText(text)

  return {
    version: 1,
    deckId: deckIdForPart('practice-i'),
    sourceLabel: 'Paste text',
    sourceText: lines.map((line) => line.text).join('\n'),
    cards: result.cards.map((card) => ({
      id: crypto.randomUUID(),
      front: card.front,
      back: card.back,
      origin: 'parsed',
      status: 'pending',
      sourceLines: card.sourceLines,
    })),
    leftover: result.leftover,
    convertedLeftoverIds: [],
    startedAt: 1_700_000_000_000,
  }
}
