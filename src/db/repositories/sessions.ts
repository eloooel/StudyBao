import { getDb } from '../schema'
import type { Session, SessionType } from '../types'

/**
 * Timer sessions.
 *
 * Every read filters tombstones and every write goes through here, so nothing outside `src/db/`
 * touches Dexie. Nothing hard-deletes, for the reason the whole codebase gives: a hard delete on
 * one device is resurrected by the other device's next sync.
 *
 * ## Why a session is written twice
 *
 * A row is created when she presses Start and completed when the block ends, rather than being
 * written once at the end. That costs one extra write per block and buys two things that cannot be
 * recovered afterwards:
 *
 * 1. **A session interrupted by a closed tab is still a row.** On an iPad, closing the tab is
 *    normal — and with in-app notifications only (ADR 0006) there is no server to notice. Write-once
 *    at the end would mean the interruption leaves nothing at all, so the dashboard could not tell
 *    "she did not study" from "she studied and we lost it".
 * 2. **`startedAt` is recorded when it is true.** Deriving it at the end from an elapsed
 *    measurement would inherit any clock adjustment in between.
 *
 * The row created at Start is honest about its state: `completed: false`, and `endedAt` is the
 * *planned* end rather than a prediction of the real one. `completeSession` is what turns it into a
 * finished block.
 */

export interface SessionStart {
  type: SessionType
  plannedMs: number
}

/** Default page size for the history list. Not a hard cap — see `listRecentSessions`. */
export const DEFAULT_SESSION_PAGE = 50

/**
 * Record the start of a block.
 *
 * Returns the row so the caller holds the id it must later complete. Losing that id would leave a
 * row permanently unfinished, which is a lie in the other direction — so the caller keeps it in
 * component state for the duration of the block, and the worst case (a reload mid-block) leaves a
 * row that correctly reads as not completed.
 */
export async function startSession(start: SessionStart, now = Date.now()): Promise<Session> {
  const db = await getDb()

  const session: Session = {
    id: crypto.randomUUID(),
    type: start.type,
    startedAt: now,
    // The *planned* end, not a guess at the real one. A row still showing this after the fact is
    // an abandoned block, and `completed: false` is what says so.
    endedAt: now + start.plannedMs,
    plannedMs: start.plannedMs,
    actualMs: start.plannedMs,
    completed: false,
    tabHiddenCount: 0,
    updatedAt: now,
  }

  await db.sessions.add(session)
  return session
}

/**
 * Mark a block finished, with the real duration.
 *
 * `actualMs` is measured by the caller from `startedAt` rather than accumulated, for the same
 * reason the display is: an iPad that slept through half the block would give a tick-counter a
 * wildly wrong number, while a subtraction is simply right.
 *
 * Records `tabHiddenCount` at the same time, because it is only known once the block is over and
 * this is the write that closes it out.
 */
export async function completeSession(
  id: string,
  updates: { actualMs: number; tabHiddenCount: number },
  now = Date.now(),
): Promise<void> {
  const db = await getDb()

  await db.sessions.update(id, {
    endedAt: now,
    actualMs: Math.max(0, Math.round(updates.actualMs)),
    completed: true,
    tabHiddenCount: Math.max(0, Math.round(updates.tabHiddenCount)),
    updatedAt: now,
  })
}

/**
 * Note that the page went hidden during a block.
 *
 * Written immediately rather than only at completion, because the interesting case is the one that
 * never completes: a block she abandoned by closing the tab should still know it was interrupted.
 * One write per hide is negligible — a hide is a rare, deliberate event, not a tick.
 */
export async function recordTabHide(id: string, now = Date.now()): Promise<void> {
  const db = await getDb()

  await db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(id)
    if (current === undefined) return
    await db.sessions.update(id, {
      tabHiddenCount: current.tabHiddenCount + 1,
      updatedAt: now,
    })
  })
}

/**
 * Abandon a block that was never completed, marking it explicitly.
 *
 * Called when she stops the timer or resets it. The row stays — with the elapsed time it really
 * had — but `completed` remains false, so no streak or "focus breaks" count is inflated by a block
 * she cut short.
 */
export async function abandonSession(
  id: string,
  elapsedMs: number,
  now = Date.now(),
): Promise<void> {
  const db = await getDb()

  await db.sessions.update(id, {
    endedAt: now,
    actualMs: Math.max(0, Math.round(elapsedMs)),
    completed: false,
    updatedAt: now,
  })
}

/**
 * The most recent sessions, newest first.
 *
 * `limit` is a page rather than a cap on the truth: the history screen shows the last N, and the
 * dashboard aggregates by date range instead (see `listSessionsSince`), so nothing that matters is
 * silently truncated.
 */
export async function listRecentSessions(limit = DEFAULT_SESSION_PAGE): Promise<Session[]> {
  const db = await getDb()
  const newestFirst = await db.sessions.orderBy('startedAt').reverse().toArray()
  return live(newestFirst).slice(0, limit)
}

/**
 * Sessions that started at or after `since`.
 *
 * The range query the dashboard's streak needs. `aboveOrEqual` on the `startedAt` index rather
 * than reading the whole table and filtering in JS, which is the pattern that stops being fine once
 * there are a few thousand blocks.
 */
export async function listSessionsSince(since: number): Promise<Session[]> {
  const db = await getDb()
  const inRange = await db.sessions.where('startedAt').aboveOrEqual(since).toArray()
  return live(inRange).sort((a, b) => a.startedAt - b.startedAt)
}

/** Completed work blocks only — what a streak or a focus total may legitimately count. */
export function completedWorkBlocks(sessions: readonly Session[]): Session[] {
  return sessions.filter((session) => session.completed && session.type === 'working')
}

/** Soft-delete one session. She can remove a mis-tap from her history without a hard delete. */
export async function softDeleteSession(id: string, now = Date.now()): Promise<void> {
  const db = await getDb()
  await db.sessions.update(id, { deletedAt: now, updatedAt: now })
}

/**
 * Tombstones only. Workflow S pushes these; nothing in the UI reads them.
 *
 * Uses the `deletedAt` index rather than reading the whole table, which is what that index is for.
 */
export async function listDeletedSessions(): Promise<Session[]> {
  const db = await getDb()
  // Epoch ms is always positive, so `above(0)` means "has a deletion timestamp".
  return db.sessions.where('deletedAt').above(0).toArray()
}

function live(sessions: Session[]): Session[] {
  return sessions.filter((session) => session.deletedAt === undefined)
}
