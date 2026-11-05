# ADR 0011 — Purge a deck, but only in a build without cloud sync

- **Status:** Accepted
- **Date:** 2026-11
- **Supersedes:** nothing; it bounds a rule stated in `CLAUDE.md` rather than reversing it

## Context

`CLAUDE.md` states the data contract as: _"Never hard-delete a synced record — hard deletes are
resurrected by the other device."_ Read absolutely, that forbids ever removing a tombstone — so a deck
she deleted stays in the restore list forever, and the only way to stop seeing it is to bring it back.

The absolute reading is not what the codebase does. `importBackup` already clears all six tables
(`src/db/repositories/backup.ts`), which is a hard delete of every record in the database. So the rule
has never meant "no bytes are ever removed". It means **a record a second copy still holds must not be
removed locally**, because the next pull puts it back.

That is a statement about a second copy existing, and whether one exists is a property of the build.

## Decision

**A deck may be purged, and the permission is a property of the build rather than a policy anyone has to
remember.**

- `canPurgeDecks()` in `src/sync/lib/can-purge.ts` returns `false` whenever cloud sync is enabled.
- The answer comes from **`VITE_ENABLE_CLOUD_SYNC`**, which Vite replaces at build time and which ships
  `false`. When Workflow 2b turns sync on, the control **does not exist in that build** — nothing needs
  removing, and nobody has to remember.
- It is **not** read from `settings.cloudSync`: that field defaults to `true` and is unused until 2b, so it
  would forbid the feature today while proving nothing about whether a second copy exists.
- `purgeDeck` removes the deck row and **all** of its cards, live and tombstoned, in one transaction, and
  returns how many rows went. It **never touches `ReviewLog`**.
- The UI costs a confirmation, because there is no undo — the same asymmetry the export/import rule
  already states: cheap to reach, expensive to confirm.

## Consequences

### Good

- A deck can leave the restore list permanently, which is what makes collapsing that list useful rather
  than a way to hide something forever.
- The exception **retires itself**. The day a build ships with cloud sync compiled in, `canPurgeDecks` is
  `false` in it.
- She gains a way to act on a mistake she regrets (she created a deck, never used it, deleted it) without
  keeping a permanent reminder of it.

### Bad / cost

- **A purged deck is unrecoverable by every path**, including export/import, because it is gone from the
  local database the export reads. A confirmation is the only mitigation, and confirmations are missable.
- `ReviewLog` rows are left pointing at a card id that no longer exists. That is already true of every
  tombstoned record and is why the dashboard reads logs rather than resolving cards — but a purge makes it
  permanent for that deck.
- There are now **two** delete shapes in the deck code, and the guard protecting the dangerous one lives in
  a different module (`src/sync/lib/`) from the function it protects (`src/db/`). A future caller can call
  `purgeDeck` without checking, and nothing in the type system stops it.
- `CLAUDE.md`'s data contract gains a second named exception, which makes the original rule slightly
  harder to state in one sentence.

## Alternatives considered

- **Never purge; make the restore list collapsible only.** Rejected because it answers the nagging but not
  the request: the tombstone still exists and cannot be removed, so "delete this for good" has no answer.
- **Purge gated on `settings.cloudSync` being false.** Rejected because that field defaults to `true` and
  is unused until 2b, so the feature would be unavailable today while still being unsafe tomorrow if
  someone flipped the setting.
- **Purge with no guard, documented as "do not use with sync".** Rejected: a comment is not a guard, and
  the failure mode is a deck she destroyed reappearing days later.
- **Hard-delete without a confirmation, matching Restore's one tap.** Rejected because the asymmetry is the
  point — undo is cheap, destroy is not.
