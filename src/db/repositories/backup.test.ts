import { describe, expect, it, vi } from 'vitest'

import { BACKUP_FORMAT_VERSION, BACKUP_TABLES, SETTINGS_ROW_ID, parseBackup } from '@/lib/backup-format'
import { SETTINGS_ID, clearDatabaseForTests, getDb, seedInitialData } from '@/db/schema'
import type { AppSettings, Card, Deck, Lesson, ReviewLog, Session } from '@/db/types'

import { exportBackup, importBackup, listTableCounts } from './backup'

/**
 * A backup, end to end, against a real (fake-indexeddb) database.
 *
 * This is where the two properties the feature exists for are proved rather than asserted in prose:
 * **a round trip loses nothing**, including tombstones and optional fields that are absent rather
 * than blank; and **an import either replaces everything or changes nothing**, which is what the
 * single transaction buys and what a validation failure must also guarantee.
 *
 * The `seededAt` tests at the bottom are the ones to keep. `seededAt` is the seeding gate, not an
 * "are there any decks" check, so a restored database without it opens by adding the five PRC decks
 * back on top of the imported ones — including resurrecting a deck she had deleted. That is the
 * single most likely way this feature destroys her data while looking like it worked, so the test
 * asserts the consequence (a simulated next open seeds nothing) rather than the field.
 */

const NOW = 1_800_000_000_000

/** The real fixture's marker, so the round trip can prove it survived rather than was re-stamped. */
const SEEDED_AT = NOW - 10 * 86_400_000
const EXAM_DATE = NOW + 100 * 86_400_000
const TOMBSTONE_AT = NOW - 86_400_000

const FULL_CARD: Card = {
  id: 'card-full',
  deckId: 'deck-practice-i',
  front: 'What does digoxin do to the heart rate?',
  back: 'Slows it, and strengthens the contraction.',
  tags: ['Pharmacology and Therapeutics'],
  easeFactor: 2.4,
  intervalDays: 6,
  repetitions: 2,
  lapses: 1,
  learningStep: null,
  nextReview: NOW,
  lastReviewedAt: NOW - 86_400_000,
  createdAt: NOW - 604_800_000,
  updatedAt: NOW - 86_400_000,
}

/** No `lastReviewedAt` and no `deletedAt`: the keys are absent, not blank. */
const NEVER_REVIEWED_CARD: Card = {
  id: 'card-never-reviewed',
  deckId: 'deck-practice-i',
  front: 'Normal respiratory rate for an adult?',
  back: '12 to 20 breaths per minute.',
  tags: [],
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
  learningStep: 0,
  nextReview: NOW,
  createdAt: NOW,
  updatedAt: NOW,
}

const DELETED_CARD: Card = {
  ...NEVER_REVIEWED_CARD,
  id: 'card-deleted',
  front: 'A card she deleted.',
  back: 'It must stay deleted.',
  deletedAt: TOMBSTONE_AT,
}

const CUSTOM_DECK: Deck = {
  id: 'deck-custom',
  subject: 'practice-i',
  name: 'Her own deck',
  scope: 'Notes she filed herself.',
  updatedAt: NOW,
}

const REVIEW_LOG: ReviewLog = {
  id: 'log-1',
  cardId: FULL_CARD.id,
  deckId: FULL_CARD.deckId,
  reviewedAt: NOW - 86_400_000,
  grade: 4,
  msSpent: 4200,
}

const COMPLETED_SESSION: Session = {
  id: 'session-completed',
  type: 'working',
  startedAt: NOW - 3_600_000,
  endedAt: NOW - 3_600_000 + 1_500_000,
  plannedMs: 1_500_000,
  actualMs: 1_500_000,
  completed: true,
  tabHiddenCount: 1,
  updatedAt: NOW - 3_600_000 + 1_500_000,
}

/** An abandoned block: `completed: false`, which is the honest record and must survive a backup. */
const ABANDONED_SESSION: Session = {
  id: 'session-abandoned',
  type: 'break',
  startedAt: NOW - 7_200_000,
  endedAt: NOW - 7_200_000 + 300_000,
  plannedMs: 300_000,
  actualMs: 300_000,
  completed: false,
  tabHiddenCount: 3,
  updatedAt: NOW - 7_200_000,
}

const DATED_LESSON: Lesson = {
  id: 'lesson-dated',
  subject: 'practice-iii',
  topic: 'Fluid and electrolytes',
  deadline: NOW + 86_400_000,
  status: 'reviewing',
  notes: 'Redo the practice questions.',
  updatedAt: NOW,
}

/** An undated lesson with no notes: both optional keys absent. */
const UNDATED_LESSON: Lesson = {
  id: 'lesson-undated',
  subject: 'practice-i',
  topic: 'Community health nursing',
  status: 'not-started',
  updatedAt: NOW,
}

interface Snapshot {
  decks: Deck[]
  cards: Card[]
  reviewLogs: ReviewLog[]
  settings: AppSettings[]
  sessions: Session[]
  lessons: Lesson[]
}

function byId<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * Every table, in a stable order.
 *
 * Sorted, because IndexedDB returns primary-key order and a round trip through a bulk put is not
 * obliged to preserve it — the assertion is about the rows, not about their storage order.
 */
async function snapshot(): Promise<Snapshot> {
  const db = await getDb()

  return {
    decks: byId(await db.decks.toArray()),
    cards: byId(await db.cards.toArray()),
    reviewLogs: byId(await db.reviewLogs.toArray()),
    settings: byId(await db.settings.toArray()),
    sessions: byId(await db.sessions.toArray()),
    lessons: byId(await db.lessons.toArray()),
  }
}

/** A device she has been using: real rows in all six tables, including the awkward ones. */
async function seedFixture(): Promise<void> {
  const db = await getDb()

  const storedSettings = await db.settings.get(SETTINGS_ID)
  if (!storedSettings) throw new Error('The test database was not seeded, so the fixture has no base.')

  await db.settings.put({
    ...storedSettings,
    examDate: EXAM_DATE,
    cramThresholdDays: 45,
    seededAt: SEEDED_AT,
    cloudSync: true,
    workMin: 30,
    updatedAt: NOW,
  })

  await db.decks.put(CUSTOM_DECK)

  // A deck she deleted. Soft-deleted, so the row is still a row — and the deck a naive re-seed
  // would resurrect.
  const practiceV = await db.decks.get('deck-practice-v')
  if (!practiceV) throw new Error('The seeded fifth deck is missing; the fixture assumes it.')
  await db.decks.put({ ...practiceV, deletedAt: TOMBSTONE_AT, updatedAt: TOMBSTONE_AT })

  await db.cards.bulkPut([FULL_CARD, NEVER_REVIEWED_CARD, DELETED_CARD])
  await db.reviewLogs.put(REVIEW_LOG)
  await db.sessions.bulkPut([COMPLETED_SESSION, ABANDONED_SESSION])
  await db.lessons.bulkPut([DATED_LESSON, UNDATED_LESSON])
}

describe('exporting', () => {
  it('describes the whole database, not a sample', async () => {
    await seedFixture()

    const counts = await listTableCounts()

    expect(counts).toEqual({
      decks: 6,
      cards: 3,
      reviewLogs: 1,
      settings: 1,
      sessions: 2,
      lessons: 2,
    })
  })

  it('produces a file this version can read back, stamped with the moment it was taken', async () => {
    await seedFixture()

    const { text, counts } = await exportBackup(NOW)
    const parsed = parseBackup(text)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.envelope.formatVersion).toBe(BACKUP_FORMAT_VERSION)
    expect(parsed.envelope.exportedAt).toBe(NOW)
    expect(parsed.envelope.counts).toEqual(counts)
    expect(counts).toEqual(await listTableCounts())
  })
})

describe('a round trip', () => {
  it('brings back every table exactly, tombstones and absent optional fields included', async () => {
    await seedFixture()
    const before = await snapshot()
    const { text } = await exportBackup(NOW)

    // The device is wiped: this is the "cleared database, new laptop" case the feature exists for.
    await clearDatabaseForTests()
    expect((await listTableCounts()).cards).toBe(0)

    const outcome = await importBackup(text, NOW)
    expect(outcome.ok).toBe(true)

    const after = await snapshot()

    // Table by table, because "some tables were restored" is not the property being claimed.
    expect(after.decks).toEqual(before.decks)
    expect(after.cards).toEqual(before.cards)
    expect(after.reviewLogs).toEqual(before.reviewLogs)
    expect(after.settings).toEqual(before.settings)
    expect(after.sessions).toEqual(before.sessions)
    expect(after.lessons).toEqual(before.lessons)

    // And stated directly, because the two rows above that `toEqual` cannot describe are the point.
    expect(after.cards.find((card) => card.id === 'card-deleted')?.deletedAt).toBe(TOMBSTONE_AT)
    expect(after.cards.find((card) => card.id === 'card-never-reviewed')).not.toHaveProperty(
      'lastReviewedAt',
    )
    expect(after.lessons.find((lesson) => lesson.id === 'lesson-undated')).not.toHaveProperty(
      'deadline',
    )
    expect(after.lessons.find((lesson) => lesson.id === 'lesson-undated')).not.toHaveProperty('notes')
    expect(after.sessions.find((session) => session.id === 'session-abandoned')?.completed).toBe(
      false,
    )
    expect(after.decks.find((deck) => deck.id === 'deck-practice-v')?.deletedAt).toBe(TOMBSTONE_AT)
  })

  it('replaces rather than combines: a row that is not in the file does not survive', async () => {
    await seedFixture()
    const { text } = await exportBackup(NOW)

    await clearDatabaseForTests()
    const db = await getDb()
    await db.lessons.put({
      id: 'lesson-only-here',
      subject: 'practice-i',
      topic: 'Not in the file',
      status: 'not-started',
      updatedAt: NOW,
    })

    await importBackup(text, NOW)

    // A merge would keep this. Import is a transfer, not a sync — see docs/EXPORT-IMPORT.md.
    expect(await db.lessons.get('lesson-only-here')).toBeUndefined()
    expect(await db.lessons.count()).toBe(2)
  })
})

interface DamagedFile {
  format?: unknown
  formatVersion?: unknown
  exportedAt?: unknown
  counts: Record<string, unknown>
  tables: Record<string, unknown[]>
}

function damage(valid: string, change: (file: DamagedFile) => void): string {
  const file = JSON.parse(valid) as DamagedFile
  change(file)
  return JSON.stringify(file)
}

const REFUSALS: { name: string; text: (valid: string) => string }[] = [
  { name: 'it is not JSON at all', text: () => 'not json' },
  { name: 'it is not one of our files', text: (v) => damage(v, (f) => (f.format = 'other-app')) },
  { name: 'the format version is missing', text: (v) => damage(v, (f) => delete f.formatVersion) },
  { name: 'the format version is from the future', text: (v) => damage(v, (f) => (f.formatVersion = 2)) },
  { name: 'a table is missing', text: (v) => damage(v, (f) => delete f.tables.lessons) },
  {
    name: 'a table is not a list',
    text: (v) => damage(v, (f) => (f.tables.lessons = null as unknown as unknown[])),
  },
  { name: 'it holds a table this version does not know', text: (v) => damage(v, (f) => (f.tables.notes = [])) },
  { name: 'a card has no id', text: (v) => damage(v, (f) => (f.tables.cards = [{ front: 'x' }])) },
  {
    name: 'the same card appears twice',
    text: (v) =>
      damage(v, (f) => {
        const card = (f.tables.cards ?? [])[0]
        f.tables.cards = [card, card]
        f.counts.cards = 2
      }),
  },
  { name: 'the counts disagree with the file', text: (v) => damage(v, (f) => (f.counts.cards = 99)) },
  {
    name: 'the settings row is gone',
    text: (v) =>
      damage(v, (f) => {
        f.tables.settings = []
        f.counts.settings = 0
      }),
  },
]

describe('a refused file', () => {
  it.each(REFUSALS)('writes nothing at all when $name', async ({ text }) => {
    await seedFixture()
    const before = await snapshot()
    const valid = (await exportBackup(NOW)).text

    const outcome = await importBackup(text(valid), NOW)

    // Asserted against the database, not against the returned value: "it threw" and "it refused"
    // are both compatible with having emptied six tables on the way out.
    expect(outcome.ok).toBe(false)
    expect(await snapshot()).toEqual(before)
  })
})

describe('a write that fails partway through', () => {
  it('rolls the whole import back, including the tables it had already cleared', async () => {
    await seedFixture()
    const before = await snapshot()
    const { text } = await exportBackup(NOW)

    const db = await getDb()
    // The fifth of six writes: decks, cards, logs and sessions have already been cleared and
    // rewritten when this throws, so an implementation without one transaction over all six tables
    // leaves the device in a state that is neither hers nor the file's.
    vi.spyOn(db.lessons, 'bulkPut').mockRejectedValueOnce(new Error('the disk filled up'))

    await expect(importBackup(text, NOW)).rejects.toThrow()

    expect(await snapshot()).toEqual(before)
  })
})

describe('the seeding gate', () => {
  it('stamps a file that has none, so the next open does not add the five PRC decks back', async () => {
    await seedFixture()
    const before = await snapshot()
    const { text } = await exportBackup(NOW)

    // A valid file in every other way, with the marker removed — the shape a rounded-tripped file
    // from an older build would have.
    const IMPORT_AT = NOW + 5_000
    const markerless = damage(text, (file) => {
      const marker = (file.tables.settings ?? [])[0] as Record<string, unknown>
      delete marker.seededAt
    })

    await clearDatabaseForTests()
    expect((await importBackup(markerless, IMPORT_AT)).ok).toBe(true)

    const db = await getDb()

    // The app open that the marker exists to guard. `seedInitialData` is the same backstop `getDb()`
    // runs on every open, called here with a later clock so the two possible stamps are tellable
    // apart: the import's, or the open's.
    const OPEN_AT = IMPORT_AT + 999
    await seedInitialData(db, OPEN_AT)

    const settings = await db.settings.get(SETTINGS_ID)
    expect(settings?.seededAt).toBe(IMPORT_AT)

    const decks = byId(await db.decks.toArray())
    expect(decks.map((deck) => deck.id)).toEqual(before.decks.map((deck) => deck.id))
    expect(decks.find((deck) => deck.id === 'deck-practice-v')?.deletedAt).toBe(TOMBSTONE_AT)
  })

  it('carries an existing marker through untouched, rather than re-stamping it', async () => {
    await seedFixture()
    const { text } = await exportBackup(NOW)

    await clearDatabaseForTests()
    await importBackup(text, NOW + 5_000)

    const db = await getDb()
    const settings = await db.settings.get(SETTINGS_ID)

    // The import time is deliberately later than the marker: a stamp applied over an existing value
    // would still leave `seededAt` defined, so only this equality catches it.
    expect(settings?.seededAt).toBe(SEEDED_AT)
    expect(settings?.examDate).toBe(EXAM_DATE)
  })
})

describe('the format and the schema agree', () => {
  it('covers every table the schema declares, so a new table cannot be silently left out', async () => {
    const db = await getDb()

    expect(db.tables.map((table) => table.name).sort()).toEqual([...BACKUP_TABLES].sort())
  })

  it('agrees with the schema on the settings singleton id', () => {
    expect(SETTINGS_ROW_ID).toBe(SETTINGS_ID)
  })
})
