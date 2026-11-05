# Prompt — make the restore row quiet by default

Hand this to a fresh agent. It is a small behaviour change with a lot of test churn, which is why it is
specified precisely.

---

You are picking up **StudyBao**, a study app for one non-technical person. Her exam is **Friday 26
February 2027**.

## The bug, stated plainly

The Cards screen has a restore row that lists decks she has deleted. **It renders expanded by default**,
and she asked for the opposite: it should start collapsed, with expanding being her choice.

`src/features/flashcards/hooks/use-decks-data.ts` is why:

```ts
restoreCollapsed: restorable.length > 0 && newestDeletedAt <= (settings.restoreRowCollapsedAt ?? 0)
```

An absent setting reads `0`, and a real `deletedAt` is always greater, so `restoreCollapsed` is `false`
and the full card renders. Today the row is only collapsed _after_ she presses Hide.

## Read first

1. `src/features/flashcards/hooks/use-decks-data.ts` — `restoreCollapsed` and its doc comment.
2. `src/features/flashcards/hooks/use-settings.ts` — `setRestoreRowCollapsed`.
3. `src/features/flashcards/components/deck-list-view.tsx` — the two shapes, already written.
4. `src/features/flashcards/pages/flashcards-page.test.tsx` — the `describe` blocks for restoring and for
   collapsing.

## The decisions, already made — do not re-decide them

1. **The default is collapsed.** With nothing ever set, deleting a deck shows `1 deck deleted` and a
   **Show** button — not the full card.
2. **Expanding is sticky.** Pressing Show keeps it expanded across a reload; pressing Hide collapses it
   again. This is a persisted preference, not a `useState`, because a toggle that forgets is not a toggle.
3. **The timestamp becomes a boolean.** `restoreRowCollapsedAt` exists **only** to power "a deletion newer
   than this re-expands the row", which was a patch for an expanded default. Once expanding is a
   deliberate press that comparison has nothing to do, and a field nobody reads is the speculative state
   this repo bans. So: `restoreRowExpanded?: boolean`, where **absent or false means collapsed**.
4. **The re-expand behaviour is removed on purpose.** A new deletion while collapsed must **not** expand
   the row — otherwise the quiet default is undone by the first mistake, which is the nagging she asked to
   stop.

## What to change

### `src/db/types.ts`

Replace the `restoreRowCollapsedAt?: number` field on `AppSettings` with:

```ts
/** Absent or false means collapsed, which is the default. */
restoreRowExpanded?: boolean
```

Rewrite its doc comment: absent means **collapsed**, `true` means expanded, and there is no timestamp
because nothing compares against one.

**No Dexie version bump and no migration.** `settings` is indexed on `id` only, so this is not an index
change. An existing settings row still carries the old `restoreRowCollapsedAt`; it becomes inert, and you
must **leave it alone** — do not migrate, do not delete it, do not read it.

### `src/features/flashcards/hooks/use-decks-data.ts`

- `restoreCollapsed: restorable.length > 0 && settings.restoreRowExpanded !== true`
- **Delete `newestDeletedAt`** and the `reduce` that builds it. Nothing else reads it, and it existed only
  for the comparison you are removing.
- Rewrite the `restoreCollapsed` doc comment, which currently explains the timestamp rule in detail.
- Set `restoreCollapsed: true` in `EMPTY_DECKS` — the loading default should be the collapsed default.

### `src/features/flashcards/hooks/use-settings.ts`

Rename `setRestoreRowCollapsed(collapsed)` to `setRestoreRowExpanded(expanded)`, writing
`{ restoreRowExpanded: expanded }`.

**Keep the `notifyDataChanged()` call and its comment.** Without it the toggle is a silent no-op — the
row never re-reads — and that is the bug a page test caught when this was first built. The lesson should
survive the rename rather than being dropped with the name.

### `src/features/flashcards/pages/flashcards.page.tsx`

```tsx
onToggleRestoreRow={() => void setRestoreRowExpanded(restoreCollapsed)}
```

Expanded **is** "currently collapsed", so there is no negation to misread.

`deck-list-view.tsx` needs no change: it already takes `restoreCollapsed` and renders the two shapes.

## Tests — the churn is most of the work

In `flashcards-page.test.tsx`, these tests currently expect the **expanded** card immediately after a
delete, and will fail. Each needs a single **Show** click inserted after the delete, not a rewrite:

- `appears after a deck is deleted, naming the deck and its cards`
- `brings the deck and the cards that delete took back, in one tap`
- `counts only the cards the delete took, not one she had already deleted herself`
- `takes the row away once restored, and leaves the deck on the list`
- `names only the deck when the restore would bring back no cards`
- `deletes a deck forever, and keeps her review history` — the purge button lives inside the expanded card

Then:

- **Add** a test that pins the default: after deleting, with **no interaction at all**, `1 deck deleted`
  is on screen and `queryByRole('button', { name: /Restore / })` is `null`. This is the assertion the
  defect fails.
- **Replace** `expands again by itself when a deck is deleted after she hid it` with the opposite:
  delete one deck, press Hide, age the settings value if you need to, delete a second deck, and assert the
  row is **still collapsed** and says `2 decks deleted`.
- Update `collapses to one line, and remembers it` and `comes back when she presses Show, and clears the
dismissal with it` to the new field name and semantics — "clears the dismissal" becomes "sets expanded
  back to false".

**Red checks, each restored byte-identical and reported:**

- restore the old default (make `restoreCollapsed` ignore the setting) → the new default test must fail;
- drop `notifyDataChanged()` from the renamed action → the Show-persists test must fail.

## Docs

`docs/HANDOFF.md` §6 has a bullet that this change makes **false**. It currently says:

> **The restore row collapses, and a new deletion re-expands it.** `settings.restoreRowCollapsedAt` is a
> **timestamp, not a flag** … a deck deleted after she hid the row brings it back on its own.

Rewrite it: the default is collapsed, the field is a boolean, the re-expand was removed deliberately, and
the persistence is a plain toggle. **Keep** the last sentence about `notifyDataChanged()` — it is still
true and still the thing most likely to be broken again.

No ADR: a UI default is not an architecturally expensive decision.

## What not to do

- Do not migrate or delete the old `restoreRowCollapsedAt` value.
- Do not add a Dexie version bump.
- Do not keep `newestDeletedAt` "in case it is useful".
- Do not change the `"1 deck deleted"` / `"You deleted 1 deck."` wording. **The owner has read it and
  settled it as correct** — this is not a deferred question, so do not soften it, do not add a cushion,
  and do not flag it as pending. Leave both strings exactly as they are.
- Do not make expanding session-only state.

## Verify

```bash
npm run typecheck && npm run lint:check && npx prettier --check .
npm run test:coverage
npm run build
```

**One vitest run at a time** — `coverage/` is shared scratch and concurrent runs clobber it. **Check
`git status` first, stage only your own files by path, never `git add -A`, never `--no-verify`.** One
branch, one PR.

## What you cannot verify, and must say so

- You have not seen it rendered — only its jsdom DOM.
- **Whether a one-line `1 deck deleted` is discoverable enough** for her to recover a mistake is the
  owner's judgement, and it is the trade being made for a quieter screen. Say that in the PR rather than
  claiming the change is unambiguously better.

## Report back

1. Both probe results, with the failing test named.
2. Every test you had to touch beyond the listed six, and why.
3. Anything in the removed timestamp logic that was doing a job nobody noticed.
