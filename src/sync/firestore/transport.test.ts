import { describe, expect, it } from 'vitest'

import type { Deck } from '@/db/types'
import { createMemoryRemoteStore } from '@/test/memory-remote'

import { createTransport, type PushBatch } from './transport'

/**
 * The transport's own behaviour, without an emulator: validation of pulled rows, batching of pushes,
 * and the promise that it never invents a timestamp.
 *
 * The Firestore half of the seam is tested against the emulator in `rules/firestore.rules.test.ts`; this
 * file is the half that decides *what* is written, and it can therefore run in the fast suite.
 */

function deck(id: string, updatedAt = 1_000): Deck {
  return { id, subject: 'practice-i', name: id, scope: '', updatedAt }
}

function batch(rows: readonly unknown[], table: PushBatch['table'] = 'decks'): PushBatch {
  return { table, merged: [...rows], push: [...rows] }
}

describe('transport.pull', () => {
  it('rejects a malformed remote row and reports it, keeping the valid ones', async () => {
    const remote = createMemoryRemoteStore()
    const invalid: Record<string, unknown> = { ...deck('bad-deck') }
    delete invalid.updatedAt

    remote.seed('decks', [
      { id: 'good-deck', data: deck('good-deck') },
      { id: 'bad-deck', data: invalid },
    ])

    const pulled = await createTransport(remote).pull()

    expect(pulled.rows.decks.map((row) => row.id)).toEqual(['good-deck'])
    expect(pulled.rejected).toHaveLength(1)
    expect(pulled.rejected[0]).toMatchObject({ table: 'decks', id: 'bad-deck' })
    expect(pulled.rejected[0]?.reason).toContain('updatedAt')
  })

  it('rejects a document whose body id does not match its path', async () => {
    const remote = createMemoryRemoteStore()
    remote.seed('decks', [{ id: 'path-id', data: deck('body-id') }])

    const pulled = await createTransport(remote).pull()

    expect(pulled.rows.decks).toEqual([])
    expect(pulled.rejected).toEqual([
      {
        table: 'decks',
        id: 'path-id',
        reason: 'the record id does not match the document id',
      },
    ])
  })

  it('returns every table, including an empty one', async () => {
    const pulled = await createTransport(createMemoryRemoteStore()).pull()

    expect(pulled.rows).toEqual({
      decks: [],
      cards: [],
      reviewLogs: [],
      settings: [],
      sessions: [],
      lessons: [],
    })
    expect(pulled.rejected).toEqual([])
  })
})

describe('transport.push', () => {
  it('splits a table into commits of the remote’s batch size and reports each', async () => {
    // The Firestore limit is 500 writes per commit. The test uses 2 so the loop is countable: collapsing
    // it to one write is exactly the mutation that must turn this test red.
    const remote = createMemoryRemoteStore({ maxWritesPerBatch: 2 })
    const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => deck(id))

    const result = await createTransport(remote).push([batch(rows)])

    expect(remote.commits.map((commit) => commit.rows.length)).toEqual([2, 2, 1])
    expect(result.batches.map((entry) => entry.written)).toEqual([2, 2, 1])
    expect(result.ok).toBe(true)
    expect(remote.documents('decks').map((document) => document.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ])
  })

  it('reports a partial failure per batch instead of calling the whole transport down', async () => {
    const remote = createMemoryRemoteStore({ maxWritesPerBatch: 2 })
    remote.failOnCommit(2)

    const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => deck(id))
    const result = await createTransport(remote).push([batch(rows)])

    expect(result.ok).toBe(false)
    expect(result.batches.map((entry) => [entry.written, entry.ok])).toEqual([
      [2, true],
      [0, false],
      [1, true],
    ])
    expect(result.batches[1]?.error).toContain('connection lost')

    // The failed chunk did not land; the chunks on either side did.
    expect(remote.documents('decks').map((document) => document.id)).toEqual(['a', 'b', 'e'])
  })

  it('writes the rows exactly as the merge produced them, stamping nothing', async () => {
    const remote = createMemoryRemoteStore()
    const row = deck('a', 42)

    await createTransport(remote).push([batch([row])])

    const stored = remote.documents('decks')[0]
    expect(stored?.data).toEqual(row)
    // Not just equal values: the same keys. A later `updatedAt` or an invented `deletedAt` would show
    // up here as an extra key even when the values happened to match.
    expect(Object.keys(stored?.data ?? {}).sort()).toEqual(Object.keys(row).sort())
  })

  it('treats a table with nothing to push as a successful empty batch', async () => {
    const remote = createMemoryRemoteStore()

    const result = await createTransport(remote).push([batch([])])

    expect(remote.commits).toEqual([])
    expect(result).toEqual({ batches: [{ table: 'decks', written: 0, ok: true }], ok: true })
  })
})
