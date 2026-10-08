import { describe, expect, it } from 'vitest'

import {
  createLesson,
  getLesson,
  listDeletedLessons,
  listLessons,
  setLessonStatus,
  softDeleteLesson,
  updateLesson,
} from './lessons'

/**
 * The lessons repository.
 *
 * What is worth asserting here is the part that would be silent: that an optional field is
 * *absent* rather than blanked, that clearing a deadline really removes it, and that a deletion is
 * a tombstone rather than a removal. The display ordering and the date maths are rules and are
 * tested as pure functions in `features/tracker/lib/`.
 *
 * The database is wiped and re-seeded by the global `afterEach` in `src/test/setup.ts`, so no test
 * cleans up after itself.
 */

const NOW = new Date(2026, 8, 21, 10, 0, 0, 0).getTime()
const DAY = 86_400_000

describe('createLesson', () => {
  it('writes the fields it was given and stamps updatedAt', async () => {
    const lesson = await createLesson(
      {
        subject: 'practice-iii',
        topic: 'Fluid and electrolytes',
        deadline: NOW + 3 * DAY,
        status: 'not-started',
        notes: 'Chapter 12 first',
      },
      NOW,
    )

    expect(lesson.id).toBeTruthy()
    expect(lesson.updatedAt).toBe(NOW)
    expect(lesson.deletedAt).toBeUndefined()

    const [stored] = await listLessons()
    expect(stored).toEqual(lesson)
  })

  it('omits absent optional fields rather than storing undefined', async () => {
    const lesson = await createLesson(
      { subject: 'practice-i', topic: 'Community diagnosis', status: 'not-started' },
      NOW,
    )

    // Not "equals undefined" — genuinely absent, so `deadline === undefined` and `hasOwn` agree.
    expect(Object.hasOwn(lesson, 'deadline')).toBe(false)
    expect(Object.hasOwn(lesson, 'notes')).toBe(false)

    const stored = await getLesson(lesson.id)
    expect(Object.hasOwn(stored as object, 'deadline')).toBe(false)
  })

  it('trims the topic and treats whitespace-only notes as none', async () => {
    const lesson = await createLesson(
      { subject: 'practice-v', topic: '   Emergency nursing   ', status: 'reviewing', notes: '  ' },
      NOW,
    )

    expect(lesson.topic).toBe('Emergency nursing')
    expect(Object.hasOwn(lesson, 'notes')).toBe(false)
  })
})

describe('listLessons', () => {
  it('returns live lessons only, so a tombstone cannot reappear in the list', async () => {
    const kept = await createLesson(
      { subject: 'practice-i', topic: 'Kept', status: 'reviewing' },
      NOW,
    )
    const removed = await createLesson(
      { subject: 'practice-i', topic: 'Removed', status: 'reviewing' },
      NOW,
    )

    await softDeleteLesson(removed.id, NOW + 1)

    const lessons = await listLessons()
    expect(lessons.map((lesson) => lesson.id)).toEqual([kept.id])
    expect(await getLesson(removed.id)).toBeUndefined()
  })

  it('keeps the tombstone rather than removing the row', async () => {
    const lesson = await createLesson(
      { subject: 'practice-ii', topic: 'Growth and development', status: 'mastered' },
      NOW,
    )

    await softDeleteLesson(lesson.id, NOW + DAY)

    const deleted = await listDeletedLessons()
    expect(deleted).toHaveLength(1)
    expect(deleted[0]?.id).toBe(lesson.id)
    expect(deleted[0]?.deletedAt).toBe(NOW + DAY)
    expect(deleted[0]?.updatedAt).toBe(NOW + DAY)
  })
})

describe('updateLesson', () => {
  it('changes the fields it owns and leaves the rest alone', async () => {
    const lesson = await createLesson(
      { subject: 'practice-i', topic: 'Before', status: 'not-started', notes: 'Keep me' },
      NOW,
    )

    await updateLesson(
      lesson.id,
      {
        subject: 'practice-iv',
        topic: 'After',
        deadline: NOW + 7 * DAY,
        status: 'reviewing',
        notes: 'Keep me',
      },
      NOW + DAY,
    )

    const updated = await getLesson(lesson.id)
    expect(updated).toMatchObject({
      id: lesson.id,
      subject: 'practice-iv',
      topic: 'After',
      deadline: NOW + 7 * DAY,
      status: 'reviewing',
      notes: 'Keep me',
      updatedAt: NOW + DAY,
    })
  })

  it('clears a deadline she removes, rather than leaving the old date in place', async () => {
    const lesson = await createLesson(
      { subject: 'practice-i', topic: 'Dated then undated', deadline: NOW, status: 'not-started' },
      NOW,
    )

    await updateLesson(
      lesson.id,
      { subject: 'practice-i', topic: lesson.topic, status: 'not-started' },
      NOW + DAY,
    )

    const updated = await getLesson(lesson.id)
    // The bug this defends: `undefined` spread over the row leaves the old date and the lesson
    // stays in "Still waiting" for a deadline she deliberately cleared.
    expect(Object.hasOwn(updated as object, 'deadline')).toBe(false)
  })

  it('clears notes she removes', async () => {
    const lesson = await createLesson(
      { subject: 'practice-i', topic: 'Noted', status: 'not-started', notes: 'Old note' },
      NOW,
    )

    await updateLesson(
      lesson.id,
      { subject: 'practice-i', topic: lesson.topic, status: 'not-started', notes: '   ' },
      NOW + DAY,
    )

    const updated = await getLesson(lesson.id)
    expect(Object.hasOwn(updated as object, 'notes')).toBe(false)
  })

  it('is a no-op for an id that no longer exists', async () => {
    await expect(
      updateLesson(
        'missing',
        { subject: 'practice-i', topic: 'Ghost', status: 'not-started' },
        NOW,
      ),
    ).resolves.toBeUndefined()
  })
})

describe('setLessonStatus', () => {
  it('moves the status and bumps updatedAt without touching the text', async () => {
    const lesson = await createLesson(
      { subject: 'practice-v', topic: 'Triage', status: 'not-started', notes: 'Page 40' },
      NOW,
    )

    await setLessonStatus(lesson.id, 'mastered', NOW + 2 * DAY)

    const updated = await getLesson(lesson.id)
    expect(updated).toMatchObject({
      topic: 'Triage',
      notes: 'Page 40',
      status: 'mastered',
      updatedAt: NOW + 2 * DAY,
    })
  })

  it('allows going back from mastered to reviewing', async () => {
    const lesson = await createLesson(
      { subject: 'practice-v', topic: 'Triage', status: 'mastered' },
      NOW,
    )

    await setLessonStatus(lesson.id, 'reviewing', NOW + DAY)

    expect((await getLesson(lesson.id))?.status).toBe('reviewing')
  })
})
