import type { SyncedTable } from '@/sync/lib/merge'
import type { RemoteDocument, RemoteStore, RemoteWrite } from '@/sync/firestore/transport'

/**
 * An in-memory `RemoteStore`, so the transport's real behaviour is testable without Java, an emulator,
 * or a credential. It lives in `src/test/` because it is test-only by construction: coverage excludes
 * that directory and ESLint allows the test import freedom there.
 *
 * It stores **raw** documents, not records. That is deliberate — a fake that only accepted valid rows
 * could not represent the malformed remote row the transport exists to reject, so the one test that
 * matters most would be untestable.
 */

export interface MemoryCommit {
  table: SyncedTable
  rows: RemoteWrite[]
}

export interface MemoryRemoteStore extends RemoteStore {
  /** Every `write` call, in order, including the ones that failed. */
  readonly commits: MemoryCommit[]
  seed(table: SyncedTable, documents: RemoteDocument[]): void
  documents(table: SyncedTable): RemoteDocument[]
  /** Make the Nth 1-based commit throw. Used to prove a partial failure is reported rather than hidden. */
  failOnCommit(commitNumber: number): void
}

export function createMemoryRemoteStore(
  options: { maxWritesPerBatch?: number } = {},
): MemoryRemoteStore {
  const tables = new Map<SyncedTable, RemoteDocument[]>()
  const commits: MemoryCommit[] = []
  let failingCommit: number | undefined

  function rowsFor(table: SyncedTable): RemoteDocument[] {
    const existing = tables.get(table)
    if (existing !== undefined) return existing
    const created: RemoteDocument[] = []
    tables.set(table, created)
    return created
  }

  const store: MemoryRemoteStore = {
    maxWritesPerBatch: options.maxWritesPerBatch ?? 500,

    commits,

    async list(table: SyncedTable): Promise<RemoteDocument[]> {
      // A copy, so a caller cannot mutate the fake's state by holding the array.
      return rowsFor(table).map((document) => ({ id: document.id, data: document.data }))
    },

    async write(table: SyncedTable, rows: readonly RemoteWrite[]): Promise<void> {
      commits.push({ table, rows: rows.map((row) => ({ id: row.id, data: { ...row.data } })) })

      if (failingCommit !== undefined && commits.length === failingCommit) {
        throw new Error(`connection lost during commit ${String(commits.length)}`)
      }

      const documents = rowsFor(table)

      for (const row of rows) {
        const index = documents.findIndex((document) => document.id === row.id)
        const next: RemoteDocument = { id: row.id, data: { ...row.data } }
        if (index === -1) documents.push(next)
        else documents[index] = next
      }
    },

    seed(table: SyncedTable, documents: RemoteDocument[]): void {
      tables.set(
        table,
        documents.map((document) => ({ id: document.id, data: document.data })),
      )
    },

    documents(table: SyncedTable): RemoteDocument[] {
      return rowsFor(table).map((document) => ({ id: document.id, data: document.data }))
    },

    failOnCommit(commitNumber: number): void {
      failingCommit = commitNumber
    },
  }

  return store
}
