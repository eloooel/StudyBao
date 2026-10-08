import { getDb } from '../schema'
import type { Lesson, LessonStatus, PrcPart } from '../types'

/**
 * Lessons — her study plan, the one thing the app could not represent before Workflow E.
 *
 * Every read filters tombstones and every write goes through here, so nothing outside `src/db/`
 * touches Dexie. Nothing hard-deletes: a hard delete on one device is resurrected by the other
 * device's next sync.
 *
 * ## Ordering is not decided here
 *
 * `listLessons` returns live rows in primary-key order, and the display order is a *rule* — dated
 * before undated, soonest first, then official exam order — which lives in
 * `features/tracker/lib/deadline.ts` (`sortLessons`) with its tests. The repository is storage;
 * sorting by "what matters next" is not a storage concern, and it is the kind of rule that would
 * otherwise be untestable without a database.
 *
 * ## Optional fields are removed, not blanked
 *
 * `deadline` and `notes` are optional, and clearing one has to remove the key rather than write an
 * `undefined` property. `updateLesson` therefore reads the row and writes the next shape inside one
 * transaction, the same way `updateSettings` does and for the same reason: otherwise she clears a
 * date and it comes back on the next read.
 */

export interface LessonDraft {
  subject: PrcPart
  topic: string
  /** Absent means "no date yet", which is a first-class state, not a missing value. */
  deadline?: number
  status: LessonStatus
  notes?: string
}

export interface LessonEdit {
  subject: PrcPart
  topic: string
  /** Present and `undefined` means "clear the deadline she no longer wants". */
  deadline?: number
  status: LessonStatus
  notes?: string
}

/** Every live lesson. Tens of rows, loaded whole and grouped in memory by the tracker. */
export async function listLessons(): Promise<Lesson[]> {
  const db = await getDb()
  return live(await db.lessons.toArray())
}

export async function getLesson(id: string): Promise<Lesson | undefined> {
  const db = await getDb()
  const lesson = await db.lessons.get(id)
  return lesson && lesson.deletedAt === undefined ? lesson : undefined
}

/**
 * Create a lesson.
 *
 * Optional keys are omitted rather than written as `undefined`, so a lesson with no date has no
 * `deadline` property at all — `Object.hasOwn` is false, and every reader treats absence as the
 * default. Writing the key with `undefined` would survive the structured clone and make "absent"
 * and "present but empty" two states where there is only one.
 */
export async function createLesson(draft: LessonDraft, now = Date.now()): Promise<Lesson> {
  const db = await getDb()
  const notes = draft.notes?.trim() ?? ''

  const lesson: Lesson = {
    id: crypto.randomUUID(),
    subject: draft.subject,
    topic: draft.topic.trim(),
    status: draft.status,
    updatedAt: now,
    ...(draft.deadline === undefined ? {} : { deadline: draft.deadline }),
    ...(notes.length === 0 ? {} : { notes }),
  }

  await db.lessons.add(lesson)
  return lesson
}

/**
 * Edit a lesson's fields, keeping its `id` and its history.
 *
 * One transaction around the read and the write, because the write has to be built from the row as
 * it is now: the alternative — `db.lessons.update(id, { deadline: undefined })` — depends on how
 * Dexie treats an explicit `undefined` in a partial update, and "cleared the date and it came back"
 * is not a bug worth risking on an implementation detail.
 */
export async function updateLesson(id: string, edit: LessonEdit, now = Date.now()): Promise<void> {
  const db = await getDb()

  await db.transaction('rw', db.lessons, async () => {
    const current = await db.lessons.get(id)
    if (current === undefined) return

    const notes = edit.notes?.trim() ?? ''
    const next: Lesson = {
      ...current,
      subject: edit.subject,
      topic: edit.topic.trim(),
      status: edit.status,
      updatedAt: now,
    }

    // `delete` rather than assigning `undefined`, so the key is genuinely gone.
    if (edit.deadline === undefined) delete next.deadline
    else next.deadline = edit.deadline

    if (notes.length === 0) delete next.notes
    else next.notes = notes

    await db.lessons.put(next)
  })
}

/**
 * Move a lesson between Not started / Reviewing / Mastered.
 *
 * Its own function rather than a full `updateLesson` call, because it is the one edit that happens
 * from the list with a single tap and it must not be able to touch anything else — a quick action
 * that rewrote the topic from a stale snapshot is a worse bug than a missing shortcut.
 */
export async function setLessonStatus(
  id: string,
  status: LessonStatus,
  now = Date.now(),
): Promise<void> {
  const db = await getDb()
  await db.lessons.update(id, { status, updatedAt: now })
}

/** Soft-delete a lesson. From her side it is gone; the tombstone is what stops it coming back. */
export async function softDeleteLesson(id: string, now = Date.now()): Promise<void> {
  const db = await getDb()
  await db.lessons.update(id, { deletedAt: now, updatedAt: now })
}

/**
 * Tombstones only. Workflow S pushes these; nothing in the UI reads them.
 *
 * Uses the `deletedAt` index rather than reading the whole table and filtering in JS — that index
 * exists for this query.
 */
export async function listDeletedLessons(): Promise<Lesson[]> {
  const db = await getDb()
  // Epoch ms is always positive, so `above(0)` means "has a deletion timestamp".
  return db.lessons.where('deletedAt').above(0).toArray()
}

function live(lessons: Lesson[]): Lesson[] {
  return lessons.filter((lesson) => lesson.deletedAt === undefined)
}
