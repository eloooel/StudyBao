import type { AppSettings, ReviewLog } from '@/db/types'

/**
 * Two-device merge, as a **pure unit** — no clock, no database, no network.
 *
 * `BUILD_GUIDE.md` §5 item 7 asks for exactly this: *"Merge function as a pure unit
 * (`sync/lib/merge.ts`), tested before it ever touches real data."* The transport (Firestore),
 * the security rules and the "not saved since…" surface are a later milestone; this module is the
 * part where a mistake is unrecoverable, so it is the part that gets tested first.
 *
 * ## The six cases
 *
 * Five mutable tables (`decks`, `cards`, `sessions`, `lessons`, `settings`) merge by
 * **last-write-wins on `updatedAt`**:
 *
 * 1. **Local only** — kept, and pushed.
 * 2. **Remote only** — taken into `merged`, nothing to push.
 * 3. **Both, remote newer** — remote wins.
 * 4. **Both, local newer** — local wins, pushed.
 * 5. **Both, equal `updatedAt`** — **the tombstone wins.** Failing toward "stays deleted" is
 *    deliberate: a wrong deletion is visible and fixable, while a silent resurrection puts back cards
 *    she removed on purpose. If both rows agree on deletion state they are the same write, so the local
 *    copy is kept and nothing is pushed.
 *
 * And one append-only table:
 *
 * 6. **`ReviewLog` merges union-only** — every id from either side survives, nothing is ever
 *    overwritten, and a same-id conflict is **returned for reporting** rather than resolved. A
 *    last-write-wins merge on an append-only table is silent history loss.
 *
 * ## A tombstone is not a separate concept
 *
 * It is a record with `deletedAt` set, carried by the same `updatedAt` comparison as everything else.
 * So a genuinely newer **edit does beat an older delete**, and that is the specified behaviour of
 * last-write-wins rather than an oversight — the opposite (a delete that always wins) would mean a card
 * could never be corrected after a mistaken deletion.
 *
 * ## Why no clock
 *
 * Every timestamp here comes from the data. A `Date.now()` inside a merge makes it untestable, and it
 * makes two runs over the same inputs disagree — which is the sort of defect that only shows up as
 * "the sync did something weird once".
 */

/**
 * Every table sync moves, in one list.
 *
 * It lives beside the merge because the merge is what decides how each table is written, and because
 * `src/sync/lib/tables.test.ts` asserts it equals the tables the Dexie schema declares. `sessions` and
 * `lessons` were added to this database after `BACKUP_TABLES` was written, and the backup grew a guard
 * test for exactly that drift; sync is the other consumer with the same failure mode, so it gets the
 * same guard rather than a second list that can rot. A seventh table added to `schema.ts` without being
 * added here turns the suite red instead of being silently left out of sync.
 *
 * The order is the backup's order so a push batches tables predictably.
 */
export const SYNCED_TABLES = [
  'decks',
  'cards',
  'reviewLogs',
  'settings',
  'sessions',
  'lessons',
] as const

export type SyncedTable = (typeof SYNCED_TABLES)[number]

/** Anything that merges by last-write-wins. Satisfied by Deck, Card, Session and Lesson. */
export interface SyncableRecord {
  id: string
  updatedAt: number
  /** Present means tombstoned. Reads filter these out; they are still synced. */
  deletedAt?: number
}

export interface MergeOutcome<T> {
  /** The rows the local table should end up holding. Sorted by `id`. */
  merged: T[]
  /** Rows the remote does not already have. Sorted by `id`. */
  push: T[]
}

export interface ReviewLogMergeOutcome extends MergeOutcome<ReviewLog> {
  /**
   * The same id present on both sides with **different** content.
   *
   * Ids are `crypto.randomUUID()`, so this should be impossible — which is exactly why it is reported
   * instead of resolved. Silently picking a side is how history loss stops being visible.
   */
  conflicts: ReviewLog[]
}

/**
 * Structural equality, key by key.
 *
 * Deliberately not `JSON.stringify` comparison: that depends on key insertion order, so two equal
 * records built by different code paths would compare unequal and be pushed forever.
 */
function sameRecord(a: object, b: object): boolean {
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()

  if (aKeys.length !== bKeys.length) return false

  return aKeys.every(
    (key, index) =>
      key === bKeys[index] &&
      Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  )
}

function winnerOf<T extends SyncableRecord>(local: T, remote: T): T {
  if (remote.updatedAt !== local.updatedAt) {
    return remote.updatedAt > local.updatedAt ? remote : local
  }

  const localDeleted = local.deletedAt !== undefined
  const remoteDeleted = remote.deletedAt !== undefined

  if (localDeleted !== remoteDeleted) return remoteDeleted ? remote : local

  return local
}

export function mergeByUpdatedAt<T extends SyncableRecord>(
  local: readonly T[],
  remote: readonly T[],
): MergeOutcome<T> {
  const remoteById = new Map(remote.map((row) => [row.id, row]))
  const localIds = new Set(local.map((row) => row.id))

  const merged: T[] = []
  const push: T[] = []

  for (const localRow of local) {
    const remoteRow = remoteById.get(localRow.id)

    if (remoteRow === undefined) {
      merged.push(localRow)
      push.push(localRow)
      continue
    }

    const winner = winnerOf(localRow, remoteRow)
    merged.push(winner)

    // Pushed when the remote's copy is not already this one. Comparing whole records rather than
    // just the winner's side is what makes a local win with an *identical* body push nothing.
    if (!sameRecord(winner, remoteRow)) push.push(winner)
  }

  // Remote-only rows. Taken in, and nothing to push: the remote already has them.
  for (const remoteRow of remote) {
    if (!localIds.has(remoteRow.id)) merged.push(remoteRow)
  }

  merged.sort((a, b) => a.id.localeCompare(b.id))
  push.sort((a, b) => a.id.localeCompare(b.id))

  return { merged, push }
}

export function mergeReviewLogs(
  local: readonly ReviewLog[],
  remote: readonly ReviewLog[],
): ReviewLogMergeOutcome {
  const remoteById = new Map(remote.map((row) => [row.id, row]))
  const localIds = new Set(local.map((row) => row.id))

  const merged: ReviewLog[] = []
  const push: ReviewLog[] = []
  const conflicts: ReviewLog[] = []

  for (const localRow of local) {
    const remoteRow = remoteById.get(localRow.id)

    // The local copy is kept even when a remote row shares the id: an append-only row is never
    // rewritten, so there is nothing to merge into it. A difference is a finding, not a decision.
    merged.push(localRow)

    if (remoteRow === undefined) push.push(localRow)
    else if (!sameRecord(localRow, remoteRow)) conflicts.push(localRow)
  }

  for (const remoteRow of remote) {
    if (!localIds.has(remoteRow.id)) merged.push(remoteRow)
  }

  merged.sort((a, b) => a.id.localeCompare(b.id))
  push.sort((a, b) => a.id.localeCompare(b.id))
  conflicts.sort((a, b) => a.id.localeCompare(b.id))

  return { merged, push, conflicts }
}

/** The earliest of two optional stamps. `undefined` loses to any value. */
function earliestDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return Math.min(a, b)
}

/**
 * Settings is the one mutable row that needs its own function, for a reason that has nothing to do with
 * its `updatedAt`.
 *
 * **`seededAt` is write-once and must survive the merge whichever row wins.** `seedInitialData` is gated
 * on that marker *"because a deck she deleted must stay deleted"*, so a plain last-write-wins merge that
 * replaced the row with a version lacking `seededAt` would re-seed five decks she may have deleted —
 * the exact local-first bug this codebase is most careful about. The marker is therefore the **earliest
 * defined value from either side**, independent of the winner.
 *
 * Everything else about the row is ordinary last-write-wins, with a tie going to the local copy like
 * every other record.
 */
export function mergeSettings(
  local: AppSettings,
  remote: AppSettings | undefined,
): MergeOutcome<AppSettings> {
  if (remote === undefined) return { merged: [local], push: [local] }

  const winner = remote.updatedAt > local.updatedAt ? remote : local
  const merged: AppSettings = { ...winner }

  const seededAt = earliestDefined(local.seededAt, remote.seededAt)

  if (seededAt === undefined) {
    // Removed rather than set to `undefined`, so the stored row matches what a fresh install looks like.
    delete merged.seededAt
  } else {
    merged.seededAt = seededAt
  }

  return { merged: [merged], push: sameRecord(merged, remote) ? [] : [merged] }
}
