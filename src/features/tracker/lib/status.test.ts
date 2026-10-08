import { describe, expect, it } from 'vitest'

import type { Lesson, LessonStatus } from '@/db/types'
import {
  FILTER_EMPTY,
  LESSON_FILTERS,
  LESSON_STATUSES,
  isLessonFilter,
  lessonCounts,
  lessonFilterLabel,
  lessonStatusLabel,
  matchesFilter,
  parseLessonFilter,
} from './status'

/**
 * The status vocabulary and the filter chips.
 *
 * The rule that matters here is the one the whole design avoids having to test for: statuses are
 * stored as stable keys and compared as stable keys, so there is no label to normalise and no case
 * to get wrong. What *is* tested is the thing that would otherwise be silent — mastered lessons
 * being kept out of the default view — and the copy, because a chip that shows the wrong empty
 * state is a defect she reads as "this screen is broken".
 */

const NOW = new Date(2026, 8, 21, 10, 0, 0, 0).getTime()

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    subject: 'practice-i',
    topic: 'Community diagnosis',
    status: 'not-started',
    updatedAt: NOW,
    ...overrides,
  }
}

describe('the status vocabulary', () => {
  it('names all three states with distinct, non-empty labels', () => {
    const labels = LESSON_STATUSES.map((status) => lessonStatusLabel(status))

    expect(LESSON_STATUSES).toEqual(['not-started', 'reviewing', 'mastered'])
    expect(labels.every((label) => label.trim().length > 0)).toBe(true)
    expect(new Set(labels).size).toBe(LESSON_STATUSES.length)
  })

  it('stores keys, not labels — the keys are what the database holds', () => {
    // If a label were ever stored instead, this assertion inverts and the filter would start
    // matching nothing. The union is the guard; this pins the actual strings.
    for (const status of LESSON_STATUSES) {
      expect(status).toMatch(/^[a-z-]+$/)
    }
  })
})

describe('the filter chips', () => {
  it('offers To do plus one chip per stored status', () => {
    expect(LESSON_FILTERS).toEqual(['active', 'not-started', 'reviewing', 'mastered'])
    expect(lessonFilterLabel('active')).toBe('To do')
    expect(lessonFilterLabel('reviewing')).toBe(lessonStatusLabel('reviewing'))
  })

  it('recognises exactly the four filter values', () => {
    for (const filter of LESSON_FILTERS) {
      expect(isLessonFilter(filter)).toBe(true)
    }

    expect(isLessonFilter('all')).toBe(false)
    expect(isLessonFilter('Mastered')).toBe(false)
    expect(isLessonFilter('')).toBe(false)
  })
})

describe('parseLessonFilter', () => {
  it('reads a known value from the URL', () => {
    for (const filter of LESSON_FILTERS) {
      expect(parseLessonFilter(filter)).toBe(filter)
    }
  })

  it('falls back to the default view for anything it does not recognise', () => {
    // A bookmark, a typed URL, or a link saved before a rename. Showing an empty screen here would
    // be indistinguishable from a broken one, so an unknown value must not survive into the prop.
    expect(parseLessonFilter(null)).toBe('active')
    expect(parseLessonFilter('')).toBe('active')
    expect(parseLessonFilter('nonsense')).toBe('active')
    // Case matters even though it should not: the point is that it does not leak through.
    expect(parseLessonFilter('MASTERED')).toBe('active')
    expect(parseLessonFilter(' mastered')).toBe('active')
  })
})

describe('matchesFilter', () => {
  it('keeps a mastered lesson out of the default view and out of the open statuses', () => {
    const mastered = lesson({ status: 'mastered' })

    expect(matchesFilter(mastered, 'active')).toBe(false)
    expect(matchesFilter(mastered, 'reviewing')).toBe(false)
    expect(matchesFilter(mastered, 'not-started')).toBe(false)
    expect(matchesFilter(mastered, 'mastered')).toBe(true)
  })

  it('shows a mastered lesson on no chip except its own', () => {
    for (const status of LESSON_STATUSES) {
      const candidate = lesson({ status })
      const matching = LESSON_FILTERS.filter((filter) => matchesFilter(candidate, filter))

      expect(matching).toEqual(status === 'mastered' ? ['mastered'] : ['active', status])
    }
  })
})

describe('lessonCounts', () => {
  it('counts chips from the whole list, and never counts a mastered lesson as to do', () => {
    const lessons = [
      lesson({ id: 'a', status: 'not-started' }),
      lesson({ id: 'b', status: 'not-started' }),
      lesson({ id: 'c', status: 'reviewing' }),
      lesson({ id: 'd', status: 'mastered' }),
      lesson({ id: 'e', status: 'mastered' }),
      lesson({ id: 'f', status: 'mastered' }),
    ]

    expect(lessonCounts(lessons)).toEqual({
      active: 3,
      'not-started': 2,
      reviewing: 1,
      mastered: 3,
    })
  })

  it('is all zeroes for an empty list', () => {
    expect(lessonCounts([])).toEqual({ active: 0, 'not-started': 0, reviewing: 0, mastered: 0 })
  })

  it('always accounts for every lesson exactly once across the two open statuses and mastered', () => {
    const statuses: LessonStatus[] = ['not-started', 'reviewing', 'mastered', 'not-started']
    const lessons = statuses.map((status, index) => lesson({ id: `l-${String(index)}`, status }))
    const counts = lessonCounts(lessons)

    expect(counts['not-started'] + counts.reviewing).toBe(counts.active)
    expect(counts.active + counts.mastered).toBe(lessons.length)
  })
})

describe('FILTER_EMPTY', () => {
  it('gives every chip its own title and message', () => {
    const titles = LESSON_FILTERS.map((filter) => FILTER_EMPTY[filter].title)

    for (const filter of LESSON_FILTERS) {
      expect(FILTER_EMPTY[filter].title.trim().length).toBeGreaterThan(0)
      expect(FILTER_EMPTY[filter].message.trim().length).toBeGreaterThan(0)
    }

    // Distinct on purpose: tapping Mastered and reading "Nothing on your list yet" would be worse
    // than a blank region, because it reads as the wrong screen rather than as a broken one.
    expect(new Set(titles).size).toBe(LESSON_FILTERS.length)
  })
})
