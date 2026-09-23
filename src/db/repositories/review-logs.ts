import { getDb } from '../schema'
import type { ReviewLog } from '../types'

/**
 * Review logs. **Append-only.**
 *
 * There is deliberately no `updateReviewLog` and no `deleteReviewLog` in this module, and
 * there is no soft delete either. A review that happened is a fact; editing or removing one
 * would corrupt the history that Workflow F's weak-topic feature and any future FSRS
 * migration both depend on, and it cannot be reconstructed afterwards.
 *
 * When Workflow S lands, the merge for this table must be **UNION-ONLY** — never overwrite,
 * never delete. A last-write-wins merge on an append-only table is silent history loss.
 */

export async function appendReviewLog(log: ReviewLog): Promise<void> {
  const db = await getDb()
  await db.reviewLogs.add(log)
}

export async function listReviewLogsByCard(cardId: string): Promise<ReviewLog[]> {
  const db = await getDb()
  const logs = await db.reviewLogs.where('cardId').equals(cardId).toArray()
  return logs.sort((a, b) => a.reviewedAt - b.reviewedAt || a.id.localeCompare(b.id))
}

export async function listReviewLogsByDeck(deckId: string): Promise<ReviewLog[]> {
  const db = await getDb()
  const logs = await db.reviewLogs.where('deckId').equals(deckId).toArray()
  return logs.sort((a, b) => a.reviewedAt - b.reviewedAt || a.id.localeCompare(b.id))
}

export async function countReviewLogs(): Promise<number> {
  const db = await getDb()
  return db.reviewLogs.count()
}

export async function listAllReviewLogs(): Promise<ReviewLog[]> {
  const db = await getDb()
  return db.reviewLogs.orderBy('reviewedAt').toArray()
}
