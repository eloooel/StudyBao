import { describe, expect, it } from 'vitest'

import type { AppSettings, ReviewLog } from '@/db/types'

import { mergeByUpdatedAt, mergeReviewLogs, mergeSettings, type SyncableRecord } from './merge'

/**
 * The merge unit, which is the part of sync where a mistake is unrecoverable.
 *
 * Every case in `docs/SYNC-MERGE.md` appears here by number, and the three rules that are easiest to
 * get wrong have their own cases: the tombstone tie-break, `seededAt` surviving the settings merge, and
 * a review log never being rewritten.
 */

interface Row extends SyncableRecord {
  label: string
}

function row(id: string, updatedAt: number, label = id, deletedAt?: number): Row {
  return { id, updatedAt, label, ...(deletedAt === undefined ? {} : { deletedAt }) }
}

function log(id: string, grade: 0 | 4 = 4, cardId = 'card-1'): ReviewLog {
  return { id, cardId, deckId: 'deck-1', reviewedAt: 1_000, grade, msSpent: 5_000 }
}

function settings(patch: Partial<AppSettings> = {}): AppSettings {
  return { id: 'app', cramThresholdDays: 30, cloudSync: true, updatedAt: 10, ...patch }
}

describe('mergeByUpdatedAt', () => {
  it('case 1: a row only this device has is kept and pushed', () => {
    const outcome = mergeByUpdatedAt<Row>([row('a', 10)], [])

    expect(outcome.merged).toEqual([row('a', 10)])
    expect(outcome.push).toEqual([row('a', 10)])
  })

  it('case 2: a row only the other device has is taken in and not pushed', () => {
    const outcome = mergeByUpdatedAt<Row>([], [row('b', 10)])

    expect(outcome.merged).toEqual([row('b', 10)])
    expect(outcome.push).toEqual([])
  })

  it('case 3: the newer remote edit wins and is not pushed back', () => {
    const outcome = mergeByUpdatedAt<Row>([row('a', 10, 'old')], [row('a', 20, 'new')])

    expect(outcome.merged).toEqual([row('a', 20, 'new')])
    expect(outcome.push).toEqual([])
  })

  it('case 4: the newer local edit wins and is pushed', () => {
    const outcome = mergeByUpdatedAt<Row>([row('a', 20, 'mine')], [row('a', 10, 'theirs')])

    expect(outcome.merged).toEqual([row('a', 20, 'mine')])
    expect(outcome.push).toEqual([row('a', 20, 'mine')])
  })

  it('case 5: at equal timestamps the remote tombstone wins', () => {
    const outcome = mergeByUpdatedAt<Row>([row('a', 20, 'live')], [row('a', 20, 'gone', 20)])

    expect(outcome.merged[0]?.deletedAt).toBe(20)
    // Nothing to push — and my first draft asserted a push here and was wrong. The remote already
    // *holds* the row that won, so there is no write back.
    expect(outcome.push).toEqual([])
  })

  it('case 5: and a local tombstone wins too, so the rule is not side-dependent', () => {
    const outcome = mergeByUpdatedAt<Row>([row('a', 20, 'gone', 20)], [row('a', 20, 'live')])

    expect(outcome.merged[0]?.deletedAt).toBe(20)
  })

  it('case 5: at equal timestamps and equal content, nothing is pushed', () => {
    const outcome = mergeByUpdatedAt<Row>([row('a', 20)], [row('a', 20)])

    expect(outcome.merged).toEqual([row('a', 20)])
    expect(outcome.push).toEqual([])
  })

  it('lets a newer edit beat an older delete — that is last-write-wins, stated on purpose', () => {
    // The opposite rule (a delete always winning) would mean a card could never be corrected after a
    // mistaken deletion. This case exists so nobody "fixes" the behaviour into that.
    const outcome = mergeByUpdatedAt<Row>([row('a', 30, 'edited back')], [row('a', 20, 'gone', 20)])

    expect(outcome.merged[0]?.deletedAt).toBeUndefined()
    expect(outcome.merged[0]?.label).toBe('edited back')
  })

  it('agrees on the merged set whichever side is called local', () => {
    const local = [row('a', 20, 'mine'), row('b', 5)]
    const remote = [row('a', 10, 'theirs'), row('c', 7), row('b', 9, 'theirs')]

    const one = mergeByUpdatedAt(local, remote)
    const two = mergeByUpdatedAt(remote, local)

    expect(two.merged).toEqual(one.merged)

    // `push` is deliberately relative to the local side, so it is *not* symmetric — that difference is
    // the whole point of passing a direction in.
    expect(one.push.map((entry) => entry.id)).toEqual(['a'])
    expect(two.push.map((entry) => entry.id)).toEqual(['b', 'c'])
  })

  it('sorts by id, so the result never depends on input order', () => {
    const outcome = mergeByUpdatedAt<Row>([row('c', 1), row('a', 1)], [row('b', 1)])

    expect(outcome.merged.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
  })

  it('is pure: the same inputs twice give the same outcome', () => {
    const local = [row('a', 20), row('b', 1)]
    const remote = [row('b', 2)]

    expect(mergeByUpdatedAt(local, remote)).toEqual(mergeByUpdatedAt(local, remote))
  })
})

describe('mergeReviewLogs', () => {
  it('case 6: merges union-only, so history from both devices survives', () => {
    const outcome = mergeReviewLogs([log('l1')], [log('l2')])

    expect(outcome.merged.map((entry) => entry.id)).toEqual(['l1', 'l2'])
    expect(outcome.push.map((entry) => entry.id)).toEqual(['l1'])
    expect(outcome.conflicts).toEqual([])
  })

  it('never rewrites a row present on both sides', () => {
    const outcome = mergeReviewLogs([log('l1')], [log('l1')])

    expect(outcome.merged).toHaveLength(1)
    expect(outcome.push).toEqual([])
  })

  it('reports a same-id conflict instead of choosing a side', () => {
    // Ids are random UUIDs, so this should be impossible — which is why it is surfaced rather than
    // resolved. Picking a winner here would be silent history loss with extra steps.
    const outcome = mergeReviewLogs([log('l1', 4)], [log('l1', 0)])

    expect(outcome.conflicts.map((entry) => entry.id)).toEqual(['l1'])
    expect(outcome.merged[0]?.grade).toBe(4)
    expect(outcome.push).toEqual([])
  })

  it('is idempotent: a second pull cannot duplicate history', () => {
    const local = [log('l1')]
    const remote = [log('l2')]

    const once = mergeReviewLogs(local, remote)
    const twice = mergeReviewLogs(once.merged, remote)

    // The property that matters: the merged set is stable, so a repeated pull cannot double her history.
    expect(twice.merged).toEqual(once.merged)
    expect(twice.merged).toHaveLength(2)

    // `push` does *not* drain to empty, and that is correct rather than a bug — the remote still lacks
    // `l1` until a push actually lands. Idempotence is about `merged`, not about the push list emptying.
    // My first draft asserted `[]` here and was wrong.
    expect(twice.push.map((entry) => entry.id)).toEqual(['l1'])
  })
})

describe('mergeSettings', () => {
  it('takes the remote row when it is newer', () => {
    const outcome = mergeSettings(
      settings({ updatedAt: 10, examDate: 1 }),
      settings({ updatedAt: 20, examDate: 2 }),
    )

    expect(outcome.merged[0]?.examDate).toBe(2)
    expect(outcome.push).toEqual([])
  })

  it('keeps seededAt when the winning row has lost it', () => {
    /*
     * The invariant that matters most in this file. `seedInitialData` is gated on `seededAt`
     * **"because a deck she deleted must stay deleted"** — so a plain last-write-wins merge that
     * replaced the row with one lacking it would re-seed five decks she may have deleted, which is the
     * local-first bug this codebase is most careful about.
     */
    const outcome = mergeSettings(
      settings({ updatedAt: 10, seededAt: 500 }),
      settings({ updatedAt: 20 }),
    )

    expect(outcome.merged[0]?.seededAt).toBe(500)
    expect(outcome.merged[0]?.updatedAt).toBe(20)
  })

  it('keeps seededAt when only the losing row has it', () => {
    const outcome = mergeSettings(
      settings({ updatedAt: 20 }),
      settings({ updatedAt: 10, seededAt: 500 }),
    )

    expect(outcome.merged[0]?.seededAt).toBe(500)
    expect(outcome.merged[0]?.updatedAt).toBe(20)
  })

  it('uses the earliest seededAt when both sides have one', () => {
    const outcome = mergeSettings(
      settings({ updatedAt: 20, seededAt: 900 }),
      settings({ updatedAt: 10, seededAt: 500 }),
    )

    expect(outcome.merged[0]?.seededAt).toBe(500)
  })

  it('omits seededAt entirely when neither side has one', () => {
    const outcome = mergeSettings(settings({ updatedAt: 10 }), settings({ updatedAt: 20 }))

    expect(outcome.merged[0]).not.toHaveProperty('seededAt')
  })

  it('pushes the merged row when it differs from the remote', () => {
    const outcome = mergeSettings(
      settings({ updatedAt: 10, seededAt: 500 }),
      settings({ updatedAt: 20 }),
    )

    expect(outcome.push).toHaveLength(1)
    expect(outcome.push[0]?.seededAt).toBe(500)
  })
})
