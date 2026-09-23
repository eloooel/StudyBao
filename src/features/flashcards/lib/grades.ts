import { GRADE_AGAIN, GRADE_EASY, GRADE_GOOD, GRADE_HARD, type Grade } from '@/db/types'

/**
 * The four buttons, and what each one means to her.
 *
 * Kept here rather than in the view so the grade → label mapping is one list that a test can
 * assert, and so the scheduler's numbers and the words on screen can never drift apart.
 *
 * The hints are deliberately about what *she* did — "no idea", "nearly", "got it", "too easy"
 * — not about the scheduler's internals. She is not a developer and never will be; "q=3" or
 * "EF −0.14" is meaningless to her, and a grading screen she has to decode is one she will
 * tap through at random.
 */

export interface GradeOption {
  grade: Grade
  label: string
  /** Shown under the label on the button. */
  hint: string
  /** Which palette role the button uses. Never a raw colour — see theme.css. */
  variant: 'strong' | 'secondary' | 'primary' | 'ghost'
}

/**
 * In button order, weakest first. The order is fixed and never re-sorted by frequency: muscle
 * memory matters more than ergonomics here, and a row that reorders itself would make her tap
 * the wrong button.
 */
export const GRADE_OPTIONS: readonly GradeOption[] = [
  { grade: GRADE_AGAIN, label: 'Again', hint: 'No idea', variant: 'strong' },
  { grade: GRADE_HARD, label: 'Hard', hint: 'Nearly', variant: 'secondary' },
  { grade: GRADE_GOOD, label: 'Good', hint: 'Got it', variant: 'primary' },
  { grade: GRADE_EASY, label: 'Easy', hint: 'Too easy', variant: 'ghost' },
]

/** Keyboard shortcut for a grade, so the laptop stays as fast as the iPad. */
export function shortcutForGrade(grade: Grade): string {
  return { 0: '1', 3: '2', 4: '3', 5: '4' }[grade] ?? ''
}

export function gradeFromShortcut(key: string): Grade | undefined {
  const option = GRADE_OPTIONS.find((candidate) => shortcutForGrade(candidate.grade) === key)
  return option?.grade
}

/**
 * What she can expect to happen, in her words. Shown after grading so the schedule is not a
 * mystery she has to take on faith.
 *
 * Formats from `intervalDays` and `learningStep`: minutes for a learning step, days once
 * graduated. Deliberately coarse — "in about 1 min" rather than a countdown, because the
 * scheduler is not a promise about a specific second.
 */
export function describeNextReview(intervalDays: number, learningStep: number | null): string {
  if (learningStep !== null) {
    return learningStep === 0 ? 'again in about a minute' : 'again in about 10 minutes'
  }

  if (intervalDays <= 1) return 'again tomorrow'
  if (intervalDays < 30) return `again in ${intervalDays} days`

  const months = Math.round(intervalDays / 30)
  return months === 1 ? 'again in about a month' : `again in about ${months} months`
}
