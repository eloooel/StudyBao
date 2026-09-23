import { describe, expect, it } from 'vitest'

import { GRADE_AGAIN, GRADE_EASY, GRADE_GOOD, GRADE_HARD } from '@/db/types'
import { GRADE_OPTIONS, describeNextReview, gradeFromShortcut, shortcutForGrade } from './grades'

describe('grade options', () => {
  it('maps the four buttons to the four SM-2 grades, weakest first', () => {
    expect(GRADE_OPTIONS.map((option) => option.grade)).toEqual([
      GRADE_AGAIN,
      GRADE_HARD,
      GRADE_GOOD,
      GRADE_EASY,
    ])
  })

  it('gives every button a distinct label, hint and keyboard shortcut', () => {
    const labels = GRADE_OPTIONS.map((option) => option.label)
    const hints = GRADE_OPTIONS.map((option) => option.hint)
    const shortcuts = GRADE_OPTIONS.map((option) => shortcutForGrade(option.grade))

    expect(new Set(labels).size).toBe(4)
    expect(new Set(hints).size).toBe(4)
    expect(new Set(shortcuts).size).toBe(4)
    expect(shortcuts.every((key) => key.length > 0)).toBe(true)
  })

  it('reads a grade back from its shortcut, and rejects anything else', () => {
    for (const option of GRADE_OPTIONS) {
      expect(gradeFromShortcut(shortcutForGrade(option.grade))).toBe(option.grade)
    }

    expect(gradeFromShortcut('9')).toBeUndefined()
    expect(gradeFromShortcut('')).toBeUndefined()
  })
})

describe('describeNextReview', () => {
  it('describes the learning steps in minutes', () => {
    expect(describeNextReview(0, 0)).toBe('again in about a minute')
    expect(describeNextReview(0, 1)).toBe('again in about 10 minutes')
  })

  it('calls the first day-scale interval tomorrow', () => {
    expect(describeNextReview(1, null)).toBe('again tomorrow')
  })

  it('counts days up to a month', () => {
    expect(describeNextReview(6, null)).toBe('again in 6 days')
    expect(describeNextReview(15, null)).toBe('again in 15 days')
    expect(describeNextReview(29, null)).toBe('again in 29 days')
  })

  it('switches to months once the interval is long, so the number stays meaningful', () => {
    expect(describeNextReview(30, null)).toBe('again in about a month')
    expect(describeNextReview(60, null)).toBe('again in about 2 months')
  })
})
