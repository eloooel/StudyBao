# The sync merge, specified

`BUILD_GUIDE.md` §5 item 7 asks for _"merge function as a pure unit (`sync/lib/merge.ts`), tested
before it ever touches real data"_, and §9's acceptance criteria say _"the merge tests cover all six
cases"_ — **without ever listing them.** This is that list, and it is the spec
[`src/sync/lib/merge.ts`](../src/sync/lib/merge.ts) implements.

Nothing here talks to Firestore. The transport, the security rules and the "not saved since…" surface
are a later milestone; this is the part where a mistake is unrecoverable, so it is the part specified
and tested first.

## The data model is already shaped for this

No schema change is needed, and that is not an accident:

| Table                                   | Merge rule                         | Why                                                                                                                         |
| --------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `decks`, `cards`, `sessions`, `lessons` | **last-write-wins on `updatedAt`** | Each carries `updatedAt` + optional `deletedAt` — `types.ts` says of `Session`: _"this record is written twice by design"_. |
| `settings`                              | **LWW, plus one special rule**     | A singleton row (`id: 'app'`) whose `seededAt` is write-once.                                                               |
| `reviewLogs`                            | **union-only**                     | Append-only: no `updatedAt`, no `deletedAt`. _"A last-write-wins merge on an append-only table is silent history loss."_    |

Six tables: `decks`, `cards`, `reviewLogs`, `settings`, `sessions`, `lessons`. A seventh would need
adding here **and** to `BACKUP_TABLES`, which already has a guard test asserting it covers every table.

## The six cases

Five mutable tables:

1. **Local only** — kept locally, and pushed. This is the first-sync case: everything she has is pushed
   and nothing is lost.
2. **Remote only** — taken into the merged set. Nothing to push; the remote already has it.
3. **Both, remote newer** — the remote copy wins. Not pushed back.
4. **Both, local newer** — the local copy wins, and is pushed.
5. **Both, equal `updatedAt`** — **the tombstone wins.** If both are tombstones, or both are live, they
   are the same write: keep the local copy and push nothing.

One append-only table:

6. **`ReviewLog` merges union-only** — every id from either side survives, nothing is ever overwritten,
   and a same-id-with-different-content collision is **returned for reporting** rather than resolved.

## Why the tie-break fails toward "deleted"

A wrong deletion is **visible** — the deck is on the restore row, the card is gone from the list, and
she can act on it. A silent resurrection is not: cards she removed on purpose reappear and are studied
again. Between two failures, prefer the one she can see.

## Why a tombstone is not a separate rule

It is a record with `deletedAt` set, carried by the same `updatedAt` comparison as everything else. So a
genuinely **newer edit beats an older delete**, and there is a test that pins that
(`lets a newer edit beat an older delete`) so nobody "fixes" it into "a delete always wins" — which
would mean a card could never be corrected after a mistaken deletion.

## `seededAt` is write-once, and this is the sharp edge

`seedInitialData` is gated on `settings.seededAt` **"because a deck she deleted must stay deleted."**
A plain last-write-wins merge on the settings row can replace it with a version that lacks the marker —
and the next launch would then re-seed five decks she may have deleted. That is the exact local-first
bug this codebase is most careful about, arriving through the sync path instead of a UI one.

So the marker survives whichever row wins: the merged value is the **earliest defined `seededAt` from
either side**, computed independently of `updatedAt`. Everything else about the row is ordinary LWW,
with a tie going to local like every other record.

## What this module deliberately does not do

- **No clock.** Every timestamp comes from the data. `Date.now()` inside a merge makes it untestable and
  lets two runs over identical inputs disagree.
- **No database, no network, no async.** It takes two arrays and returns two arrays.
- **No retries, no logging, no conflict UI.** It returns `conflicts` for a caller to surface; deciding
  what to _show_ about a conflict is the transport milestone's job.
- **No `merged` order other than `id`.** Sorted on both outputs so a test asserts exactly and the result
  never depends on input order.

## Acceptance

`src/sync/lib/merge.test.ts` covers every case above, plus order-independence, purity, and ReviewLog
idempotence. Three rules are proven by reintroducing the wrong behaviour and watching the named test
fail: the tombstone tie-break, the `seededAt` guard, and the union-only merge. See the commit that added
this module for the probe transcripts.
