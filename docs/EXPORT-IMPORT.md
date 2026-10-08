# Prompt — export and import

Hand this to a fresh agent. This runs **in parallel with** the first-run brief — different files, no
overlap. It is on the critical path to the reveal.

Written at commit `98713e9`. Do not trust that hash — run `git log --oneline -6`.

---

You are picking up **StudyBao**, a study companion for one person's PNLE review. Her exam is **Friday
26 February 2027** and she is being given the app within weeks.

## Read these first

1. `CLAUDE.md` — constraints, and the UX rule _"Export/import is a first-class screen, reachable in two
   taps. It is the only backup that does not depend on Google, the network, or a sync bug."_
2. `docs/adr/0007-browser-only-no-install.md` and `docs/handoff.md` §8
3. `docs/ai/change-data-model.md` — every timestamp is epoch ms; nothing is hard-deleted
4. `src/db/schema.ts`, `src/db/repositories/settings.ts`, `src/db/types.ts`
5. `src/features/settings/components/settings-view.tsx` — **the Export and Import buttons already exist
   and are disabled.** That is your entry point.

## Why this exists

Workflow S (cloud sync) is **not built**. So today there is no backup and no way to move cards between
her iPad and her laptop. This is both. The install prompt protects her data from being cleared; **this is
what recovers it if that fails anyway** — a cleared database, a new device, or a mistake.

Two taps from Settings, and it must work with the network off, because there is no server to help.

## Part 1 — export

One JSON file, everything, named for a human: `studybao-backup-2026-10-08.json`.

**Include every table**: `decks`, `cards`, `reviewLogs`, `settings`, `sessions`, `lessons`. Not a sample,
not a summary — a backup that silently omits a table is worse than none, because she will trust it.

`ReviewLog` is the one that is easy to get wrong and it is the one that cannot be reconstructed. It is
append-only and it is the history Workflow F will read.

The envelope needs:

- a **format version** so a future importer can recognise an old file, and refuse a newer one rather than
  guessing;
- an **`exportedAt`** timestamp (epoch ms, like everything else);
- a **count per table**, so she can see what she is saving and so an import can report what it found.

**Do not include the ingest draft.** It lives in `sessionStorage` as scratch, not as data, and restoring
a half-finished paste months later would be a bug rather than a feature.

## Part 2 — import, which is the dangerous half

### Import REPLACES. Merge is not yours.

**Import replaces everything on this device, and that is the decision.** Do not implement a merge.

The reasoning, so you can defend it: a merge is the correct answer for _sync_, and sync is Workflow S,
which owns the same rules `docs/ai/change-data-model.md` already states — union-only for `ReviewLog`,
newest `updatedAt` wins elsewhere. A wrong merge resurrects deleted cards or discards edits, and S's
definition of done requires it tested against six specific cases. Building a second, weaker merge here
would be exactly the kind of drift this repository keeps paying for, and S would have to remove it.

So import is a **transfer**, not a sync, and the copy must not imply otherwise. Say plainly that moving
data between devices means exporting from one and importing on the other, and that importing does not
combine.

### Validate the whole file before touching the database

Refuse, with a reason she can act on, if:

- the file is not JSON, or not an object;
- the format version is missing, unparseable, or **newer** than this build understands;
- a required table is absent, or is not an array;
- any record lacks an `id`.

**Never write a partial import.** Do the whole thing in **one `db.transaction('rw', …)`** across every
table — the same pattern `recordReview` uses in `src/db/repositories/cards.ts` to make a partial write
impossible rather than unlikely. If any write throws, nothing lands.

### The trap that will otherwise bite her

**`seededAt` is the seeding gate, not "are there any decks".** It lives on the `settings` singleton, and
seeding is gated on it precisely so a deck she deleted stays deleted.

So an import that restores `decks` but **not** the `settings` row leaves no marker, and the next app open
**seeds five duplicate PRC decks**. Make sure the settings row is restored and `seededAt` survives, and
**write a test that asserts it** — this is the single most likely way this feature destroys her data
while looking like it worked.

### Make the destructive step recoverable

In the same dialog, before replacing anything:

- **offer a pre-import export**, one tap, so a mistake costs a file restore rather than her data;
- show the **counts** — what is in the file and what is on this device — and make the confirm say what it
  will replace.

## Part 3 — the screen

Enable the two disabled buttons. Two taps from anywhere (Settings is already in the navigation). Report
success and failure with the existing `Toast` primitive, and use the `Modal` + `EmptyState` primitives
rather than inventing layout.

Every string follows `BUILD_GUIDE.md` §5 — warm, plain, never clinical. She is not a system
administrator, and "import" is already jargon: explain it in her terms on first use.

## Testing, which is most of this task

The pure parts — build the envelope, validate a parsed object, count a payload — belong in `lib/` with
co-located tests. The database write needs an integration test against the real `fake-indexeddb` setup
the other repositories use.

The tests that matter:

1. **Round trip**: seed data, export, wipe, import, and assert every table is **identical** — including a
   tombstone and a row with optional fields absent.
2. **Each validation failure writes nothing**, asserted against the database, not just against a thrown
   error.
3. **Atomicity**: force a failure partway through the write and assert the database is unchanged. This is
   the test that proves the transaction is doing its job.
4. **The `seededAt` case above.**
5. **A newer format version is refused**, not partially applied.

**Reintroduce the bug for each and confirm the test goes red before you trust it.** This repository has
shipped tests that passed under both the fix and the regression.

## Out of scope

- **Merge, and any sync.** That is S.
- **Automatic or scheduled export.** Decision D13 is manual only: the web has no reliable "write to a
  folder I choose" on iOS, and a reminder she cannot complete is worse than none.
- **CSV.** JSON is the backup; CSV was explicitly declined.
- **Encryption or a passphrase.** It is her file on her device; do not invent a key-management problem.
- Do not touch `src/features/tracker`, `src/features/timer`, or the ingest pipeline.

If you find something outside this list, **write it down rather than fixing it.**

## Verify

```bash
npm install --cache .npm-cache
npm run typecheck && npm run lint:check && npx prettier --check .
npm run test:coverage
npm run build && npm run preview
```

All must pass. Report the precache delta if you add any asset.

## What you cannot verify, and must hand back

**No agent in this project has a browser or a device.** So say plainly that you did not verify:

- where a download actually goes on iOS and iPadOS — a blob download goes through the Files app or a
  share sheet, and the wording in the UI must match what she will really see;
- whether reading a file back works through the real iOS file picker;
- how a multi-megabyte export behaves on a 3 GB iPad;
- and that her data is **not** in the repository. The export contains her notes in plaintext: never
  commit a generated backup, and do not use real exported data as a test fixture.

## Before you write code

Reply with: **(1)** your plan, **(2)** the envelope shape and its format version, **(3)** how you handle
`seededAt`, **(4)** the exact copy for the destructive confirm, and **(5)** anything in ADR 0007 or the
UX rules you think is wrong.

Then **stop and wait for a go-ahead.**
