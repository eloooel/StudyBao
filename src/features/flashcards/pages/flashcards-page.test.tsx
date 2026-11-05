import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { ToastProvider } from '@/components/ui/toast'
import {
  listAllCards,
  listCardsByDeck,
  listDeletedCards,
  softDeleteCard,
} from '@/db/repositories/cards'
import { listDecks, softDeleteDeck } from '@/db/repositories/decks'
import { countReviewLogs, listReviewLogsByDeck } from '@/db/repositories/review-logs'
import { deckIdForPart } from '@/db/seed-data'
import { getDb, seedInitialData } from '@/db/schema'
import type { Card, ReviewLog } from '@/db/types'
import { render, screen, waitFor, within } from '@/test/render'

import FlashcardsPage from './flashcards.page'

/**
 * Deleting and restoring a deck, through the screen that offers both.
 *
 * ## Why this is a page test and not a repository one
 *
 * `softDeleteDeck` and `restoreDeck` are already tested. What was missing is the **path**: a control
 * that opens a confirmation, a confirmation that actually deletes, and a deck that then leaves every
 * surface while her history survives — and, in the other direction, an affordance that appears only
 * when something is actually deleted, and one tap that brings the deck and its cards back. Those are
 * Layer 1 and Layer 3 facts, and the assertion that matters most on the delete side — that
 * `reviewLogs` is untouched — is the one a careless cascade would break silently.
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
  /*
   * Two dialogs can be mounted at once: this screen also has the "new deck" form, and that form's
   * part `<select>` contains **every** PRC part name — including the deck under test. So "the first
   * dialog whose text mentions this deck" is no longer necessarily the delete confirmation; it was
   * the closed form, and the assertion then waited ten seconds for a dialog that was open all along
   * one element later.
   *
   * Waiting for an **open** dialog that names the deck is the assumption-free version: the form is
   * closed unless she opened it, and the delete confirmation always names the deck it is asking about.
   */
  const findOpen = () =>
    [...document.querySelectorAll('dialog')].find(
      (element) => element.hasAttribute('open') && element.textContent?.includes(deckName) === true,
    )

  await waitFor(() => {
    expect(findOpen()).toBeDefined()
  }, WAIT)

  const dialog = findOpen()
  if (!dialog) throw new Error('The delete confirmation is not showing.')
  return dialog
}

/** Delete a deck the way she would, and wait until the list has re-read without it. */
async function deleteDeckFromList(
  user: ReturnType<typeof userEvent.setup>,
  deckName: string,
  confirm: string,
): Promise<void> {
  const row = await deckRow(deckName)
  await user.click(within(row).getByRole('button', { name: 'Delete deck' }))

  const dialog = await confirmDialog(deckName)
  await user.click(within(dialog).getByRole('button', { name: confirm }))

  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: deckName, level: 2 })).toBeNull()
  }, WAIT)
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
    /*
     * And it must not claim the delete is permanent. The restore row appears on this very screen, so
     * "This can’t be undone from here" would be false — the sentence this feature made obsolete.
     */
    expect(dialog).toHaveTextContent(/You can bring it back from here/)
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
    /*
     * The DOM assertion needs its own `waitFor`, and this is not belt-and-braces: `deleteDeck` fires
     * `notifyDataChanged()`, which re-reads **asynchronously**, so the database is up to date a
     * render before the list is. Asserting straight after the database check was a race that passed
     * until parallel load made it lose — it is what made this test flake.
     */
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: TARGET_NAME, level: 2 })).toBeNull()
    }, WAIT)

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

/**
 * Restoring a deck, through the affordance that offers it.
 *
 * `restoreDeck` is already tested. What these assert is the **screen**: that the row appears only
 * when something is actually deleted, that the number on it is the number the restore will deliver
 * (not "every card in the deck"), and that one tap puts the deck back with no dialog to dismiss
 * afterwards.
 */
describe('restoring a deck from the deck list', () => {
  beforeEach(async () => {
    await seedCardsInTargetDeck()
  })

  it('says nothing about restoring when nothing has been deleted', async () => {
    renderPage()

    // Wait for the list itself, so "no restore row" is a fact about a loaded screen.
    await screen.findByRole('heading', { name: TARGET_NAME, level: 2 }, WAIT)
    expect(screen.queryByText(/You deleted/)).toBeNull()
  })

  it('appears after a deck is deleted, naming the deck and its cards', async () => {
    const user = userEvent.setup()
    renderPage()

    await deleteDeckFromList(user, TARGET_NAME, 'Delete 3 cards')

    expect(await screen.findByText('You deleted 1 deck.', {}, WAIT)).toBeInTheDocument()
    expect(
      await screen.findByRole(
        'button',
        { name: 'Restore Nursing Practice V and its 3 cards' },
        WAIT,
      ),
    ).toBeInTheDocument()
  })

  it('brings the deck and the cards that delete took back, in one tap', async () => {
    const user = userEvent.setup()
    renderPage()

    await deleteDeckFromList(user, TARGET_NAME, 'Delete 3 cards')
    await user.click(
      await screen.findByRole('button', { name: /Restore Nursing Practice V/ }, WAIT),
    )

    await waitFor(async () => expect(await listDecks()).toHaveLength(5), WAIT)
    expect((await listDecks()).map((deck) => deck.id)).toContain(TARGET)
    // The cards came with it, which is the difference between a restored deck and an empty one.
    await waitFor(async () => expect(await listCardsByDeck(TARGET)).toHaveLength(3), WAIT)
    expect(
      await screen.findByRole('heading', { name: TARGET_NAME, level: 2 }, WAIT),
    ).toBeInTheDocument()
  })

  it('counts only the cards the delete took, not one she had already deleted herself', async () => {
    const user = userEvent.setup()
    /*
     * card-0 goes first, on its own, with an earlier stamp — the same shape as the repository test.
     * A count of "every card in this deck" would offer 3 cards and the restore would deliver 2,
     * which is the promise this test exists to stop.
     */
    await softDeleteCard('card-0', 1_700_000_000_000)
    renderPage()

    await deleteDeckFromList(user, TARGET_NAME, 'Delete 2 cards')

    const restore = await screen.findByRole(
      'button',
      { name: 'Restore Nursing Practice V and its 2 cards' },
      WAIT,
    )
    // Two, not three: the count matches the timestamp the delete wrote to both records.
    expect(
      screen.queryByRole('button', { name: 'Restore Nursing Practice V and its 3 cards' }),
    ).toBeNull()

    await user.click(restore)

    await waitFor(async () => expect(await listCardsByDeck(TARGET)).toHaveLength(2), WAIT)
    // And the card she deleted herself is still deleted. Restoring "everything in this deck" would
    // bring it back — the bug the repository guards, asserted here through the screen she uses.
    expect((await listDeletedCards()).map((card) => card.id)).toEqual(['card-0'])
  })

  it('takes the row away once restored, and leaves the deck on the list', async () => {
    const user = userEvent.setup()
    renderPage()

    await deleteDeckFromList(user, TARGET_NAME, 'Delete 3 cards')
    await user.click(
      await screen.findByRole('button', { name: /Restore Nursing Practice V/ }, WAIT),
    )

    await waitFor(() => expect(screen.queryByText(/You deleted/)).toBeNull(), WAIT)
    expect(
      await screen.findByRole('heading', { name: TARGET_NAME, level: 2 }, WAIT),
    ).toBeInTheDocument()
  })

  it('names only the deck when the restore would bring back no cards', async () => {
    const user = userEvent.setup()
    const db = await getDb()
    await db.cards.clear()
    renderPage()

    await deleteDeckFromList(user, TARGET_NAME, 'Delete this deck')

    // "and its 0 cards" would be a sentence about nothing; this deck restores empty.
    expect(
      await screen.findByRole('button', { name: 'Restore Nursing Practice V' }, WAIT),
    ).toBeInTheDocument()
  })
})

/**
 * The order the screen offers things in: a deck first, then cards from notes.
 *
 * "Add from your notes" files cards **into a deck**, so offering it with no deck to file them into
 * is a dead end. That dead end only became reachable when deck deletion shipped, because before it
 * the five seeded decks always existed.
 */
describe('a deck first, then cards from notes', () => {
  /** The form is a `<dialog>`: wait for `open` before any role query inside it. */
  function openDialog(marker: string): HTMLElement {
    const dialog = [...document.querySelectorAll('dialog')].find(
      (element) => element.hasAttribute('open') && element.textContent?.includes(marker) === true,
    )
    if (!dialog) throw new Error(`No open dialog containing "${marker}".`)
    return dialog
  }

  it('offers making a deck, and not the notes path, when there are no decks left', async () => {
    for (const deck of await listDecks()) await softDeleteDeck(deck.id, Date.now())
    renderPage()

    expect(await screen.findByRole('button', { name: 'New deck' }, WAIT)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add from your notes' })).toBeNull()
    expect(screen.getByText(/Start with a deck/)).toBeInTheDocument()
  })

  it('offers both, once a deck exists', async () => {
    renderPage()

    expect(
      await screen.findByRole('button', { name: 'Add from your notes' }, WAIT),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New deck' })).toBeInTheDocument()
  })

  it('makes a deck with the name she typed, in the part she chose', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'New deck' }, WAIT))
    const dialog = openDialog('New deck')

    await user.type(within(dialog).getByLabelText('Deck name'), 'Fluid and electrolytes')
    await user.selectOptions(within(dialog).getByLabelText('Which part is it for?'), 'practice-i')
    await user.click(within(dialog).getByRole('button', { name: 'Make the deck' }))

    await waitFor(async () => {
      const created = (await listDecks()).find((deck) => deck.name === 'Fluid and electrolytes')
      expect(created?.subject).toBe('practice-i')
    }, WAIT)
  })

  it('files a second deck into a part that already has one', async () => {
    // The point of ADR 0010: the seeded deck for a part is not a reason to refuse a new one.
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'New deck' }, WAIT))
    const dialog = openDialog('New deck')
    await user.type(within(dialog).getByLabelText('Deck name'), 'Second in part five')
    await user.selectOptions(within(dialog).getByLabelText('Which part is it for?'), 'practice-v')
    await user.click(within(dialog).getByRole('button', { name: 'Make the deck' }))

    await waitFor(async () => {
      const inPartV = (await listDecks()).filter((deck) => deck.subject === 'practice-v')
      expect(inPartV.length).toBe(2)
    }, WAIT)
  })
})
