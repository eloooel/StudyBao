import { getDb, type StudyBaoDb } from '@/db/schema'

import type { LocalRows } from './transport'

/**
 * The only place sync reads and writes IndexedDB, and it does so through `src/db/schema.ts`.
 *
 * It exists because sync needs a view no screen wants: **every row including tombstones**. The
 * repositories are deliberately not used here — `listDecks()` filters deleted records because a screen
 * must not show them, and there is no `listAllDecks()`. Reading through a screen-shaped repository
 * would mean the tombstones that stop the other device resurrecting a deleted deck were never pulled
 * or pushed. `src/db/` is not changed by this milestone, so the one honest way to get that view is the
 * database handle itself.
 *
 * Both operations run in **one transaction**. A pull reads six tables that must describe one consistent
 * moment (the same reason `exportBackup` does), and a write that applied half the merged set before
 * failing would leave the local database in a state neither device wrote.
 *
 * The `open` parameter is the test seam: a test can hand in a second `StudyBaoDb` so "pull into an empty
 * side" is a real second database rather than a second variable.
 */
export interface LocalStore {
  readAll(): Promise<LocalRows>
  writeAll(rows: LocalRows): Promise<void>
}

/** Enumerated, not `db.tables`, so a future table cannot be silently missed here. */
function allTables(db: StudyBaoDb) {
  return [db.decks, db.cards, db.reviewLogs, db.settings, db.sessions, db.lessons]
}

export function createDexieLocalStore(open: () => Promise<StudyBaoDb> = getDb): LocalStore {
  return {
    async readAll(): Promise<LocalRows> {
      const db = await open()

      return db.transaction('r', allTables(db), async () => ({
        decks: await db.decks.toArray(),
        cards: await db.cards.toArray(),
        reviewLogs: await db.reviewLogs.toArray(),
        settings: await db.settings.toArray(),
        sessions: await db.sessions.toArray(),
        lessons: await db.lessons.toArray(),
      }))
    },

    async writeAll(rows: LocalRows): Promise<void> {
      const db = await open()

      await db.transaction('rw', allTables(db), async () => {
        // `bulkPut` of the whole merged set rather than a diff: merge output is the complete set, the
        // tables are small at her scale, and a diff computed here would be a second merge to get wrong.
        await db.decks.bulkPut(rows.decks)
        await db.cards.bulkPut(rows.cards)
        await db.reviewLogs.bulkPut(rows.reviewLogs)
        await db.settings.bulkPut(rows.settings)
        await db.sessions.bulkPut(rows.sessions)
        await db.lessons.bulkPut(rows.lessons)
      })
    },
  }
}
