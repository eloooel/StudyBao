import { describe, expect, it } from 'vitest'

import { getDb } from '../schema'
import {
  abandonSession,
  completedWorkBlocks,
  completeSession,
  listDeletedSessions,
  listRecentSessions,
  listSessionsSince,
  recordTabHide,
  softDeleteSession,
  startSession,
} from './sessions'

/**
 * The sessions repository, against a real in-memory IndexedDB.
 *
 * The behaviours worth protecting are the ones that cannot be reconstructed later: that a block
 * interrupted by a closed tab is still a row, that an abandoned block never claims to be completed,
 * and that the elapsed time is a measurement rather than an accumulation.
 */
const NOW = 1_800_000_000_000
const MIN = 60_000

async function clearSessions(): Promise<void> {
  const db = await getDb()
  await db.sessions.clear()
}

describe('startSession', () => {
  it('writes a row immediately, so a closed tab is not a lost session', async () => {
    // The whole reason for the two-phase write. On an iPad, closing the tab is normal, and with
    // in-app notifications only there is no server to notice — so the row has to exist from the
    // moment she presses Start.
    await clearSessions()

    const session = await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW)
    const stored = (await getDb()).sessions.get(session.id)

    expect(await stored).toBeDefined()
    expect(await stored).toMatchObject({ type: 'working', startedAt: NOW, plannedMs: 25 * MIN })
  })

  it('records the planned end and does not claim to be completed', async () => {
    await clearSessions()

    const session = await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW)

    expect(session.endedAt).toBe(NOW + 25 * MIN)
    expect(session.completed).toBe(false)
    expect(session.tabHiddenCount).toBe(0)
    // No tombstone on a brand-new row.
    expect(session.deletedAt).toBeUndefined()
  })
})

describe('completeSession', () => {
  it('marks the block done with the measured duration', async () => {
    await clearSessions()
    const session = await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW)

    await completeSession(
      session.id,
      { actualMs: 25 * MIN + 1_200, tabHiddenCount: 0 },
      NOW + 25 * MIN,
    )

    expect(await (await getDb()).sessions.get(session.id)).toMatchObject({
      completed: true,
      actualMs: 25 * MIN + 1_200,
      endedAt: NOW + 25 * MIN,
    })
  })

  it('records how often the tab went hidden, because it cannot be reconstructed', async () => {
    await clearSessions()
    const session = await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW)

    await completeSession(session.id, { actualMs: 25 * MIN, tabHiddenCount: 3 }, NOW + 25 * MIN)

    expect((await (await getDb()).sessions.get(session.id))?.tabHiddenCount).toBe(3)
  })

  it('stores a duration that is never negative, even if the clock moved backwards', async () => {
    // A clock adjustment or a DST edge could hand us a negative measurement. Storing it would make
    // every later aggregate wrong in a way nobody could explain.
    await clearSessions()
    const session = await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW)

    await completeSession(session.id, { actualMs: -5_000, tabHiddenCount: -1 }, NOW)

    const stored = await (await getDb()).sessions.get(session.id)
    expect(stored?.actualMs).toBe(0)
    expect(stored?.tabHiddenCount).toBe(0)
  })
})

describe('abandonSession', () => {
  it('keeps the elapsed time but never claims completion', async () => {
    // A block she cut short must not inflate a streak or a focus total. It is still a row, because
    // "she started and stopped" is a fact worth having.
    await clearSessions()
    const session = await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW)

    await abandonSession(session.id, 8 * MIN, NOW + 8 * MIN)

    expect(await (await getDb()).sessions.get(session.id)).toMatchObject({
      completed: false,
      actualMs: 8 * MIN,
      endedAt: NOW + 8 * MIN,
    })
  })
})

describe('recordTabHide', () => {
  it('increments without a read-modify-write race between two hides', async () => {
    await clearSessions()
    const session = await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW)

    await recordTabHide(session.id, NOW + MIN)
    await recordTabHide(session.id, NOW + 2 * MIN)

    expect((await (await getDb()).sessions.get(session.id))?.tabHiddenCount).toBe(2)
  })

  it('is a no-op for a session that does not exist rather than throwing', async () => {
    // The row could have been cleared by a test reset or a tombstone while a block was running.
    await clearSessions()

    await expect(recordTabHide('missing', NOW)).resolves.toBeUndefined()
  })
})

describe('reading sessions', () => {
  it('returns the newest first', async () => {
    await clearSessions()
    const first = await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW)
    const second = await startSession({ type: 'break', plannedMs: 5 * MIN }, NOW + 30 * MIN)

    const recent = await listRecentSessions()

    expect(recent.map((session) => session.id)).toEqual([second.id, first.id])
  })

  it('leaves soft-deleted rows out of the list but keeps the tombstone', async () => {
    await clearSessions()
    const session = await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW)

    await softDeleteSession(session.id, NOW + MIN)

    expect(await listRecentSessions()).toHaveLength(0)
    expect(await listDeletedSessions()).toHaveLength(1)
    // Never removed: a hard delete is resurrected by the other device's next sync.
    expect(await (await getDb()).sessions.get(session.id)).toBeDefined()
  })

  it('filters by start time for the dashboard range query', async () => {
    await clearSessions()
    await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW)
    await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW + 60 * MIN)

    expect(await listSessionsSince(NOW + 30 * MIN)).toHaveLength(1)
    expect(await listSessionsSince(NOW - MIN)).toHaveLength(2)
  })

  it('caps the recent list without losing the truth', async () => {
    await clearSessions()
    for (let index = 0; index < 5; index += 1) {
      await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW + index * MIN)
    }

    expect(await listRecentSessions(2)).toHaveLength(2)
    expect(await listSessionsSince(0)).toHaveLength(5)
  })

  it('counts only completed work blocks', async () => {
    // Breaks are not focus, and an abandoned work block is not a completed one. Both mistakes
    // would inflate the dashboard's "focus breaks" figure.
    await clearSessions()
    const done = await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW)
    await completeSession(done.id, { actualMs: 25 * MIN, tabHiddenCount: 0 }, NOW + 25 * MIN)

    const abandoned = await startSession({ type: 'working', plannedMs: 25 * MIN }, NOW + 30 * MIN)
    await abandonSession(abandoned.id, 4 * MIN, NOW + 34 * MIN)

    const rest = await startSession({ type: 'break', plannedMs: 5 * MIN }, NOW + 40 * MIN)
    await completeSession(rest.id, { actualMs: 5 * MIN, tabHiddenCount: 0 }, NOW + 45 * MIN)

    const all = await listSessionsSince(0)
    expect(all).toHaveLength(3)
    expect(completedWorkBlocks(all).map((session) => session.id)).toEqual([done.id])
  })
})
