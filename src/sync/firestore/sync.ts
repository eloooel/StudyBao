import type { AppSettings, ReviewLog } from '@/db/types'

import { mergeByUpdatedAt, mergeReviewLogs, mergeSettings } from '../lib/merge'
import type { LocalStore } from './local-store'
import type { LocalRows, PushBatch, PushResult, RejectedRow, Transport } from './transport'

/**
 * One sync, end to end: read local, pull remote, merge, write the merged set, push what the remote is
 * missing.
 *
 * **All conflict logic is the merge unit's.** This file calls `mergeByUpdatedAt`, `mergeReviewLogs` and
 * `mergeSettings` and does nothing clever between them — no tie-break is repeated, no timestamp is
 * compared a second time, and no clock is read. `SYNC-MERGE.md` says the merge is the part where a
 * mistake is unrecoverable; a second opinion about it here is how the two answers start to disagree.
 *
 * **A failure is a value, never a throw.** `CLAUDE.md` requires sync to be fire-and-forget: a failed
 * sync must never block or slow a review, and it must be reported rather than swallowed. `syncOnce`
 * therefore resolves in every case; `ok`, `error` and `push.ok` are what the caller shows.
 *
 * The merge result is written **before** anything is pushed. If the push fails, the local database
 * already holds what the remote said, which is the direction that cannot lose her work: the next sync
 * re-sends the same rows.
 */

export interface MergedTables {
  merged: LocalRows
  /** One entry per table, in `SYNCED_TABLES` order. */
  push: PushBatch[]
  /** Same-id review logs with different content. Returned for reporting; never resolved here. */
  conflicts: ReviewLog[]
}

/**
 * Apply the six cases to every table. Pure: two inputs, two outputs, no clock.
 *
 * `settings` is the singleton and so cannot go through `mergeByUpdatedAt` — it has a write-once
 * `seededAt` that must survive whichever row wins (`mergeSettings`). Both sides being empty is a real
 * state (a database opened before the first seed) and is not an error.
 */
export function mergePulled(local: LocalRows, remote: LocalRows): MergedTables {
  const decks = mergeByUpdatedAt(local.decks, remote.decks)
  const cards = mergeByUpdatedAt(local.cards, remote.cards)
  const sessions = mergeByUpdatedAt(local.sessions, remote.sessions)
  const lessons = mergeByUpdatedAt(local.lessons, remote.lessons)
  const reviewLogs = mergeReviewLogs(local.reviewLogs, remote.reviewLogs)

  const localSettings: AppSettings | undefined = local.settings[0]
  const remoteSettings: AppSettings | undefined = remote.settings[0]

  let mergedSettings: AppSettings[] = []
  let settingsPush: AppSettings[] = []

  if (localSettings === undefined) {
    // Nothing local to merge against. A remote row is taken in; an empty remote is a no-op.
    if (remoteSettings !== undefined) mergedSettings = [remoteSettings]
  } else {
    const outcome = mergeSettings(localSettings, remoteSettings)
    mergedSettings = outcome.merged
    settingsPush = outcome.push
  }

  return {
    merged: {
      decks: decks.merged,
      cards: cards.merged,
      reviewLogs: reviewLogs.merged,
      settings: mergedSettings,
      sessions: sessions.merged,
      lessons: lessons.merged,
    },
    push: [
      { table: 'decks', merged: decks.merged, push: decks.push },
      { table: 'cards', merged: cards.merged, push: cards.push },
      { table: 'reviewLogs', merged: reviewLogs.merged, push: reviewLogs.push },
      { table: 'settings', merged: mergedSettings, push: settingsPush },
      { table: 'sessions', merged: sessions.merged, push: sessions.push },
      { table: 'lessons', merged: lessons.merged, push: lessons.push },
    ],
    conflicts: reviewLogs.conflicts,
  }
}

export interface SyncOutcome {
  /** False when the pull, the local write, or any push batch failed. */
  ok: boolean
  /** Remote rows that were not records. Reported, never written. */
  rejected: RejectedRow[]
  conflicts: ReviewLog[]
  push: PushResult
  /** Present only when `ok` is false because of a pull or a local write. */
  error?: string
}

const NOTHING_PUSHED: PushResult = { batches: [], ok: true }

function failure(error: unknown): SyncOutcome {
  return {
    ok: false,
    rejected: [],
    conflicts: [],
    push: NOTHING_PUSHED,
    error: error instanceof Error ? error.message : 'unknown error',
  }
}

export async function syncOnce(transport: Transport, store: LocalStore): Promise<SyncOutcome> {
  let local: LocalRows
  try {
    local = await store.readAll()
  } catch (error) {
    return failure(error)
  }

  let pulled
  try {
    pulled = await transport.pull()
  } catch (error) {
    return failure(error)
  }

  const merged = mergePulled(local, pulled.rows)

  try {
    await store.writeAll(merged.merged)
  } catch (error) {
    return failure(error)
  }

  const push = await transport.push(merged.push)

  return {
    ok: push.ok,
    rejected: pulled.rejected,
    conflicts: merged.conflicts,
    push,
  }
}
