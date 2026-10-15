import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { ToastProvider } from '@/components/ui/toast'
import { listAllCards, listCardsByDeck, listDeletedCards } from '@/db/repositories/cards'
import { listDecks } from '@/db/repositories/decks'
import { countReviewLogs, listReviewLogsByDeck } from '@/db/repositories/review-logs'
import { deckIdForPart } from '@/db/seed-data'
import { getDb, seedInitialData } from '@/db/schema'
import type { Card, ReviewLog } from '@/db/types'
import { render, screen, waitFor, within } from '@/test/render'

import FlashcardsPage from './flashcards.page'

/**
 * Deleting a deck, through the screen that offers it.
 *
 * ## Why this is a page test and not a repository one
 *
 * `softDeleteDeck` is already tested. What was missing is the **path**: a control that opens a
 * confirmation, a confirmation that actually deletes, and a deck that then leaves every surface
 * while her history survives. Those are Layer 1 and Layer 3 facts, and the assertion that matters
 * most — that `reviewLogs` is untouched — is the one a careless cascade would break silently.
 *
 * ## The `<dialog>` trap, which this file has to respect
 *
 * `Modal` keeps its children and its `footer` mounted while closed, and **role queries and text
 * queries disagree about a closed dialog**: `getByRole` honours the `display: none` a closed dialog
 * carries and finds nothing, while `getByText` finds the node anyway. So the dialog is located by a
 * text query and then waited for until it carries `open`, before any role query inside it — the same
 * flake `settings.test.tsx` records.
 */

const WAIT = { timeout: 10000 } as const

/** Nursing Practice V: the last part, so "the other four" is unambiguous. */
const TARGET = deckIdForPart('practice-v')
const TARGET_NAME = 'Nursing Practice V'

async function seedCardsInTargetDeck(): Promise<Card[]> {
  const db = await getDb()
  const now = 1_800_000_000_000

  const cards: Card[] = ['Alpha', 'Beta', 'Gamma'].map((front, index) => ({
    id: `card-${String(index)}`,
    deckId: TARGET,
    front,
    back: `${front} answer`,
    tags: [],
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    learningStep: 0,
    nextReview: now,
    createdAt: now,
    updatedAt: now,
  }))

  await db.cards.bulkPut(cards)

  // Her real history for this deck. `ReviewLog` is the thing that must outlive the deck.
  const logs: ReviewLog[] = cards.map((card, index) => ({
    id: `log-${String(index)}`,
    cardId: card.id,
    deckId: TARGET,
    reviewedAt: now - index * 1000,
    grade: 4,
    msSpent: 4200,
  }))
  await db.reviewLogs.bulkPut(logs)

  return cards
}

function renderPage() {
  return render(
    <ToastProvider>
      <FlashcardsPage />
    </ToastProvider>,
    { initialPath: '/cards' },
  )
}

/** The row for one deck, found by its heading. */
async function deckRow(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name, level: 2 }, WAIT)
  const row = heading.closest('li')
  if (!row) throw new Error(`No list row for the deck "${name}".`)
  return row
}

/**
 * The confirmation dialog, waited for until it is genuinely open.
 *
 * The dialog's own title is in the DOM whether or not it is open, so this cannot assert on copy
 * alone. It waits for the `open` attribute, which is what makes a role query inside it safe.
 */
async function confirmDialog(deckName: string): Promise<HTMLElement> {
  await waitFor(() => {
    const dialog = [...document.querySelectorAll('dialog')].find((element) =>
      element.textContent?.includes(deckName),
    )
    expect(dialog?.hasAttribute('open')).toBe(true)
  }, WAIT)

  const dialog = [...document.querySelectorAll('dialog')].find((element) =>
    element.textContent?.includes(deckName),
  )
  if (!dialog) throw new Error('The delete confirmation is not showing.')
  return dialog
}

describe('deleting a deck from the deck list', () => {
  beforeEach(async () => {
    await seedCardsInTargetDeck()
  })

  it('asks first, naming the deck and how many cards are going', async () => {
    const user = userEvent.setup()
    renderPage()

    const row = await deckRow(TARGET_NAME)
    await user.click(within(row).getByRole('button', { name: 'Delete deck' }))

    const dialog = await confirmDialog(TARGET_NAME)

    // The count is the point: "delete" on a deck of 400 is not the same act as on a deck of one.
    expect(dialog).toHaveTextContent(/Its 3 cards go with it/)
    // Named, not "this deck".
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent(
      `Delete ${TARGET_NAME}?`,
    )
    // And the true statement about her history, which is the one a destructive confirm usually gets
    // wrong. Losing her streak and lapse counts is the failure this sentence exists to describe.
    expect(dialog).toHaveTextContent(/Your review history stays/)

    // Nothing has happened yet.
    expect(await listDecks()).toHaveLength(5)
    expect(await listCardsByDeck(TARGET)).toHaveLength(3)
  })

  it('writes nothing when she keeps the deck', async () => {
    const user = userEvent.setup()
    renderPage()

    const row = await deckRow(TARGET_NAME)
    await user.click(within(row).getByRole('button', { name: 'Delete deck' }))

    const dialog = await confirmDialog(TARGET_NAME)
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))

    const db = await getDb()
    expect(await listDecks()).toHaveLength(5)
    expect(await listCardsByDeck(TARGET)).toHaveLength(3)
    expect((await db.decks.get(TARGET))?.deletedAt).toBeUndefined()
  })

  it('takes the deck off the list, tombstones its cards, and keeps every review log', async () => {
    const user = userEvent.setup()
    const logsBefore = await countReviewLogs()
    renderPage()

    const row = await deckRow(TARGET_NAME)
    await user.click(within(row).getByRole('button', { name: 'Delete deck' }))

    const dialog = await confirmDialog(TARGET_NAME)
    await user.click(within(dialog).getByRole('button', { name: 'Delete 3 cards' }))

    // 1. Gone from the deck list, and the other four are not.
    await waitFor(async () => expect(await listDecks()).toHaveLength(4), WAIT)
    expect((await listDecks()).map((deck) => deck.id)).not.toContain(TARGET)
    expect(screen.queryByRole('heading', { name: TARGET_NAME, level: 2 })).toBeNull()

    // 2. Its cards stop appearing, and the rows are still there as tombstones rather than deleted.
    const db = await getDb()
    expect(await listCardsByDeck(TARGET)).toHaveLength(0)
    expect(await listAllCards()).toHaveLength(0)
    expect(await db.cards.count()).toBe(3)
    expect(await listDeletedCards()).toHaveLength(3)

    // 4. **Every review log survives.** This is the assertion that catches a careless cascade:
    //    that history is her streak and her lapse counts, and it cannot be reconstructed.
    expect(await countReviewLogs()).toBe(logsBefore)
    expect(await listReviewLogsByDeck(TARGET)).toHaveLength(3)
  })

  it('leaves her review history intact even though the deck is gone', async () => {
    const user = userEvent.setup()
    const logsBefore = await countReviewLogs()
    renderPage()

    const row = await deckRow(TARGET_NAME)
    await user.click(within(row).getByRole('button', { name: 'Delete deck' }))
    const dialog = await confirmDialog(TARGET_NAME)
    await user.click(within(dialog).getByRole('button', { name: 'Delete 3 cards' }))

    await waitFor(async () => expect(await listDecks()).toHaveLength(4), WAIT)

    const logs = await listReviewLogsByDeck(TARGET)
    expect(logs).toHaveLength(3)
    expect(await countReviewLogs()).toBe(logsBefore)
    // Append-only and untouched: the rows still carry what they always carried.
    expect(logs.map((log) => log.cardId).sort()).toEqual(['card-0', 'card-1', 'card-2'])
  })

  it('says nothing goes with an empty deck, rather than claiming zero cards', async () => {
    const user = userEvent.setup()
    const db = await getDb()
    // Empty the deck first: this is the other confirmation, and its wording has to differ.
    await db.cards.clear()
    renderPage()

    const row = await deckRow(TARGET_NAME)
    await user.click(within(row).getByRole('button', { name: 'Delete deck' }))

    const dialog = await confirmDialog(TARGET_NAME)
    expect(dialog).toHaveTextContent(/It’s empty, so nothing goes with it/)
    expect(within(dialog).getByRole('button', { name: 'Delete this deck' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Delete this deck' }))

    await waitFor(async () => expect(await listDecks()).toHaveLength(4), WAIT)
  })

  it('does not resurrect the deleted deck on the next launch — the seeding gate', async () => {
    const user = userEvent.setup()
    renderPage()

    const row = await deckRow(TARGET_NAME)
    await user.click(within(row).getByRole('button', { name: 'Delete deck' }))
    const dialog = await confirmDialog(TARGET_NAME)
    await user.click(within(dialog).getByRole('button', { name: 'Delete 3 cards' }))

    await waitFor(async () => expect(await listDecks()).toHaveLength(4), WAIT)

    const db = await getDb()
    const tombstone = (await db.decks.get(TARGET))?.deletedAt
    expect(tombstone).toBeDefined()

    // Next launch. Seeding runs again on every `getDb()`, and it must add nothing: the gate is
    // `settings.seededAt`, deliberately not "are there any decks". This is the assertion that fails
    // if anyone ever "fixes" seeding by re-seeding when the deck count looks wrong — which would
    // mean a deck she deleted silently coming back, the local-first bug this codebase is most
    // careful about.
    await seedInitialData(db, Date.now() + 60_000)

    expect(await listDecks()).toHaveLength(4)
    expect((await db.decks.get(TARGET))?.deletedAt).toBe(tombstone)
    // The row is still there — a tombstone, not a removal — which is what stops the other device
    // resurrecting it once Workflow S exists.
    expect(await db.decks.count()).toBe(5)
  })
})
