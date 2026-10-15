# Prompt — three reported bugs: the black calendar, the un-clearable number fields, and deleting a deck

Hand this to a fresh agent. **Three unrelated changes**, one report each. Plan first and stop.

Written at commit `474ecb4`. Do not trust that hash — run `git log --oneline -6`.

---

You are picking up **StudyBao**, a study companion for one person's PNLE review. Her exam is
**Friday 26 February 2027**. The app is live at `https://study-bao.vercel.app` and she is using it.

## Read these first

1. `CLAUDE.md` — the rules, the voice, and the toolchain constraints
2. `docs/HANDOFF.md` §6 ("Things that are true and easy to forget")
3. `src/styles/theme.css` — the only place design tokens live
4. `src/components/ui/empty-state.tsx`, `src/components/layout/app-shell.tsx`

## The standing rules for this task

- **Three separate changes. Three branches, three PRs, in this order: theme → inputs → deck deletion.**
  They are unrelated, and a reviewer should not have to disentangle them. If you think two belong
  together, say so in your plan before you start.
- **The app is deployed and she is using it.** Every change goes through a PR; CI must be green.
- **Never weaken a check to get green.** Report failures honestly.
- Show your work for anything visual: I have no browser and you may not either. If you cannot see the
  rendered result, say so explicitly rather than asserting it renders correctly.

---

## Change 1 — the black calendar glyph (do this first, it is the smallest)

### What she reported

> "the calendar vector in the lessons tab is color black when in dark mode and in light mode, fix that
> so it can still be visible on dark mode"

### What I already verified, so you do not have to

I checked the obvious causes and **eliminated all of them**. Do not go hunting in these places:

- `src/components/icons.tsx` — the shared `Svg` wrapper already sets `stroke="currentColor"`, and there
  are **no** hardcoded colours anywhere in that file.
- The night token block at `src/styles/theme.css:77` overrides `--color-ink`, `--color-ink-muted`,
  `--color-ink-faint`, `--color-line`, `--color-canvas` and `--color-surface`. Nothing is missing.
- The nav icon at `src/components/layout/app-shell.tsx:114` is
  `cn('size-6', isActive ? 'text-accent' : 'text-ink-faint')`. `--color-ink-faint` on night's
  `--color-surface` computes to about **4.7:1**, which is visible.
- The empty-state icon at `src/features/tracker/components/tracker-view.tsx:94` sits in a slot that is
  explicitly `text-ink`, and night's `--color-ink` is `#f6e7ea`. Also visible.

### The likely cause, and why it fits the report exactly

**`color-scheme` is declared nowhere in the codebase.** I grepped for it: the only match is
`prefers-color-scheme` in `src/lib/theme.ts`, which is a media query and not the same thing.

There are two native date inputs — **`src/features/tracker/components/lesson-form-view.tsx:154`** (the
lessons tab) and `src/features/settings/components/settings-view.tsx:84` — and an
`<input type="date">`'s **calendar picker indicator is drawn by the browser, not by our CSS**. With no
`color-scheme` declared, WebKit renders that control in its **light-mode user-agent styling**, so the
glyph comes out dark **no matter which theme is active**, and `color: var(--color-ink)` cannot reach it.
That is exactly "black in dark mode _and_ light mode", and exactly why she cannot fix it by theming.

### The fix

Declare the scheme on both theme roots in `src/styles/theme.css`:

```css
:root {
  color-scheme: light;
}
:root[data-theme='night'] {
  color-scheme: dark;
}
```

`color-scheme` is the standards-based fix and it corrects the **whole class**, not just this one glyph:
the date picker's own popup and text, scrollbars, autofill styling, and the native `<dialog>` backdrop
that `src/components/ui/modal.tsx` relies on. Prefer it to a
`::-webkit-calendar-picker-indicator { filter: ... }` hack, which fixes one pixel and nothing else — and
if you find you need the hack _as well_ on iOS Safari, say so and show the evidence.

**Confirm which glyph she means before you change anything.** My reasoning points at the native date
input, but I have not seen the screen. **Ask for a screenshot** — or state plainly in your report that
you changed `color-scheme` on the reasoning above and could not visually confirm which element she
meant. If it turns out to be the nav icon at `app-shell.tsx:114` instead, then my diagnosis is wrong,
the cause is different, and **you must report that rather than forcing this fix to fit.**

### Tests

`color-scheme` is a CSS declaration and jsdom does not apply stylesheets, so there is nothing
meaningful to unit-test. Do not invent a test that reads the CSS file and asserts a string — that is a
test that cannot go red for the right reason. Say in your report that this change is verified by
inspection only, and list the things someone should look at on a device (the date field in the lessons
tab and in Settings, a scrollbar, and a modal).

---

## Change 2 — the number fields she cannot clear

### What she reported

> "the focus timer setting is buggy, it does not allow me to remove the type in 4, it does not remove
> the first number in the text, what if i want my short break to be only 3 mins?"

### The bug, exactly

There is a shared number field in `src/features/settings/components/settings-view.tsx` (around line 283) which renders:

```tsx
value={minutes}
onChange={(event) => {
  const parsed = Number(event.target.value)
  // Ignore an empty field or an out-of-range value rather than writing it: the input keeps
  // showing what she typed, and nothing invalid reaches the database.
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 180) onCommit(Math.round(parsed))
}}
```

**That comment is false, and the false comment is why the bug exists.** The input is _controlled_ to
`minutes`. When she clears the field, `event.target.value` is `''`, `Number('')` is `0`, the guard
rejects it, `onCommit` is never called, `minutes` does not change — and React immediately writes the
old value back into the DOM. **So the field cannot be emptied, and the last remaining digit reappears
as soon as she deletes it.** Which is precisely what she described.

That a short break of 3 is rejected is _not_ the problem: the bounds are `1..180`, so 3 is legal. The
**control** will not let her enter it.

### Four call sites, and a second bug in the same component

The shared field is used four times, at lines 140, 145, 150 and 155:

| Label                      | Value                   | Valid range   |
| -------------------------- | ----------------------- | ------------- |
| Focus                      | `workMin`               | 1–180         |
| **Short break**            | `breakMin`              | 1–180         |
| Long break                 | `longBreakMin`          | 1–180         |
| **Blocks to a long break** | `cyclesBeforeLongBreak` | **not 1–180** |

**The second bug: the component hardcodes `min={1} max={180}` for all four**, so "Blocks to a long
break" currently accepts 180. That is nonsense, and it is a real defect she has not reported. Give each
field its own bounds, and choose the cycle bound deliberately — read `src/features/timer/` for what the
timer actually does with it before picking a number, and say in your report what you chose and why.

The cram threshold input at line 107 has **the same defect** (inline, `value={cramThresholdDays}`, same
guard). Fix it too — ideally by reusing the corrected field rather than adding a second copy.

### The fix

Let the field hold **raw text** while she is typing, and validate when she commits:

- local state holding the string; allow empty and partial input (so the field can be cleared)
- commit on **blur and Enter**, clamping to that field's bounds; revert to the last valid value on blur
  if the text is not a number
- sync the local text from the prop when it changes from outside
- keep a numeric keyboard on iOS: `inputMode="numeric"`. `type="number"` is optional — if you keep it,
  keep it for the keyboard and still allow the empty string
- **do not silently revert while she is typing.** If a value is out of range, say so — an error message
  or a clamped value on commit. Silence is what made this a bug report.

### Acceptance, and write it as a test

**The acceptance criterion is literally her sentence: she can set Short break to 3.** Cover at least:

- clearing the field leaves it empty (the regression she hit)
- typing a value and blurring commits it
- an out-of-range value does not silently revert mid-typing
- the cycles field rejects a value that is valid for Focus
- Enter commits as well as blur

These are Layer 3 component tests. Note that `src/features/settings/pages/settings.test.tsx` and
`backup-card.test.tsx` already exercise this file — **check the existing tests before adding new ones,
and do not weaken an assertion to make your change pass.**

**Beware the `<dialog>` query asymmetry** if you touch a modal: `getByRole` respects accessibility and
finds **nothing** inside a closed dialog, while `getByText`/`findByText` do find the nodes. Wait for the
`open` attribute before any role query inside a dialog. See `docs/HANDOFF.md` §6.

---

## Change 3 — delete a deck (this is the one that is a feature)

### What she asked for

> "we need to create a feature that enables us to delete decks"

### Most of it already exists — do not rewrite it

`src/db/repositories/decks.ts` already has:

- **`softDeleteDeck(id, now)`** (line 46) — soft-deletes the deck **and tombstones its cards in the same
  transaction**, with the reasoning documented at lines 39–45: `deletedAt` on both is what stops the
  other device resurrecting either.
- `listDeletedDecks()` (line 67), using the `deletedAt` index rather than filtering the whole table in
  JS.
- Read paths already filter tombstones (`isLive`).

**So this is a UI wiring job.** Call `softDeleteDeck`. **Do not write a second deletion path**, and do
not hard-delete anything.

### Three constraints that will bite you if you do not know them

1. **Never hard-delete a synced record.** `CLAUDE.md` is explicit: hard deletes are resurrected by the
   other device. The soft delete already handles the deck and its cards.
2. **`reviewLogs` is append-only and must not be touched.** It has no `updatedAt` and no `deletedAt` by
   design, and Workflow S must merge it union-only. Deleting a deck must **not** delete or tombstone her
   review history — that is her streak and her lapse counts. `softDeleteDeck` correctly leaves it alone;
   keep it that way.
3. **A deleted deck must not come back, and it already will not.** `src/db/schema.ts:221` documents that
   seeding is gated on **`settings.seededAt`, deliberately not on "are there any decks"**, "so a deck she
   deletes is a real deletion rather than something the next launch silently undoes"
   (`seedInitialData`, line 225, returns early if `seededAt` is set). **Read that comment, write a test
   that pins the behaviour, and do not change the gate.** The tempting "fix" — re-seed when the deck
   count is zero — is exactly the bug that comment exists to prevent, and it would mean deleting all five
   seeded decks silently restores them on the next launch.

### What to build

- A delete control on the deck surfaces: `deck-list-view.tsx` and `deck-detail-view.tsx` (and decide
  whether one is enough — say which and why in your plan).
- **A confirmation step.** `CLAUDE.md` is explicit that destructive steps intentionally cost more, and
  the same rule already governs import. Use the existing `Modal` primitive. It must name the deck and say
  how many cards are going, because "delete" on a deck of 400 cards is not the same act as on a deck of
  one.
- **Reuse the existing confirm pattern if one exists** — search for how the backup import confirms
  before it writes, and match it. Do not invent a second idiom.
- Copy in her voice: warm, never clinical, never guilt-inducing. Never "are you sure?" with no reason.
- After deletion, send her somewhere sensible (the deck list) and make sure the deck is gone from every
  surface: the deck list, Today's deck count, and any deck picker.

### Tests, and the red check

- The repository layer is already tested; **test the UI path**: the deck disappears from the list, its
  cards stop appearing, and **the review logs survive** (assert the count directly — that is the
  assertion that catches a careless cascade).
- **Confirm at least one test goes red** by removing the tombstone filter from a read path, or by making
  the delete write `deletedAt` only on the deck and not the cards. State which one you used.
- Add the seeding-gate test described in constraint 3.

---

## Do not touch cram mode

She asked what cram mode does, so here is the answer — **it is implemented and it is working. Change
nothing about it.**

Cram mode is a review-queue override for the final sprint:

- **It is automatic once the exam is inside a threshold** — `cramThresholdDays`, default 30, a setting
  she can change (and the field you are fixing in Change 2). `src/features/flashcards/lib/cram.ts`:
  `active: !forceDue && days !== undefined && days <= settings.cramThresholdDays`. With no exam date
  there is no countdown, so it stays off.
- **It ignores due dates entirely.** That is the whole feature: rather than waiting for the spacing
  schedule, it serves whatever she is worst at.
- **It orders by weakness × staleness** — `cramScore = (lapses + 1) × daysSinceLastTouched`
  (`queue.ts:53`). Never-reviewed cards come first, which is why `+ 1` is there: without it a card with
  no lapses would score 0 and sort last, which is backwards. Staleness for a never-reviewed card is
  measured from `createdAt`, never `Infinity`, because `Infinity - Infinity` is `NaN` and would make the
  ordering non-deterministic.
- Ties break on deck order then card id, so the queue is deterministic.
- There is a **manual override** (`forceDue`) for the day she would rather see only what is genuinely
  due.

It is a deliberate degradation of the spacing schedule during the sprint, accepted in ADR 0003. **If
your deck-deletion change alters `deckOrder`, check `orderForCram`'s tie-breaking still holds** — the
deck order matters to cram's determinism — and say so in your report.

---

## Verify, and be honest about what you cannot verify

```bash
npm install --cache .npm-cache     # only if node_modules is missing
npm run typecheck && npm run lint:check && npx prettier --check .
npm run test:coverage
npm run build && npm run preview
```

All must pass. **One run at a time** — `coverage/` is shared scratch and concurrent runs clobber it.

**Check `git status` first and stage only your own files by path.** Never `git add -A`. Get your staged
files lint-clean; the pre-commit hook will reject you otherwise. **Never use `--no-verify` and never
push to `main`.**

**Then say plainly what you did not verify.** No agent in this project has a browser or a device, so:

- whether the calendar glyph is actually fixed, and _which_ glyph she meant
- whether the number field behaves correctly **on iOS Safari**, where the on-screen numeric keyboard and
  controlled-input timing differ from jsdom. The logic is testable; the feel is not.
- whether the delete flow is reachable and sensible on a touch device
- anything to do with the live deployment

## Before you write code

Reply with: **(1)** the three branches and what each changes, **(2)** for Change 1, whether you accept my
`color-scheme` diagnosis or have evidence against it, **(3)** for Change 2, your chosen bounds for
"Blocks to a long break" and the reasoning, **(4)** for Change 3, exactly where the delete control goes
and what the confirmation says word for word, and **(5)** anything you think is wrong with the above.

Then **stop and wait for a go-ahead.**
