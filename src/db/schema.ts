import Dexie, { type Table } from 'dexie'

import { INTEGRATED_KNOWLEDGE_AREAS, PRC_PARTS, deckIdForPart } from './seed-data'
import type { AppSettings, Card, Deck, ReviewLog } from './types'

/**
 * The Dexie schema, and the only module that opens the database.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Schema version 1. There is no version 0 in the wild — Workflow A shipped no
 * `src/db/` at all — so version 1 needs no upgrade function. **Any later change to
 * these stores is a version bump plus a tested migration**
 * (docs/ai/change-data-model.md). There is no undo on her device.
 *
 * Only three tables are here. `Lesson` (Workflow E) and `Session` (Workflow D) appear
 * in docs/BUILD_GUIDE.md §6 as the eventual model; creating them now would be two empty
 * tables, two speculative migrations, and no data. They arrive with the workflows that
 * fill them.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Indexes are exactly the ones there is a query for — `deletedAt` and `updatedAt`
 * because Workflow S will need tombstones and "changed since last push" respectively,
 * `nextReview` because the due query is the core of the app, and the two foreign keys
 * because every list is filtered by them. No compound indexes: at her scale a compound
 * index costs write time and buys nothing.
 */
export class StudyBaoDb extends Dexie {
  decks!: Table<Deck, string>
  cards!: Table<Card, string>
  reviewLogs!: Table<ReviewLog, string>
  settings!: Table<AppSettings, string>

  constructor(name = 'studybao') {
    super(name)

    this.version(1).stores({
      decks: 'id, subject, updatedAt, deletedAt',
      cards: 'id, deckId, nextReview, updatedAt, deletedAt',
      reviewLogs: 'id, cardId, deckId, reviewedAt',
      settings: 'id',
    })

    // A brand-new install seeds the five PRC decks. This is a `populate` (create-only)
    // hook rather than a `version(1).upgrade()`, because an upgrade function would also
    // run on an existing database that has one deck and no marker — see seed.ts for why
    // the gate is a setting rather than "are there any decks".
    this.on('populate', () => seedInitialData(this))
  }
}

/** The settings row is a singleton; this is the only id ever used for it. */
export const SETTINGS_ID = 'app'

/**
 * Default days before the exam at which cram mode starts. Decision from
 * docs/BUILD_GUIDE.md §9.3 — a setting, not a constant at a call site.
 */
export const DEFAULT_CRAM_THRESHOLD_DAYS = 30

/** The database name. Declared once so the delete helper cannot drift from the constructor. */
export const DATABASE_NAME = 'studybao'

/**
 * The one database handle for the app. Lazily opened so importing this module never touches
 * IndexedDB — which fails outside a browser, and would make this module unimportable from a
 * pure-logic test.
 */
let database: StudyBaoDb | null = null
let opening: Promise<StudyBaoDb> | null = null

/**
 * The database, open. Safe to call from anywhere, concurrently, and repeatedly.
 *
 * On failure the memoised promise is cleared, so a transient failure (a blocked upgrade, a
 * private-mode quota error) can be retried rather than poisoning every later call.
 */
export async function getDb(): Promise<StudyBaoDb> {
  touched = true
  if (database?.isOpen()) return database
  if (opening) return opening

  const db = new StudyBaoDb(DATABASE_NAME)
  const attempt = db
    .open()
    // Dexie declares `open()` as returning the base `Dexie`, so the subclass type has to be
    // restored here or every declared table disappears from the returned value.
    .then((opened) => opened as StudyBaoDb)
    .then(async (opened) => {
      database = opened
      // Backstop for the `populate` hook: an interrupted first launch could leave a database with
      // no decks. Idempotent, and gated on `seededAt`.
      await seedInitialData(opened)
      return opened
    })
    .catch((error: unknown) => {
      opening = null
      throw error
    })

  opening = attempt
  return attempt
}

/**
 * Close and delete the whole database, then forget the cached handle.
 *
 * **Tests only.** On her device this is data loss, and nothing in the app may call it — there is
 * deliberately no user-facing "reset" that goes through here.
 */
export async function deleteDatabaseForTests(name = DATABASE_NAME): Promise<void> {
  database?.close()
  database = null
  opening = null
  await Dexie.delete(name)
}

/** Wipe every row but keep the database open. **Tests only.** */
export async function clearDatabaseForTests(): Promise<void> {
  const db = await getDb()
  // Enumerated rather than `db.tables` so a future table cannot be silently missed.
  await db.transaction('rw', [db.decks, db.cards, db.reviewLogs, db.settings], async () => {
    await Promise.all([
      db.decks.clear(),
      db.cards.clear(),
      db.reviewLogs.clear(),
      db.settings.clear(),
    ])
  })
}

/**
 * Wipe every row, then re-seed, so the database is in the state a real first launch produces.
 *
 * **Tests only**, and the version the global `afterEach` calls. Wiping without re-seeding leaves a
 * database that is open (so `populate` will never fire again) but has no decks and no `seededAt`
 * marker — which is not a state her device can be in, and would make every test assert against an
 * impossible starting point.
 */
export async function resetDatabaseForTests(): Promise<void> {
  await clearDatabaseForTests()
  await getDb().then((db) => seedInitialData(db))
}

/**
 * Whether anything has opened the database since the last reset.
 *
 * The global test `afterEach` calls `resetDatabaseForTestsIfUsed`, so a test file that never
 * touches IndexedDB pays nothing for the reset — with a suite this size, opening and re-seeding the
 * database after all 200-odd tests is enough overhead to make lazy-route tests flaky under
 * contention, which is a worse outcome than the leak this guards against.
 */
let touched = false

export async function resetDatabaseForTestsIfUsed(): Promise<void> {
  if (!touched) return
  touched = false
  await resetDatabaseForTests()
}

/**
 * Seed the five decks and the settings row, exactly once per database.
 *
 * Gated on `settings.seededAt`, **not** on "are there any decks". A deck she deletes is a
 * tombstone, and a "seed if empty" check would resurrect it on every launch — the
 * local-first bug this codebase is most careful about, in miniature.
 */
export async function seedInitialData(db: StudyBaoDb, now = Date.now()): Promise<void> {
  const existing = await db.settings.get(SETTINGS_ID)
  if (existing?.seededAt !== undefined) return

  await db.transaction('rw', [db.decks, db.settings], async () => {
    const settings = await db.settings.get(SETTINGS_ID)
    // Re-check inside the transaction: two tabs opening at once must not seed twice.
    if (settings?.seededAt !== undefined) return

    const decks: Deck[] = PRC_PARTS.map((seed) => ({
      id: deckIdForPart(seed.part),
      subject: seed.part,
      name: seed.name,
      scope: seed.scope,
      updatedAt: now,
    }))

    await db.decks.bulkPut(decks)
    await db.settings.put({
      ...settings,
      id: SETTINGS_ID,
      cramThresholdDays: settings?.cramThresholdDays ?? DEFAULT_CRAM_THRESHOLD_DAYS,
      cloudSync: settings?.cloudSync ?? true,
      updatedAt: now,
      seededAt: now,
    })
  })
}

/**
 * The tag vocabulary the card form offers. Re-exported from here so feature code has one
 * place to read it from and never imports seed data directly.
 */
export { INTEGRATED_KNOWLEDGE_AREAS }
