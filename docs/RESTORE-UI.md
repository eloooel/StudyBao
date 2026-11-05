# Prompt — give her a way back to a deck she deleted

Hand this to a fresh agent. **The data layer already exists and is tested.** This is the affordance on
top of it: today `restoreDeck` works and nothing in the app can reach it.

---

You are picking up **StudyBao**, a PNLE study app for one person. Her exam is **Friday 26 February
2027**. The app is live and she uses it.

## Read first

1. `src/db/repositories/decks.ts` — **`restoreDeck` is already written**, along with `softDeleteDeck` and
   `listDeletedDecks`. Read the doc comments: they carry the correctness argument you must not break.
2. `src/db/repositories/decks.test.ts` — the restore tests, including the one that proves a card she
   deleted **herself** is not resurrected.
3. `src/features/flashcards/pages/flashcards.page.tsx` — the deck list page, already holding the delete
   confirmation and the "new deck" form.
4. `src/features/flashcards/components/deck-list-view.tsx` — the pure view it renders.
5. `src/features/flashcards/hooks/use-decks-data.ts` — how this screen gets its data.
6. [`docs/adr/0010-several-decks-per-part.md`](adr/0010-several-decks-per-part.md) — the deck model.
   Skim; it matters only for the fact that a part can hold several decks.

## The design decision, already made — and why not the obvious one

**A quiet "Restore" affordance on the Cards screen, shown only when something is actually deleted.** Not
an Undo toast.

An Undo toast is the reflex answer and it is worse here. A toast is **time-limited**, and a missed toast
is a _permanent_ loss — which is exactly the hole being closed. A six-second window is also the wrong
shape for a destructive act on a device she uses in bursts, days apart. The conditional affordance is
**durable** (works days later) _and_ **discoverable at the moment it matters**, because it appears on the
screen she is already looking at when the deck is missing — with wording that explains itself, so she
does not need to have known the feature existed.

And because it renders **only when there are tombstones**, it is not clutter: in normal use the Cards
screen is unchanged.

## What to build

### 1. `listRestorableDecks()` — and the count belongs next to `restoreDeck`

Add to `src/db/repositories/decks.ts`:

```ts
export interface RestorableDeck {
  deck: Deck
  /** How many cards this restore would actually bring back. */
  cardCount: number
}

export async function listRestorableDecks(): Promise<RestorableDeck[]>
```

**The card count must use the same predicate as `restoreDeck`: `card.deletedAt === deck.deletedAt`.**

Not "all cards in the deck" — that is the bug the restore tests already guard, and a count that used it
would promise cards the restore will not deliver. Putting the count beside the restore is the point: one
place states the rule, so the number she is shown cannot drift from the number she gets. Say in a comment
that this is why it lives here and not in the view.

Do **not** change `listDeletedDecks`'s semantics — it is documented as "what Workflow S will push", so
its shape is a sync contract, not a UI detail.

### 2. Feed it through the hook

Add `restorable: RestorableDeck[]` to `DecksData` in `use-decks-data.ts` and load it in the same
`loadDeckSummaries` pass. It already uses `useDatabaseValue`, so the same change signal re-reads it —
which is what makes the row disappear the instant a restore succeeds. Do not add a second live query with
its own subscription; two subscriptions to one signal is how they go out of step.

### 3. The view — Layer 3, pure

In `deck-list-view.tsx`, render a small card **above the deck list** and only when `restorable.length > 0`.

Required props: `restorable`, `onRestoreDeck: (deck: Deck) => void`. Add them to `DeckListViewProps` in
`src/features/flashcards/types.ts`, beside `onDeleteDeck` and with the same "this view cannot do it
itself" framing — the handler is called, the view does not touch the database.

Copy, in her voice — warm, plain, no guilt, and **no exclamation mark**:

- one: **"You deleted 1 deck."** / several: **"You deleted 2 decks."**
- per row: a **Restore** button naming the deck — `Restore Nursing Practice V` — with the cards stated
  when there are any: **"…and its 3 cards"**. When `cardCount` is 0 the deck is restored empty, so say
  only the deck rather than "and its 0 cards".
- one true reassurance, if and only if you confirm it is true in the code: **nothing is ever permanently
  removed** — deletes are tombstones and there is no purge anywhere. Check before you write it; if it is
  not true, leave it out.

### 4. Wire the page

In `flashcards.page.tsx`, add `restoreDeck` to `useDeckActions`, pass `restorable` through, and have
`onRestoreDeck` call it. **She stays on the Cards screen** — the deck reappears in the list as the shared
signal re-reads, and no dialog needs dismissing afterwards.

Do **not** reuse the delete confirmation `Modal` for restore. Undoing is not destructive and must not
cost a confirmation; a single tap is correct, and the asymmetry with delete is the point.

## Tests, and the two probes that matter

Extend `src/features/flashcards/pages/flashcards-page.test.tsx` — it already has the deletion flows, the
`openDialog` helper and the WAIT conventions. Follow its header notes about the `<dialog>` asymmetry.

1. **It appears only when something is deleted.** With no tombstones, nothing says "You deleted". Delete
   a deck, and the row naming it appears.
2. **Restoring brings the deck back onto the list, and its cards back.** Assert `listCardsByDeck` after.
3. **The count is the timestamp-matched one.** The test that matters: delete one card individually,
   _then_ delete the deck, and assert the affordance says **one** card — not two — and that after
   restoring, the individually-deleted card is **still deleted**. This is the same rule the repository
   tests cover, asserted through the screen she actually sees.
4. **The affordance disappears after restoring**, and the deck is back in the list.

Then **two red probes**, restored byte-identical and reported:

- change the count predicate to "all cards in the deck" → test 3 must go red;
- drop the `notifyDataChanged()` from the restore path → the row must fail to disappear, so test 4 goes
  red.

If a probe does not go red, say so rather than tuning the probe until it does.

## What not to do

- **No permanent delete / purge.** Tombstones are the sync contract. Do not add a "remove forever".
- **Do not change `softDeleteDeck` or `restoreDeck`.** They are tested; the work is the affordance.
- **Do not touch `ReviewLog`.** It is append-only and untouched by deck deletion, deliberately.
- No new dependency. No `confirm()`; use the existing primitives.

## Verify

```bash
npm run typecheck && npm run lint:check && npx prettier --check .
npm run test:coverage
npm run build
```

All must pass. **Check `git status` first, stage only your own files by path, never `git add -A`, never
`--no-verify`.** One branch, one PR.

**One run at a time** — `coverage/` is shared scratch and concurrent runs clobber it.

## What you cannot verify, and must say so

No agent in this project has a browser or a device. So state plainly:

- that you have not seen the row rendered, and where it lands relative to the deck list;
- whether the wording reads as _warm_ rather than as a reproach — that is a judgement only the owner can
  make, and "You deleted 1 deck" is a sentence that could easily sound like an accusation;
- that restore is comfortable under a thumb on an iPad.

## Report back

1. The copy you settled on, verbatim.
2. Both probe results, with what failed.
3. Whether the "nothing is ever permanently removed" line is actually true in this codebase, and what you
   checked to decide.
4. Anything you found wrong in `restoreDeck` or `listDeletedDecks` while wiring them up. **Do not fix it
   silently** — report it.
