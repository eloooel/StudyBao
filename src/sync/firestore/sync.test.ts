import { afterEach, describe, expect, it } from 'vitest'

import { StudyBaoDb } from '@/db/schema'
import type { AppSettings, Card, Deck, Lesson, ReviewLog, Session } from '@/db/types'
import { createMemoryRemoteStore } from '@/test/memory-remote'

import { createDexieLocalStore } from './local-store'
import { syncOnce } from './sync'
import { createTransport, type Transport } from './transport'

/**
 * Sync end to end with **two real databases**. "Pull it into an empty side" is a second `StudyBaoDb`,
 * not a second variable, because the failures this milestone can produce are database failures: a row
 * written under the wrong id, a tombstone that does not arrive, a review log that is overwritten.
 *
 * Only the remote is a fake (see `src/test/memory-remote.ts`). The transport, the merge and Dexie are the
 * production code paths.
 */

const opened: StudyBaoDb[] = []

async function openEmpty(): Promise<StudyBaoDb> {
  const db = new StudyBaoDb(`sync-test-${crypto.randomUUID()}`)
  opened.push(db)
  await db.open()

  // A brand-new database seeds five decks and a settings row. Cleared so "empty side" means empty.
  await Promise.all([
    db.decks.clear(),
    db.cards.clear(),
    db.reviewLogs.clear(),
    db.settings.clear(),
    db.sessions.clear(),
    db.lessons.clear(),
  ])

  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

const deck: Deck = {
  id: 'deck-1',
  subject: 'practice-i',
  name: 'Nursing Practice I',
  scope: '',
  updatedAt: 100,
}

const card: Card = {
  id: 'card-1',
  deckId: 'deck-1',
  front: 'Normal adult respiratory rate?',
  back: '12–20 per minute',
  tags: ['fundamentals'],
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
  learningStep: 0,
  nextReview: 200,
  createdAt: 10,
  updatedAt: 100,
}

/** A card she deleted on purpose. It must survive the round-trip as a tombstone, not vanish. */
const tombstonedCard: Card = {
  ...card,
  id: 'card-deleted',
  deletedAt: 90,
  updatedAt: 90,
}

const log: ReviewLog = {
  id: 'log-1',
  cardId: 'card-1',
  deckId: 'deck-1',
  reviewedAt: 100,
  grade: 4,
  msSpent: 4_000,
}

const settings: AppSettings = {
  id: 'app',
  cramThresholdDays: 30,
  cloudSync: true,
  seededAt: 10,
  updatedAt: 100,
}

const session: Session = {
  id: 'session-1',
  type: 'working',
  startedAt: 100,
  endedAt: 1_500_100,
  plannedMs: 1_500_000,
  actualMs: 1_500_000,
  completed: true,
  tabHiddenCount: 0,
  updatedAt: 1_500_100,
}

const lesson: Lesson = {
  id: 'lesson-1',
  subject: 'practice-ii',
  topic: 'Fluid and electrolytes',
  status: 'reviewing',
  updatedAt: 100,
}

async function seed(db: StudyBaoDb): Promise<void> {
  await db.decks.bulkPut([deck])
  await db.cards.bulkPut([card, tombstonedCard])
  await db.reviewLogs.bulkPut([log])
  await db.settings.bulkPut([settings])
  await db.sessions.bulkPut([session])
  await db.lessons.bulkPut([lesson])
}

function storeFor(db: StudyBaoDb) {
  return createDexieLocalStore(() => Promise.resolve(db))
}

function sorted<T extends { id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id))
}

describe('syncOnce', () => {
  it('round-trips every table into an empty side, including a ReviewLog and a tombstone', async () => {
    const source = await openEmpty()
    const target = await openEmpty()
    await seed(source)

    const remote = createMemoryRemoteStore()
    const transport = createTransport(remote)

    const first = await syncOnce(transport, storeFor(source))
    expect(first.ok).toBe(true)
    expect(first.rejected).toEqual([])
    expect(first.conflicts).toEqual([])

    // Everything local was pushed on the first sync: this is case 1, "everything she has is pushed".
    expect(remote.documents('decks').map((document) => document.id)).toEqual(['deck-1'])
    expect(remote.documents('reviewLogs').map((document) => document.id)).toEqual(['log-1'])
    expect(remote.documents('settings').map((document) => document.id)).toEqual(['app'])

    const second = await syncOnce(transport, storeFor(target))
    expect(second.ok).toBe(true)

    expect(sorted(await target.decks.toArray())).toEqual(sorted(await source.decks.toArray()))
    expect(sorted(await target.cards.toArray())).toEqual(sorted(await source.cards.toArray()))
    expect(sorted(await target.reviewLogs.toArray())).toEqual([
      ...sorted(await source.reviewLogs.toArray()),
    ])
    expect(await target.settings.toArray()).toEqual(await source.settings.toArray())
    expect(sorted(await target.sessions.toArray())).toEqual(sorted(await source.sessions.toArray()))
    expect(sorted(await target.lessons.toArray())).toEqual(sorted(await source.lessons.toArray()))

    // The tombstone arrived as a tombstone. A hard delete here would be resurrected by the other device.
    const deleted = await target.cards.get('card-deleted')
    expect(deleted?.deletedAt).toBe(90)
  })

  it('merges ReviewLogs union-only, so history from both devices survives', async () => {
    const first = await openEmpty()
    const second = await openEmpty()
    await seed(first)

    const remote = createMemoryRemoteStore()
    const transport = createTransport(remote)

    await syncOnce(transport, storeFor(first))
    await syncOnce(transport, storeFor(second))

    // A review happens on the second device only.
    const secondLog: ReviewLog = { ...log, id: 'log-2', reviewedAt: 200 }
    await second.reviewLogs.bulkPut([secondLog])

    await syncOnce(transport, storeFor(second))
    await syncOnce(transport, storeFor(first))

    const ids = (rows: ReviewLog[]) => sorted(rows).map((row) => row.id)

    expect(ids(await first.reviewLogs.toArray())).toEqual(['log-1', 'log-2'])
    expect(ids(await second.reviewLogs.toArray())).toEqual(['log-1', 'log-2'])
  })

  it('reports a same-id ReviewLog conflict instead of resolving it', async () => {
    const local = await openEmpty()
    await local.reviewLogs.bulkPut([log])

    const remote = createMemoryRemoteStore()
    remote.seed('reviewLogs', [
      {
        id: log.id,
        data: { ...log, grade: 3 },
      },
    ])

    const outcome = await syncOnce(createTransport(remote), storeFor(local))

    expect(outcome.conflicts.map((row) => row.id)).toEqual(['log-1'])
    // The local copy is kept — an append-only row is never rewritten — and nothing is pushed over the
    // remote copy, so the difference stays visible for a caller to report.
    expect((await local.reviewLogs.get('log-1'))?.grade).toBe(4)
    expect(remote.documents('reviewLogs')[0]?.data).toMatchObject({ grade: 3 })
  })

  it('keeps seededAt when a newer remote settings row has lost it, and pushes the marker back', async () => {
    /*
     * The local-first bug this codebase is most careful about, arriving through the sync path: a plain
     * last-write-wins merge would take the newer remote row, drop `seededAt`, and the next launch would
     * re-seed five PRC decks she may have deleted.
     */
    const local = await openEmpty()
    await local.settings.bulkPut([settings])

    const remote = createMemoryRemoteStore()
    remote.seed('settings', [
      {
        id: 'app',
        data: { id: 'app', cramThresholdDays: 30, cloudSync: true, updatedAt: 200 },
      },
    ])

    const outcome = await syncOnce(createTransport(remote), storeFor(local))
    expect(outcome.ok).toBe(true)

    const stored = await local.settings.get('app')
    expect(stored?.updatedAt).toBe(200)
    expect(stored?.seededAt).toBe(10)

    // Pushed back, so the other device does not lose the marker on its next merge either.
    expect(remote.documents('settings')[0]?.data).toMatchObject({ seededAt: 10 })
  })

  it('is the first-sync case when the remote is empty: nothing is removed and everything is pushed', async () => {
    const local = await openEmpty()
    await seed(local)

    const remote = createMemoryRemoteStore()
    const outcome = await syncOnce(createTransport(remote), storeFor(local))

    expect(outcome.ok).toBe(true)
    expect(outcome.rejected).toEqual([])
    expect(await local.decks.count()).toBe(1)
    expect(await local.cards.count()).toBe(2)
    expect(remote.documents('cards').map((document) => document.id)).toEqual([
      'card-1',
      'card-deleted',
    ])
  })

  it('rejects a malformed remote row rather than writing it', async () => {
    const local = await openEmpty()

    const remote = createMemoryRemoteStore()
    const malformed: Record<string, unknown> = { ...deck, id: 'bad-deck' }
    delete malformed.updatedAt

    remote.seed('decks', [
      { id: 'good-deck', data: { ...deck, id: 'good-deck' } },
      { id: 'bad-deck', data: malformed },
    ])

    const outcome = await syncOnce(createTransport(remote), storeFor(local))

    expect(outcome.rejected).toHaveLength(1)
    expect(outcome.rejected[0]).toMatchObject({ table: 'decks', id: 'bad-deck' })

    expect(await local.decks.get('good-deck')).toBeDefined()
    expect(await local.decks.get('bad-deck')).toBeUndefined()

    // And the bad row is not pushed anywhere: it never reached the merge.
    expect(outcome.push.batches.every((batchResult) => batchResult.written === 0)).toBe(true)
    expect(remote.documents('decks').map((document) => document.id)).toEqual([
      'good-deck',
      'bad-deck',
    ])
  })

  it('turns a failed pull into a value, and touches nothing', async () => {
    const local = await openEmpty()
    await seed(local)

    const offline: Transport = {
      pull: () => Promise.reject(new Error("Couldn't reach the server.")),
      push: () => Promise.resolve({ batches: [], ok: true }),
    }

    const outcome = await syncOnce(offline, storeFor(local))

    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain("Couldn't reach the server.")
    expect(await local.decks.count()).toBe(1)
    expect(await local.reviewLogs.count()).toBe(1)
  })
})
