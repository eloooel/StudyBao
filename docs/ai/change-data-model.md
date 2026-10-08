# Change the data model

Add or change a Dexie table, field, or index. **This is the highest-risk change class in this repo.**
There is no undo on her phone, and a botched migration can lose months of SM-2 history. Read the
whole runbook before writing code.

## 1. Decide whether you actually need it

Every new field is a migration, a sync field, a test, and a permanent maintenance cost. Ask:

- Can this be derived from data that already exists?
- Is this needed now, or is it speculative? (Speculative fields are banned — see `CLAUDE.md`.)
- Does it change the **sync contract**? If yes, both devices and the Firestore rules are affected.

## 2. Update the model in three places — never one

1. `src/db/schema.ts` — the Dexie table definition and indexes
2. `src/db/types.ts` — the TypeScript interface
3. `src/sync/mappers.ts` — the Firestore document mapping, if the record syncs **(pending Workflow S)**

If any of the three is missing the change, you have a latent bug.

**Current version: 3.** `decks`, `cards`, `reviewLogs`, `settings`, `sessions` and `lessons` — every
table that exists. Version 2 added `sessions` (Workflow D) and version 3 added `lessons`
(Workflow E), each with an **intentionally empty** upgrade, because they introduce a table and
transform no row; a retried migration therefore cannot corrupt anything. Workflow S syncs all six —
`ReviewLog` union-only — and `lessons` is the sixth mutable synced record, so a merge written
against the old list would silently drop her whole study plan.

`src/db/migrations.test.ts` carries a v1 → current test and a v2 → v3 test to copy for version 4.
Note the pattern in both: they build the v(N−1) database from a **bare `Dexie`**, not from
`StudyBaoDb`, because the class now declares the newer version and opening it would run the very
migration under test.

## 3. Non-negotiable field rules

- **Every mutable synced record has `updatedAt: number` (epoch ms) and `deletedAt?: number`.** The
  named exception is an **append-only** table — `ReviewLog` is the one that exists — which has
  neither, because it is never mutated after it is written. Do not add them back; instead make sure
  Workflow S merges that table **union-only**, never last-write-wins.
- **Never hard-delete a synced record.** Set `deletedAt` and filter it out on read. A hard delete on
  one device is resurrected by the other device's next sync — this is the single most common
  local-first bug.
- **All timestamps are epoch milliseconds (`number`).** No `Date` objects in IndexedDB, no date
  strings, no Firestore `Timestamp`. Format for display only, at the edge.
- **Do not rename a field.** Add the new one, migrate, keep reading the old one for one release, then
  remove it in a later change.
- New nullable/optional fields need no explicit migration — write the reader to treat `undefined` as
  the default. New _required_ fields, changed indexes, and changed types do.

## 4. Write the Dexie version bump

```ts
// src/db/schema.ts
this.version(2)
  .stores({
    cards: 'id, deckId, nextReview, updatedAt, deletedAt', // added nextReview index
  })
  .upgrade(async (tx) => {
    // explicit, idempotent, tested
  })
```

- **Increment the version number.** Never edit a released `version(n)` block in place.
- Upgrade functions must be **idempotent** — a failed migration can be retried on next launch.
- Do not do network calls, `await` on external state, or UI work inside `upgrade()`.
- Keep migrations small and boring. No "while I'm here" changes.

## 5. Test the migration

Add a test to `src/db/migrations.test.ts` that:

1. Opens a v(N−1) database, seeds representative rows (including a soft-deleted row and a row with
   the field missing).
2. Opens it again at v(N).
3. Asserts that no row was lost, defaults were applied, and soft-deleted rows stayed deleted.

Use `fake-indexeddb` for this. A migration without a test is not done.

## 6. Update everything downstream

- Repositories in `src/db/repositories/`
- Feature types in `features/{name}/types.ts`
- Any Zod schema that validates the record
- The Firestore security rules, if access patterns changed
- The data model section of `BUILD_GUIDE.md` §6
- The sync contract: if the record syncs, confirm the merge function still handles it

## 7. Check

```bash
npm run typecheck && npm run lint:check && npm run test:run
```

Then manually: load the app with pre-existing data, hard-refresh, and confirm nothing is missing. If
you cannot test with real pre-existing data, say so explicitly rather than assuming it works.

## Do not

- Do not edit an existing `version()` block.
- Do not drop and recreate a table to avoid a migration.
- Do not store derived values (mastery counts, streak lengths, dashboard aggregates) — compute them.
- Do not add an index you have no query for. Indexes cost storage and write time.
