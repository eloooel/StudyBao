import type { Table } from 'dexie'

import {
  countRows,
  parseBackup,
  serializeBackup,
  buildEnvelope,
  withSeededMarker,
  type BackupFailure,
  type BackupRow,
  type BackupTable,
  type TableCounts,
} from '@/lib/backup-format'
import { getDb, type StudyBaoDb } from '../schema'
import type { AppSettings, Card, Deck, Lesson, ReviewLog, Session } from '../types'

/**
 * Backup: everything, as one file, and back again.
 *
 * This is the only repository that reads or writes all six tables at once, which is what the
 * feature is. Two properties are load-bearing and both are tested:
 *
 * 1. **Export is one consistent snapshot.** It runs in a single read transaction, so a review
 *    landing in another tab cannot produce a file with a card in it and no log row for it — the
 *    kind of file that looks fine until it is the only copy she has.
 * 2. **Import replaces, atomically, or does nothing at all.** Every table is cleared and rewritten
 *    inside one `rw` transaction. A file that fails validation never reaches the database, and a
 *    write that throws partway rolls the clears back with it. There is deliberately no merge here:
 *    a merge is Workflow S's problem, with its own six test cases, and a second weaker one written
 *    here is exactly the drift this repository keeps paying for. See docs/EXPORT-IMPORT.md.
 *
 * Nothing here reads a clock for anything but a stamp, and nothing here knows about filenames, the
 * DOM or her words — those live in `features/settings/`.
 */

/** Every table, enumerated rather than taken from `db.tables`. */
function allTables(db: StudyBaoDb): Table[] {
  return [db.decks, db.cards, db.reviewLogs, db.settings, db.sessions, db.lessons]
}

export interface BackupExport {
  /** The whole file, ready to hand to the browser. */
  text: string
  /** What went into it, per table. */
  counts: TableCounts
}

/** How many rows each table holds right now. The "on this device now" column. */
export async function listTableCounts(): Promise<TableCounts> {
  const db = await getDb()

  return {
    decks: await db.decks.count(),
    cards: await db.cards.count(),
    reviewLogs: await db.reviewLogs.count(),
    settings: await db.settings.count(),
    sessions: await db.sessions.count(),
    lessons: await db.lessons.count(),
  }
}

/** Everything in the database, serialised. */
export async function exportBackup(now = Date.now()): Promise<BackupExport> {
  const db = await getDb()

  return db.transaction('r', allTables(db), async () => {
    const tables = {
      decks: await db.decks.toArray(),
      cards: await db.cards.toArray(),
      reviewLogs: await db.reviewLogs.toArray(),
      settings: await db.settings.toArray(),
      sessions: await db.sessions.toArray(),
      lessons: await db.lessons.toArray(),
    }

    const envelope = buildEnvelope(tables, now)
    return { text: serializeBackup(envelope), counts: envelope.counts }
  })
}

export type ImportOutcome =
  { ok: true; counts: TableCounts } | { ok: false; failure: BackupFailure }

/**
 * Replace every table with the contents of a backup file.
 *
 * Takes the file's **text**, not an already-parsed envelope: the screen holds what she picked and
 * re-parses it here, so what the confirmation dialog showed and what is written cannot come from
 * two different readings of the file.
 *
 * Validation failures come back as a value; a failure to *write* throws, because that is not
 * something the caller can phrase as a reason she could act on — the transaction has already
 * guaranteed the database is untouched, and the screen says so.
 */
export async function importBackup(text: string, now = Date.now()): Promise<ImportOutcome> {
  const parsed = parseBackup(text)
  if (!parsed.ok) return { ok: false, failure: parsed.failure }

  const db = await getDb()

  // The seeding gate is set before the write, not checked after it. A restored database whose
  // settings row carried no marker would open by seeding the five PRC decks on top of the imported
  // ones — see `withSeededMarker` and `seedInitialData`.
  const settings = withSeededMarker(parsed.envelope.tables.settings, now)
  const rows: Record<BackupTable, BackupRow[]> = { ...parsed.envelope.tables, settings }

  await db.transaction('rw', allTables(db), async () => {
    // One transaction across every table: a partial import is impossible rather than unlikely.
    await Promise.all([
      db.decks.clear(),
      db.cards.clear(),
      db.reviewLogs.clear(),
      db.settings.clear(),
      db.sessions.clear(),
      db.lessons.clear(),
    ])

    await db.decks.bulkPut(asRows<Deck>(rows.decks))
    await db.cards.bulkPut(asRows<Card>(rows.cards))
    await db.reviewLogs.bulkPut(asRows<ReviewLog>(rows.reviewLogs))
    await db.sessions.bulkPut(asRows<Session>(rows.sessions))
    await db.lessons.bulkPut(asRows<Lesson>(rows.lessons))
    await db.settings.bulkPut(asRows<AppSettings>(rows.settings))
  })

  return { ok: true, counts: countRows(rows) }
}

/**
 * The one place a file's contents are treated as our records.
 *
 * `parseBackup` proved each row is an object with a unique non-empty string `id`, and deliberately
 * nothing about the rest of the record — a `nextReview` that arrived as a string would pass here and
 * then never compare as due, so the card would silently vanish from review. That gap is a stated
 * cost rather than an oversight: the export is the source of truth, so a bad import is redoable from
 * a good file. See `src/lib/backup-format.ts`.
 */
function asRows<T>(rows: BackupRow[]): T[] {
  return rows as unknown as T[]
}
