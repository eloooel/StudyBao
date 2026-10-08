import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_CRAM_THRESHOLD_DAYS, SETTINGS_ID, StudyBaoDb, seedInitialData } from './schema'
import { deckIdForPart } from './seed-data'
import type { Card, Lesson } from './types'

/**
 * Migrations and seeding.
 *
 * Two things are being protected here, and both are one-way on her device:
 *
 * 1. **A schema change must not lose rows.** Version 1 is the first version, so there is no
 *    v(N−1) in the world yet; what is tested is that opening at the current version preserves
 *    every shape of row, including a tombstone and a row written without optional fields.
 *    When version 2 arrives, the pattern below — seed an older database, reopen, assert —
 *    is the test to extend. docs/ai/change-data-model.md requires it.
 * 2. **Seeding must be idempotent against deletion.** A deck she deleted must stay deleted.
 *    Gating on "are there any decks" would resurrect it on every launch.
 *
 * Databases are opened under distinct names and deleted afterwards so these tests cannot
 * leak into the shared in-memory IndexedDB that the repository tests use.
 */

const created: string[] = []

function uniqueName(): string {
  const name = `studybao-migration-${crypto.randomUUID()}`
  created.push(name)
  return name
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((name) => Dexie.delete(name)))
})

const DAY = 86_400_000

describe('schema version 1', () => {
  it('preserves every row shape across a close and reopen', async () => {
    const name = uniqueName()
    const deckId = deckIdForPart('practice-i')
    const now = 1_800_000_000_000

    const liveCard: Card = {
      id: 'card-live',
      deckId,
      front: 'What is the first link in the chain of infection?',
      back: 'The infectious agent.',
      tags: ['Pathophysiology'],
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      lapses: 0,
      learningStep: null,
      nextReview: now + 6 * DAY,
      lastReviewedAt: now,
      createdAt: now - 30 * DAY,
      updatedAt: now,
    }

    // A tombstone. The point of the test: a migration must not quietly drop or un-delete it.
    const deletedCard: Card = {
      ...liveCard,
      id: 'card-deleted',
      nextReview: now,
      createdAt: now - 10 * DAY,
      updatedAt: now - DAY,
      deletedAt: now - DAY,
    }

    // The "row with the field missing" case the runbook calls for. Optional fields written by
    // an older build arrive as absent properties, not as defaults.
    const legacyCard: Omit<Card, 'learningStep' | 'lastReviewedAt' | 'deletedAt'> = {
      id: 'card-legacy',
      deckId,
      front: 'Legacy front',
      back: 'Legacy back',
      tags: [],
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
      lapses: 0,
      nextReview: now,
      createdAt: now - 2 * DAY,
      updatedAt: now - 2 * DAY,
    }

    const first = new StudyBaoDb(name)
    await first.open()
    await first.decks.put({
      id: deckId,
      subject: 'practice-i',
      name: 'Nursing Practice I',
      scope: 'Community Health Nursing',
      updatedAt: now,
    })
    await first.cards.bulkAdd([liveCard, deletedCard, legacyCard as Card])
    await first.reviewLogs.add({
      id: 'log-1',
      cardId: 'card-live',
      deckId,
      reviewedAt: now,
      grade: 4,
      msSpent: 4200,
    })
    await first.settings.put({
      id: SETTINGS_ID,
      cramThresholdDays: DEFAULT_CRAM_THRESHOLD_DAYS,
      cloudSync: true,
      updatedAt: now,
      seededAt: now,
    })
    first.close()

    const reopened = new StudyBaoDb(name)
    await reopened.open()

    // Opening a fresh database name fires the `populate` hook, which seeds the five PRC decks
    // and a settings row. `deckIdForPart('practice-i')` is one of those five, so this row
    // *replaces* the seed rather than adding a sixth.
    expect(await reopened.decks.count()).toBe(5)
    expect(await reopened.cards.count()).toBe(3)
    expect(await reopened.reviewLogs.count()).toBe(1)

    // No row lost, no field dropped.
    expect(await reopened.cards.get('card-live')).toEqual(liveCard)

    // The tombstone is still a tombstone.
    const stillDeleted = await reopened.cards.get('card-deleted')
    expect(stillDeleted?.deletedAt).toBe(now - DAY)

    // The legacy row reads back with its optional fields still absent rather than nulled.
    const legacy = await reopened.cards.get('card-legacy')
    expect(legacy?.learningStep).toBeUndefined()
    expect(legacy?.deletedAt).toBeUndefined()
    expect(legacy?.lastReviewedAt).toBeUndefined()

    const log = await reopened.reviewLogs.get('log-1')
    expect(log?.grade).toBe(4)
    expect(log?.msSpent).toBe(4200)

    reopened.close()
  })

  it('reopens at the current version and reports every table', async () => {
    const name = uniqueName()
    const db = new StudyBaoDb(name)
    await db.open()

    expect(db.verno).toBe(3)
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'cards',
      'decks',
      'lessons',
      'reviewLogs',
      'sessions',
      'settings',
    ])

    db.close()
  })
})

/**
 * Version 1 → the current version, i.e. every upgrade in sequence.
 *
 * This was the v1 → v2 test until Workflow E added version 3, and it is deliberately kept rather
 * than replaced: a database that has been sitting on her iPad since Workflow B takes the whole
 * chain, and the failure this catches is a *later* version block that restates an earlier version's
 * stores wrongly and silently drops a table's contents on the way past.
 *
 * The specific danger is that a store definition mistake loses months of SM-2 history, and the
 * upgrade functions are deliberately empty — they add tables and transform nothing — so what these
 * tests defend is not the functions but the store definitions.
 */
describe('schema version 1 → 3', () => {
  /**
   * A version 1 database, written the way Workflow B/C would have written it.
   *
   * Built from a bare `Dexie` rather than `StudyBaoDb`, because `StudyBaoDb` now declares version
   * 2 — opening it would run the very upgrade being tested. This is the honest way to simulate "a
   * database that exists in the world today".
   */
  async function openLegacyV1(name: string): Promise<Dexie> {
    const legacy = new Dexie(name)
    legacy.version(1).stores({
      decks: 'id, subject, updatedAt, deletedAt',
      cards: 'id, deckId, nextReview, updatedAt, deletedAt',
      reviewLogs: 'id, cardId, deckId, reviewedAt',
      settings: 'id',
    })
    await legacy.open()
    return legacy
  }

  it('keeps every row and every field, and adds an empty sessions table', async () => {
    const name = uniqueName()
    const now = 1_800_000_000_000
    const deckId = deckIdForPart('practice-i')

    const card: Card = {
      id: 'card-1',
      deckId,
      front: 'Front',
      back: 'Back',
      tags: ['Pharmacology'],
      easeFactor: 2.36,
      intervalDays: 15,
      repetitions: 3,
      lapses: 1,
      learningStep: null,
      nextReview: now + 15 * DAY,
      lastReviewedAt: now - DAY,
      createdAt: now - 60 * DAY,
      updatedAt: now - DAY,
    }

    const legacy = await openLegacyV1(name)
    await legacy.table('decks').put({
      id: deckId,
      subject: 'practice-i',
      name: 'Nursing Practice I',
      scope: 'Community Health Nursing',
      updatedAt: now,
    })
    await legacy
      .table('cards')
      .bulkAdd([card, { ...card, id: 'card-deleted', deletedAt: now - DAY }])
    await legacy.table('reviewLogs').add({
      id: 'log-1',
      cardId: 'card-1',
      deckId,
      reviewedAt: now,
      grade: 4,
      msSpent: 4200,
    })
    await legacy.table('settings').put({
      id: SETTINGS_ID,
      cramThresholdDays: DEFAULT_CRAM_THRESHOLD_DAYS,
      cloudSync: true,
      seededAt: now,
      updatedAt: now,
    })
    legacy.close()

    // Reopen through the real class, which runs the upgrade.
    const upgraded = new StudyBaoDb(name)
    await upgraded.open()

    expect(upgraded.verno).toBe(3)
    // The tables added by the later versions exist and are empty — not populated with invented
    // rows. `sessions` is version 2's, `lessons` is version 3's.
    expect(await upgraded.sessions.count()).toBe(0)
    expect(await upgraded.lessons.count()).toBe(0)

    // No card lost, and the SM-2 history is byte-for-byte intact. This is the assertion that
    // matters: `intervalDays` and `lapses` cannot be reconstructed.
    expect(await upgraded.cards.get('card-1')).toEqual(card)
    expect(await upgraded.cards.get('card-deleted')).toMatchObject({ deletedAt: now - DAY })
    expect(await upgraded.reviewLogs.count()).toBe(1)

    // The settings row survives with its Workflow B fields and no invented timer values: absence
    // means "use the default", and writing 25 here would freeze today's default into her row.
    const settings = await upgraded.settings.get(SETTINGS_ID)
    expect(settings).toMatchObject({
      cramThresholdDays: DEFAULT_CRAM_THRESHOLD_DAYS,
      cloudSync: true,
      seededAt: now,
    })
    expect(settings?.workMin).toBeUndefined()

    upgraded.close()
  })

  it('does not resurrect a deck she had deleted before the upgrade', async () => {
    // The seeding path runs on every `getDb()`, so a migration is exactly where a "seed if empty"
    // bug would show up. Gating on `seededAt` is what prevents it.
    const name = uniqueName()
    const now = 1_800_000_000_000
    const target = deckIdForPart('practice-v')

    const legacy = await openLegacyV1(name)
    await legacy.table('settings').put({
      id: SETTINGS_ID,
      cramThresholdDays: DEFAULT_CRAM_THRESHOLD_DAYS,
      cloudSync: true,
      seededAt: now,
      updatedAt: now,
    })
    for (const part of ['practice-i', 'practice-ii', 'practice-iii', 'practice-iv', 'practice-v']) {
      await legacy.table('decks').put({
        id: deckIdForPart(part as 'practice-i'),
        subject: part,
        name: part,
        scope: '',
        updatedAt: now,
      })
    }
    await legacy.table('decks').update(target, { deletedAt: now - DAY })
    legacy.close()

    const upgraded = new StudyBaoDb(name)
    await upgraded.open()
    await seedInitialData(upgraded, now + DAY)

    expect((await upgraded.decks.get(target))?.deletedAt).toBe(now - DAY)
    upgraded.close()
  })

  it('is safe to open twice, because a failed migration can be retried', async () => {
    // The runbook requires upgrade functions to be idempotent. These do nothing, so the test
    // is really asserting that a no-op is safe: reopening must not clear `sessions` or `lessons`
    // or re-run seeding in a way that changes rows.
    const name = uniqueName()
    const first = new StudyBaoDb(name)
    await first.open()
    const deckCount = await first.decks.count()
    first.close()

    const second = new StudyBaoDb(name)
    await second.open()

    expect(second.verno).toBe(3)
    expect(await second.decks.count()).toBe(deckCount)
    second.close()
  })
})

/**
 * Version 2 → version 3, the Workflow E migration.
 *
 * Same shape as the v1 test above, and the same reasoning: version 3 adds a table and transforms
 * nothing, so the risk is in the store definitions rather than in the upgrade function. What this
 * one defends specifically is that a database already carrying Workflow D's `sessions` — the first
 * migration in the project's history — arrives at version 3 with every session row intact, because
 * repeating "the v1 stores" in the v3 block instead of restating the v2 ones is exactly how the
 * `sessions` table would be emptied.
 */
describe('schema version 2 → 3', () => {
  /**
   * A version 2 database, written the way Workflows B–D would have written it. Built from a bare
   * `Dexie` for the reason the v1 helper gives: `StudyBaoDb` declares version 3, so opening it
   * would run the migration under test.
   */
  async function openLegacyV2(name: string): Promise<Dexie> {
    const legacy = new Dexie(name)
    legacy.version(2).stores({
      decks: 'id, subject, updatedAt, deletedAt',
      cards: 'id, deckId, nextReview, updatedAt, deletedAt',
      reviewLogs: 'id, cardId, deckId, reviewedAt',
      settings: 'id',
      sessions: 'id, startedAt, type, updatedAt, deletedAt',
    })
    await legacy.open()
    return legacy
  }

  it('keeps every row, adds an empty lessons table, and invents no deadlines', async () => {
    const name = uniqueName()
    const now = 1_800_000_000_000

    const session = {
      id: 'session-1',
      type: 'working',
      startedAt: now - 25 * 60_000,
      endedAt: now,
      plannedMs: 25 * 60_000,
      actualMs: 25 * 60_000,
      completed: true,
      tabHiddenCount: 2,
      updatedAt: now,
    }

    const legacy = await openLegacyV2(name)
    await legacy.table('settings').put({
      id: SETTINGS_ID,
      cramThresholdDays: DEFAULT_CRAM_THRESHOLD_DAYS,
      cloudSync: true,
      seededAt: now,
      updatedAt: now,
    })
    await legacy.table('sessions').bulkAdd([
      session,
      // A tombstone on the table added by the previous migration, and a row she abandoned —
      // `completed: false` with a planned end that has passed. Both must survive untouched.
      { ...session, id: 'session-deleted', deletedAt: now - DAY },
      { ...session, id: 'session-abandoned', completed: false, actualMs: 0 },
    ])
    legacy.close()

    const upgraded = new StudyBaoDb(name)
    await upgraded.open()

    expect(upgraded.verno).toBe(3)
    // The new table is empty: a migration must not invent lessons, and must not invent a deadline
    // for a lesson she never created.
    expect(await upgraded.lessons.count()).toBe(0)

    expect(await upgraded.sessions.get('session-1')).toEqual(session)
    expect((await upgraded.sessions.get('session-deleted'))?.deletedAt).toBe(now - DAY)
    expect((await upgraded.sessions.get('session-abandoned'))?.completed).toBe(false)
    expect(await upgraded.sessions.count()).toBe(3)

    // A settings row written before Workflow D's optional timer fields existed still reads back
    // with them absent — absence means "use the default", never "zero minutes".
    const settings = await upgraded.settings.get(SETTINGS_ID)
    expect(settings?.workMin).toBeUndefined()
    expect(settings?.seededAt).toBe(now)

    upgraded.close()
  })

  it('reopens at version 3 with a lesson tombstone and a lesson missing its optional fields', async () => {
    // The runbook's two required row shapes, for the table this version introduces: a soft-deleted
    // row must stay deleted, and a row written without its optional fields must read back with them
    // still *absent* rather than nulled or defaulted. A lesson she never dated is the normal case
    // here, not a legacy one — so "no deadline" has to survive every reopen.
    const name = uniqueName()
    const now = 1_800_000_000_000

    const legacyShaped = {
      id: 'lesson-undated',
      subject: 'practice-iv',
      topic: 'Endocrine emergencies',
      status: 'not-started',
      updatedAt: now - 3 * DAY,
    }

    const seeded = new StudyBaoDb(name)
    await seeded.open()
    await seeded.lessons.bulkAdd([
      legacyShaped as Lesson,
      {
        id: 'lesson-deleted',
        subject: 'practice-i',
        topic: 'Something she removed',
        deadline: now,
        status: 'reviewing',
        updatedAt: now - DAY,
        deletedAt: now - DAY,
      },
    ])
    seeded.close()

    const reopened = new StudyBaoDb(name)
    await reopened.open()

    const undated = await reopened.lessons.get('lesson-undated')
    expect(undated).toEqual(legacyShaped)
    expect(Object.hasOwn(undated as Lesson, 'deadline')).toBe(false)
    expect(Object.hasOwn(undated as Lesson, 'notes')).toBe(false)

    expect((await reopened.lessons.get('lesson-deleted'))?.deletedAt).toBe(now - DAY)
    expect(await reopened.lessons.count()).toBe(2)

    reopened.close()
  })
})

describe('seeding the five PRC decks', () => {
  it('creates the five parts with the verbatim scope when seeding runs explicitly', async () => {
    const name = uniqueName()
    const db = new StudyBaoDb(name)
    await db.open()
    // The open already seeded it (via `populate`); the marker makes this second call a no-op,
    // which is itself the idempotence guarantee. Either way the decks are the five parts.
    await seedInitialData(db, 1_800_000_000_000)

    const decks = await db.decks.toArray()
    expect(decks).toHaveLength(5)
    expect(decks.map((deck) => deck.name).sort()).toEqual([
      'Nursing Practice I',
      'Nursing Practice II',
      'Nursing Practice III',
      'Nursing Practice IV',
      'Nursing Practice V',
    ])
    // One scope string, checked character for character: these are transcribed from the PRC
    // program and a paraphrase is a taxonomy she cannot check against the real document.
    expect(decks.find((deck) => deck.subject === 'practice-v')?.scope).toBe(
      'Care of Clients with Maladaptive Patterns of Behavior (Acute and Chronic); Care of Clients with Life-Threatening Condition, Acutely Ill/Multi-Organ Problems, High Acuity and Emergency Situation',
    )

    expect(await db.settings.get(SETTINGS_ID)).toMatchObject({
      cramThresholdDays: DEFAULT_CRAM_THRESHOLD_DAYS,
      cloudSync: true,
    })

    db.close()
  })

  it('does not resurrect a deck she deleted', async () => {
    const name = uniqueName()
    const db = new StudyBaoDb(name)
    await db.open()

    // She deletes Nursing Practice V. This is a tombstone, not a removal.
    const target = deckIdForPart('practice-v')
    await db.decks.update(target, { deletedAt: 1_800_000_100_000 })

    // Next launch: seeding runs again, as it does on every `getDb()`.
    await seedInitialData(db, 1_800_000_200_000)

    expect(await db.decks.count()).toBe(5)
    const stillDeleted = await db.decks.get(target)
    expect(stillDeleted?.deletedAt).toBe(1_800_000_100_000)

    db.close()
  })

  it('is idempotent: seeding twice changes nothing', async () => {
    const name = uniqueName()
    const db = new StudyBaoDb(name)
    await db.open()

    const firstPass = await db.decks.toArray()
    const markerAfterOpen = (await db.settings.get(SETTINGS_ID))?.seededAt

    // A much later call, as happens on a later launch. It must change nothing at all — not the
    // decks, and not the marker, because the marker moving would let a future "reseed if the
    // marker is old" rule creep in.
    await seedInitialData(db, 1_800_000_500_000)

    expect(await db.decks.toArray()).toEqual(firstPass)
    expect((await db.settings.get(SETTINGS_ID))?.seededAt).toBe(markerAfterOpen)

    db.close()
  })

  it('does not overwrite a rename she made to a seeded deck', async () => {
    const name = uniqueName()
    const db = new StudyBaoDb(name)
    await db.open()

    const target = deckIdForPart('practice-i')
    await db.decks.update(target, { name: 'Community Health', updatedAt: 1_800_000_100_000 })

    await seedInitialData(db, 1_800_000_200_000)

    expect((await db.decks.get(target))?.name).toBe('Community Health')

    db.close()
  })
})
