import { describe, expect, it } from 'vitest'

import type { Lesson, PrcPart } from '@/db/types'
import {
  DATE_GROUPS,
  GROUP_EMPTY_MESSAGES,
  THIS_WEEK_STUDY_DAYS,
  daysUntilDeadline,
  deadlineDateLabel,
  deadlineRelativeLabel,
  formatDeadline,
  isOverdue,
  lessonGroups,
  readDeadlineInput,
  selectLessons,
  sortLessons,
} from './deadline'
import { DEFAULT_SUBJECT, SUBJECT_OPTIONS, subjectLabel } from './subject'

/**
 * The deadline rules — the class of bug the Workflow E brief calls out by name: *a deadline
 * comparison that is wrong only across the 04:00 boundary*.
 *
 * Every time below is built from local calendar parts, so the expectations hold in whatever zone
 * the suite runs in, and every deadline is anchored at 04:00 the way the date input writes it. The
 * cases that matter are the two edges: 23:59 on the day it is due (not overdue) and 04:00 the next
 * morning (overdue).
 */

const NOW = new Date(2026, 8, 21, 10, 0, 0, 0).getTime() // Mon 21 Sep 2026, 10:00 local

/** The study-day start of a local calendar day — what the date input stores. */
function at4(year: number, month: number, day: number): number {
  return new Date(year, month, day, 4, 0, 0, 0).getTime()
}

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

describe('daysUntilDeadline', () => {
  it('is undefined for a lesson with no date, which is a normal state', () => {
    expect(daysUntilDeadline(lesson(), NOW)).toBeUndefined()
  })

  it('is 0 for today, at both ends of the study day', () => {
    const today = lesson({ deadline: at4(2026, 8, 21) })

    expect(daysUntilDeadline(today, NOW)).toBe(0)
    // 23:59 is still the 21st's study day.
    expect(daysUntilDeadline(today, new Date(2026, 8, 21, 23, 59).getTime())).toBe(0)
    // And 03:00 the next morning still belongs to it — the rollover is at 04:00, not midnight.
    expect(daysUntilDeadline(today, new Date(2026, 8, 22, 3, 0).getTime())).toBe(0)
  })

  it('counts tomorrow as 1 even at 03:00 on the day itself', () => {
    const tomorrow = lesson({ deadline: at4(2026, 8, 22) })

    expect(daysUntilDeadline(tomorrow, new Date(2026, 8, 22, 3, 0).getTime())).toBe(1)
    expect(daysUntilDeadline(tomorrow, new Date(2026, 8, 22, 4, 0).getTime())).toBe(0)
  })

  it('is negative once the study day has passed', () => {
    const yesterday = lesson({ deadline: at4(2026, 8, 20) })

    expect(daysUntilDeadline(yesterday, NOW)).toBe(-1)
    expect(daysUntilDeadline(lesson({ deadline: at4(2026, 8, 11) }), NOW)).toBe(-10)
  })
})

describe('isOverdue', () => {
  it('does not call a lesson due today overdue, at any hour of its study day', () => {
    const today = lesson({ deadline: at4(2026, 8, 21) })

    // The regression this pins: comparing `deadline < Date.now()` makes the 04:00 anchor look
    // overdue from 04:00 onwards on the very day it is due.
    expect(isOverdue(today, NOW)).toBe(false)
    expect(isOverdue(today, new Date(2026, 8, 21, 23, 59).getTime())).toBe(false)
    expect(isOverdue(today, new Date(2026, 8, 22, 3, 59).getTime())).toBe(false)
  })

  it('is overdue once the next study day starts', () => {
    const today = lesson({ deadline: at4(2026, 8, 21) })

    expect(isOverdue(today, new Date(2026, 8, 22, 4, 0).getTime())).toBe(true)
    expect(isOverdue(lesson({ deadline: at4(2026, 8, 18) }), NOW)).toBe(true)
  })

  it('never calls an undated lesson overdue', () => {
    // The whole reason `deadline` is optional: an unplanned topic is not a late one, and rendering
    // it as late would be punishing her for a date she never set.
    expect(isOverdue(lesson(), NOW)).toBe(false)
  })

  it('never calls a mastered lesson overdue, whatever its date says', () => {
    const masteredAndLate = lesson({ deadline: at4(2026, 8, 1), status: 'mastered' })

    expect(isOverdue(masteredAndLate, NOW)).toBe(false)
  })
})

describe('deadlineDateLabel', () => {
  it('writes the weekday, day and month without a locale', () => {
    expect(deadlineDateLabel(at4(2026, 8, 22), NOW)).toBe('Tue 22 Sep')
    expect(deadlineDateLabel(at4(2026, 10, 6), NOW)).toBe('Fri 6 Nov')
  })

  it('adds the year once it is no longer the year she is in', () => {
    expect(deadlineDateLabel(at4(2027, 1, 26), NOW)).toBe('Fri 26 Feb 2027')
    expect(deadlineDateLabel(at4(2026, 11, 31), NOW)).toBe('Thu 31 Dec')
  })
})

describe('deadlineRelativeLabel', () => {
  it('uses words for the three days around now', () => {
    expect(deadlineRelativeLabel(at4(2026, 8, 21), NOW)).toBe('today')
    expect(deadlineRelativeLabel(at4(2026, 8, 22), NOW)).toBe('tomorrow')
    expect(deadlineRelativeLabel(at4(2026, 8, 20), NOW)).toBe('yesterday')
  })

  it('counts study days beyond that, in both directions', () => {
    expect(deadlineRelativeLabel(at4(2026, 8, 23), NOW)).toBe('in 2 days')
    expect(deadlineRelativeLabel(at4(2026, 9, 3), NOW)).toBe('in 12 days')
    expect(deadlineRelativeLabel(at4(2026, 8, 18), NOW)).toBe('3 days ago')
  })
})

describe('formatDeadline', () => {
  it('says so plainly when there is no date', () => {
    expect(formatDeadline(undefined, NOW)).toBe('No date yet')
  })

  it('stands alone for the three near days', () => {
    expect(formatDeadline(at4(2026, 8, 21), NOW)).toBe('Today')
    expect(formatDeadline(at4(2026, 8, 22), NOW)).toBe('Tomorrow')
    expect(formatDeadline(at4(2026, 8, 20), NOW)).toBe('Yesterday')
  })

  it('pairs the date with how far away it is', () => {
    expect(formatDeadline(at4(2026, 9, 3), NOW)).toBe('Sat 3 Oct · in 12 days')
    expect(formatDeadline(at4(2026, 8, 18), NOW)).toBe('Fri 18 Sep · 3 days ago')
  })

  it('shows the year when the deadline is in another one', () => {
    expect(formatDeadline(at4(2027, 1, 26), NOW)).toMatch(/^Fri 26 Feb 2027 · in \d+ days$/)
  })
})

describe('readDeadlineInput', () => {
  it('reads an empty field as no date at all, which is a real state', () => {
    // The reason `deadline` is optional: pressing Add with the date left blank must store a lesson
    // with no date, not a lesson dated today.
    expect(readDeadlineInput('')).toEqual({ kind: 'none' })
    expect(readDeadlineInput('   ')).toEqual({ kind: 'none' })
  })

  it('turns a calendar day into that day’s 04:00 study-day start', () => {
    expect(readDeadlineInput('2026-09-24')).toEqual({ kind: 'date', deadline: at4(2026, 8, 24) })
  })

  it('refuses a value it cannot turn into a day rather than dropping it', () => {
    // A dropped date is a deadline she believes she set, so this is an error and not a default.
    expect(readDeadlineInput('2026-13-45')).toEqual({ kind: 'invalid' })
    expect(readDeadlineInput('2026-02-31')).toEqual({ kind: 'invalid' })
    expect(readDeadlineInput('tomorrow')).toEqual({ kind: 'invalid' })
    expect(readDeadlineInput('24/09/2026')).toEqual({ kind: 'invalid' })
  })
})

describe('sortLessons', () => {
  it('puts dated lessons before undated ones, soonest first', () => {
    const sorted = sortLessons([
      lesson({ id: 'undated', topic: 'No date' }),
      lesson({ id: 'later', topic: 'Later', deadline: at4(2026, 9, 1) }),
      lesson({ id: 'soon', topic: 'Soon', deadline: at4(2026, 8, 22) }),
    ])

    expect(sorted.map((entry) => entry.id)).toEqual(['soon', 'later', 'undated'])
  })

  it('breaks a deadline tie by official exam order, then topic, then id', () => {
    const sameDay = at4(2026, 8, 25)
    const sorted = sortLessons([
      lesson({ id: 'v', subject: 'practice-v', topic: 'Triage', deadline: sameDay }),
      lesson({ id: 'i-b', subject: 'practice-i', topic: 'Bedside', deadline: sameDay }),
      lesson({ id: 'i-a', subject: 'practice-i', topic: 'Asepsis', deadline: sameDay }),
      lesson({ id: 'ii', subject: 'practice-ii', topic: 'Newborn', deadline: sameDay }),
    ])

    expect(sorted.map((entry) => entry.id)).toEqual(['i-a', 'i-b', 'ii', 'v'])
  })

  it('breaks a full tie by id, so the list cannot rearrange itself between renders', () => {
    const sameDay = at4(2026, 8, 25)
    const first = lesson({ id: 'aaa', topic: 'Same', deadline: sameDay })
    const second = lesson({ id: 'bbb', topic: 'Same', deadline: sameDay })

    expect(sortLessons([second, first]).map((entry) => entry.id)).toEqual(['aaa', 'bbb'])
  })

  it('does not mutate the array it was given', () => {
    const input = [
      lesson({ id: 'later', deadline: at4(2026, 9, 1) }),
      lesson({ id: 'soon', deadline: at4(2026, 8, 22) }),
    ]
    const before = input.map((entry) => entry.id)

    sortLessons(input)

    expect(input.map((entry) => entry.id)).toEqual(before)
  })
})

describe('lessonGroups', () => {
  it('returns all four date sections, in order, with no-date last', () => {
    const groups = lessonGroups([lesson()], 'active', NOW)

    expect(groups.map((group) => group.id)).toEqual(['overdue', 'this-week', 'later', 'no-date'])
    expect(groups.map((group) => group.title)).toEqual([
      'Still waiting',
      'This week',
      'Later on',
      'No date yet',
    ])
    expect(DATE_GROUPS.at(-1)).toBe('no-date')
  })

  it('keeps every section present when the list is empty, each with its own line', () => {
    const groups = lessonGroups([], 'active', NOW)

    expect(groups).toHaveLength(4)
    for (const group of groups) {
      expect(group.lessons).toEqual([])
      expect(group.emptyMessage).toBe(GROUP_EMPTY_MESSAGES[group.id])
      expect(group.emptyMessage.trim().length).toBeGreaterThan(0)
    }
    expect(new Set(groups.map((group) => group.emptyMessage)).size).toBe(4)
  })

  it('files a lesson due today under this week, never under still waiting', () => {
    const groups = lessonGroups(
      [lesson({ id: 'today', deadline: at4(2026, 8, 21) })],
      'active',
      NOW,
    )
    const byId = new Map(groups.map((group) => [group.id, group.lessons]))

    expect(byId.get('this-week')?.map((entry) => entry.id)).toEqual(['today'])
    expect(byId.get('overdue')).toEqual([])
  })

  it('treats exactly seven study days as this week and eight as later', () => {
    const seven = lesson({ id: 'seven', deadline: at4(2026, 8, 28) })
    const eight = lesson({ id: 'eight', deadline: at4(2026, 8, 29) })

    const groups = lessonGroups([seven, eight], 'active', NOW)
    const byId = new Map(groups.map((group) => [group.id, group.lessons]))

    expect(THIS_WEEK_STUDY_DAYS).toBe(7)
    expect(byId.get('this-week')?.map((entry) => entry.id)).toEqual(['seven'])
    expect(byId.get('later')?.map((entry) => entry.id)).toEqual(['eight'])
  })

  it('files overdue, undated and later lessons where they belong', () => {
    const groups = lessonGroups(
      [
        lesson({ id: 'late', deadline: at4(2026, 8, 19) }),
        lesson({ id: 'undated' }),
        lesson({ id: 'far', deadline: at4(2026, 9, 30) }),
      ],
      'active',
      NOW,
    )
    const byId = new Map(groups.map((group) => [group.id, group.lessons]))

    expect(byId.get('overdue')?.map((entry) => entry.id)).toEqual(['late'])
    expect(byId.get('no-date')?.map((entry) => entry.id)).toEqual(['undated'])
    expect(byId.get('later')?.map((entry) => entry.id)).toEqual(['far'])
  })

  it('keeps mastered lessons out of the default view entirely', () => {
    const groups = lessonGroups(
      [
        lesson({ id: 'done', deadline: at4(2026, 8, 1), status: 'mastered' }),
        lesson({ id: 'open', deadline: at4(2026, 8, 25) }),
      ],
      'active',
      NOW,
    )

    const ids = groups.flatMap((group) => group.lessons.map((entry) => entry.id))
    expect(ids).toEqual(['open'])
  })

  it('gives the mastered chip one flat section rather than date groups', () => {
    const groups = lessonGroups(
      [
        lesson({ id: 'done-late', deadline: at4(2026, 8, 1), status: 'mastered' }),
        lesson({ id: 'done-soon', deadline: at4(2026, 8, 25), status: 'mastered' }),
        lesson({ id: 'open', status: 'reviewing' }),
      ],
      'mastered',
      NOW,
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]?.id).toBe('mastered')
    expect(groups[0]?.title).toBe('Mastered')
    // A finished topic with a past date must not be filed under "Still waiting" — that is the
    // rendering this feature exists to avoid.
    expect(groups[0]?.lessons.map((entry) => entry.id)).toEqual(['done-late', 'done-soon'])
    expect(groups.flatMap((group) => group.lessons).map((entry) => entry.status)).toEqual([
      'mastered',
      'mastered',
    ])
  })

  it('sorts every section soonest first', () => {
    const groups = lessonGroups(
      [
        lesson({ id: 'second', deadline: at4(2026, 8, 24) }),
        lesson({ id: 'first', deadline: at4(2026, 8, 22) }),
      ],
      'active',
      NOW,
    )

    expect(groups.find((group) => group.id === 'this-week')?.lessons.map((e) => e.id)).toEqual([
      'first',
      'second',
    ])
  })
})

describe('selectLessons', () => {
  it('reports the counts, the visible total and the clock it used', () => {
    const view = selectLessons(
      [
        lesson({ id: 'open', deadline: at4(2026, 8, 21) }),
        lesson({ id: 'done', status: 'mastered' }),
      ],
      'active',
      NOW,
    )

    expect(view.counts).toEqual({ active: 1, 'not-started': 1, reviewing: 0, mastered: 1 })
    expect(view.total).toBe(1)
    expect(view.now).toBe(NOW)
    expect(view.groups).toHaveLength(4)
  })

  it('totals everything the filter shows, so an empty chip reads as zero', () => {
    const view = selectLessons([lesson({ status: 'mastered' })], 'reviewing', NOW)

    expect(view.total).toBe(0)
    expect(view.counts.mastered).toBe(1)
  })
})

describe('subjectLabel', () => {
  it('names every PRC part from the seeded vocabulary', () => {
    const parts: PrcPart[] = [
      'practice-i',
      'practice-ii',
      'practice-iii',
      'practice-iv',
      'practice-v',
    ]
    const labels = parts.map((part) => subjectLabel(part))

    expect(labels).toEqual([
      'Nursing Practice I',
      'Nursing Practice II',
      'Nursing Practice III',
      'Nursing Practice IV',
      'Nursing Practice V',
    ])
    // Nothing here reads the `decks` table — a pure function cannot — which is exactly the point:
    // deleting a deck cannot make a lesson's subject unreadable.
    expect(labels.every((label) => label.trim().length > 0)).toBe(true)
  })

  it('offers all five parts in official exam order, and starts the form on the first', () => {
    expect(SUBJECT_OPTIONS.map((option) => option.part)).toEqual([
      'practice-i',
      'practice-ii',
      'practice-iii',
      'practice-iv',
      'practice-v',
    ])
    // The two must not drift: a default that is no longer in the list would show an empty picker.
    expect(SUBJECT_OPTIONS[0]?.part).toBe(DEFAULT_SUBJECT)
  })
})

describe('the study day, not a 24-hour count', () => {
  it('does not treat a deadline as overdue merely because its instant has passed', () => {
    // One assertion that says the whole thing: the deadline instant is in the past at 10:00 on the
    // day it is due, and the lesson is still not late. `daysUntilExam` would get this wrong for the
    // same input, which is why the two functions are kept distinct.
    const deadline = at4(2026, 8, 21)

    expect(deadline).toBeLessThan(NOW)
    expect(isOverdue(lesson({ deadline }), NOW)).toBe(false)
  })

  it('counts whole study days, not elapsed hours', () => {
    // Ten study days apart is ten, at 04:05 and at 23:55 alike. An hours-based count would give 10
    // from one of these and 10 from the other only by luck.
    const ten = at4(2026, 8, 31)
    const earlyMorning = new Date(2026, 8, 21, 4, 5).getTime()
    const lateEvening = new Date(2026, 8, 21, 23, 55).getTime()

    expect(daysUntilDeadline(lesson({ deadline: ten }), earlyMorning)).toBe(10)
    expect(daysUntilDeadline(lesson({ deadline: ten }), lateEvening)).toBe(10)
  })
})
