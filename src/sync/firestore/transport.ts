import type { AppSettings, Card, Deck, Lesson, ReviewLog, Session } from '@/db/types'

import { SYNCED_TABLES, type MergeOutcome, type SyncedTable } from '../lib/merge'
import { validateRemoteRow } from './validate'

/**
 * The transport seam: the only thing above it knows is "pull the remote, push a merge result".
 *
 * It is split into a `Transport` (this file, no Firebase) and a `RemoteStore` (the adapter in
 * `firestore-remote.ts`). That split is not speculation: it is what lets the transport's real
 * behaviour — validation, batching, merge application — be tested without an emulator, a browser, or
 * a credential, while the adapter is exercised separately against the emulator. The alternative was
 * a module that cannot be tested at all unless Java is running, which is how the one piece of code
 * that decides what gets written becomes the least-tested piece.
 *
 * ## Fire-and-forget, as a type
 *
 * `pull` rejects on a network or permission failure — that is an I/O primitive and pretending
 * otherwise would hide it. `syncOnce` in `sync.ts` catches it and returns it as a value. Nothing in
 * this file throws into a render path, and nothing here reads a clock: every `updatedAt` belongs to
 * the data. That is the merge unit's rule and it holds here too.
 *
 * ## Why `push` takes a table-tagged batch
 *
 * `SYNC-MERGE.md`'s outcome is a `{ merged, push }` pair with no table name, but a Firestore write
 * needs a document path. The literal `MergeOutcome<unknown>[]` in the brief therefore cannot name the
 * collection it writes to. Rather than passing a second parallel array of table names — the shape
 * that silently pairs `push[2]` with `tables[1]` — each batch carries its table. The rest of the
 * seam (`pull()`, `push()`, per-batch results) is exactly as specified.
 */

/** Every row this device holds, tombstones included. Sync needs the tombstones; screens do not. */
export interface LocalRows {
  decks: Deck[]
  cards: Card[]
  reviewLogs: ReviewLog[]
  /** The settings singleton, as a 0-or-1 array so it can be read and written like a table. */
  settings: AppSettings[]
  sessions: Session[]
  lessons: Lesson[]
}

export function emptyLocalRows(): LocalRows {
  return { decks: [], cards: [], reviewLogs: [], settings: [], sessions: [], lessons: [] }
}

/** A remote row that failed validation. Reported, never written. */
export interface RejectedRow {
  table: SyncedTable
  /** The document id, when there was one to report. */
  id: string | null
  /** Developer-facing: why this row cannot be a record. */
  reason: string
}

export interface PulledRows {
  rows: LocalRows
  /** Rows the remote held that are not records. Reported to the caller, never applied. */
  rejected: RejectedRow[]
}

/**
 * One table's merge result, tagged with the table it belongs to.
 *
 * `merged` is carried rather than dropped because the merge unit returns it and the caller may want
 * to assert on it; the write path uses only `push`.
 */
export type PushBatch = MergeOutcome<unknown> & { readonly table: SyncedTable }

export interface PushBatchResult {
  table: SyncedTable
  /** Rows the batch contained. Zero for a success that had nothing to write. */
  written: number
  ok: boolean
  /** Present only when `ok` is false. */
  error?: string
}

export interface PushResult {
  /** One entry per commit attempt, in order. A partial failure is visible here. */
  batches: PushBatchResult[]
  ok: boolean
}

export interface Transport {
  pull(): Promise<PulledRows>
  push(batch: readonly PushBatch[]): Promise<PushResult>
}

/** A document as the remote returns it: the path id is separate from the body. */
export interface RemoteDocument {
  /** The last path segment of `users/{uid}/{table}/{id}`. */
  id: string
  /** Untrusted. `pull` validates it before it becomes a record. */
  data: unknown
}

export interface RemoteWrite {
  id: string
  data: Record<string, unknown>
}

/**
 * The small surface the Firestore adapter has to provide.
 *
 * `maxWritesPerBatch` is part of the interface rather than a constant in this file so the batching
 * rule is testable: a test sets it to 2 and can then count commits. Production is 500 (Firestore's
 * limit).
 */
export interface RemoteStore {
  readonly maxWritesPerBatch: number
  list(table: SyncedTable): Promise<RemoteDocument[]>
  write(table: SyncedTable, rows: readonly RemoteWrite[]): Promise<void>
}

/** Put a validated row into its table's array. An explicit switch so a seventh table cannot compile silently. */
function appendRow(rows: LocalRows, table: SyncedTable, row: Record<string, unknown>): void {
  switch (table) {
    case 'decks':
      rows.decks.push(row as unknown as Deck)
      return
    case 'cards':
      rows.cards.push(row as unknown as Card)
      return
    case 'reviewLogs':
      rows.reviewLogs.push(row as unknown as ReviewLog)
      return
    case 'settings':
      rows.settings.push(row as unknown as AppSettings)
      return
    case 'sessions':
      rows.sessions.push(row as unknown as Session)
      return
    case 'lessons':
      rows.lessons.push(row as unknown as Lesson)
      return
    default: {
      // Exhaustive by construction; this line is a compile error if a table is added without a case.
      const unreachable: never = table
      throw new Error(`Unhandled sync table: ${String(unreachable)}`)
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

/** Firestore's per-commit limit. Stated here once so the transport and the adapter cannot disagree. */
export const MAX_WRITES_PER_BATCH = 500

function chunk<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

function toRemoteWrite(row: unknown): RemoteWrite {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    throw new Error('A row to push is not an object')
  }

  const id = (row as { id?: unknown }).id
  if (typeof id !== 'string' || id === '') {
    throw new Error('A row to push has no id')
  }

  return { id, data: row as Record<string, unknown> }
}

export function createTransport(remote: RemoteStore): Transport {
  return {
    async pull(): Promise<PulledRows> {
      const rows = emptyLocalRows()
      const rejected: RejectedRow[] = []

      // Sequential rather than parallel: the data is small, and a single failure then names the
      // table it came from instead of arriving as one of six rejections.
      for (const table of SYNCED_TABLES) {
        const documents = await remote.list(table)

        for (const document of documents) {
          const result = validateRemoteRow(table, document.data)

          if (!result.ok) {
            rejected.push({ table, id: document.id, reason: result.reason })
            continue
          }

          // The body id and the path id must agree. A row written under one identity with another
          // identity inside it would be applied under the wrong id.
          if (result.row.id !== document.id) {
            rejected.push({
              table,
              id: document.id,
              reason: 'the record id does not match the document id',
            })
            continue
          }

          appendRow(rows, table, result.row)
        }
      }

      return { rows, rejected }
    },

    async push(batches: readonly PushBatch[]): Promise<PushResult> {
      const size = Math.max(1, Math.floor(remote.maxWritesPerBatch))
      const results: PushBatchResult[] = []

      for (const batch of batches) {
        if (batch.push.length === 0) {
          results.push({ table: batch.table, written: 0, ok: true })
          continue
        }

        // Each chunk is its own commit, and a failed chunk does not stop the others: one bad batch
        // must not report the whole transport as down, which would hide every success behind it.
        for (const rows of chunk(batch.push, size)) {
          try {
            await remote.write(batch.table, rows.map(toRemoteWrite))
            results.push({ table: batch.table, written: rows.length, ok: true })
          } catch (error) {
            results.push({
              table: batch.table,
              written: 0,
              ok: false,
              error: messageOf(error),
            })
          }
        }
      }

      return { batches: results, ok: results.every((result) => result.ok) }
    },
  }
}
