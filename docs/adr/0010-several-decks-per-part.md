# ADR 0010 — Several decks per Nursing Practice part, and decks she can make

- **Status:** Accepted — the owner chose this over "restore only" and "free-form decks" on 2026-11-03.
- **Date:** 2026-11
- **Revises:** the interpretation of [decision #7](../BUILD_GUIDE.md) recorded in `src/db/types.ts`
  ("A deck. One per Nursing Practice part") and in `src/db/seed-data.ts`. It does **not** revoke
  decision #7.

## Context

**What decision #7 actually says** is _"pre-seed the five PRC Nursing Practice parts"_. It mandates
the five starting decks. It does **not** say they are the only decks — that was an interpretation added
in a doc comment on the `Deck` type, and it went unchallenged because nothing could create a deck.

**Then deck deletion shipped, and it had no counterpart.** `softDeleteDeck` tombstones the deck and its
cards, `listDeletedDecks` has no UI, and seeding is gated on `settings.seededAt` so a deleted seeded
deck never returns. A mis-tap is therefore permanent — the one-way door that made this urgent.

**And one part is three months of material.** Nursing Practice I alone is community health nursing
across individuals, families, population groups and communities. A single deck per part gives her one
container for a third of the exam, which is exactly the shape that stops a deck list being useful.

**The cross-cutting rule is untouched by this.** `seed-data.ts` argues that Anatomy, Pharmacology,
Pathophysiology and the rest must be **tags** rather than decks, because a card in two decks would have
to be duplicated. That reasoning is about _crossing_ parts. A deck **inside** one part does not cross
anything, so it does not weaken that argument at all.

## Decision

**A deck keeps its part, and a part may hold any number of decks. She can create her own.**

1. **`subject: PrcPart` stays.** It is still what orders the app — PRC exam order first — and still
   what resolves the part label. Nothing about the data model's shape changes; only the cardinality of
   "decks per part" does.
2. **The five seeded decks remain the part-level decks**, created once and gated by `seededAt` exactly
   as before. Nothing is re-seeded, and a delete still does not resurrect.
3. **Creating a deck requires a name and a part, and nothing else.** Scope is optional free text. The
   verbatim-PRC rule applies to the **seeds** only — a deck she names is not a quotation of anything,
   so it must not pretend to be one.
4. **Ordering inside a part is by name**, after part order. Without that tiebreak the order falls back
   to the primary key, which for a created deck is a random UUID — so two decks in one part would swap
   places between loads for no reason she could see.
5. **Cards are still reached one way:** "Add from your notes" only becomes available once a deck
   exists, because the ingest flow needs a deck to file cards into. With no decks, the screen offers
   creating one instead.

## Consequences

### Good

- **The one-way door opens.** A deleted deck can be replaced, so delete stops being permanent.
- **The deck list can size itself to her material** rather than to the exam's table of contents, while
  still keeping the exam as the top-level structure.
- **No model change, no migration.** `subject` is unchanged and still required, so every existing deck
  and card keeps working, and `prcPartOrder` still orders everything.
- **The cross-cutting-tags decision survives intact**, and is arguably reinforced: subtopics now have a
  home inside a part, so there is even less pressure to make a cross-cutting deck.

### Bad / cost

- **"One deck per part" was a useful invariant.** Anything that relied on `deck.subject` being unique —
  or that assumed five decks — can no longer assume it. The user-facing "five decks" copy was one
  instance and is already gone; future code must not reintroduce the assumption.
- **Two levels of grouping is more than before.** A deck list within a part is a real navigation
  question (sort, count, "which deck did I put that card in"), and this ADR does not answer it beyond
  ordering by name.
- **Restore is still not built.** Creating a deck gives her an _empty_ one: `softDeleteDeck` tombstones
  the cards too, so a restored deck needs its cards un-tombstoned as well, and that is a separate piece
  of work with its own edge case (cards deleted individually before the deck was).
- **A deck she makes can drift from the PRC taxonomy** — a name that means something to her but not to
  the exam. That is the point, and it is also a way to file a card where she will not find it in
  February.

## Alternatives considered

- **Restore only, keeping five fixed.** Rejected as the whole answer: it closes the one-way door but
  leaves one container per part, which is the part she actually hit. Still worth building as a
  follow-up, because create gives her an empty deck rather than the one she deleted.
- **Free-form decks, dropping `subject`.** Rejected: it loses the exam mapping that makes the deck list
  explain the app's structure, and it would make `prcPartOrder` — the thing that keeps every list in
  the order she sits the exam — meaningless.
- **Decks for the cross-cutting knowledge areas** (Anatomy, Pharmacology, …). Rejected, unchanged from
  the earlier reasoning: those must be tags so a card can cut across parts without being duplicated.
- **A deck tree (parts → subtopics → subtopics).** Rejected: two levels of nesting is already more than
  a one-person app needs to explain, and the exam itself is only two levels deep.
