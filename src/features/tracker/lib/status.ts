import type { Lesson, LessonStatus } from '@/db/types'
import type { LessonFilter } from '../types'

/**
 * The status vocabulary and the filter chips.
 *
 * The keys live in `src/db/types.ts` (they are what the database holds); the labels live here.
 * That split is what makes "a filter that ignores a case" impossible rather than merely
 * tested-for: the filter compares two values from the same literal union, so there is no label to
 * normalise and no wording that can drift out from under a stored row.
 */

/** In workflow order, which is the order the form offers them. */
export const LESSON_STATUSES: readonly LessonStatus[] = ['not-started', 'reviewing', 'mastered']

const STATUS_LABELS: Record<LessonStatus, string> = {
  'not-started': 'Not started',
  reviewing: 'Reviewing',
  mastered: 'Mastered',
}

export function lessonStatusLabel(status: LessonStatus): string {
  return STATUS_LABELS[status]
}

/**
 * The chips, in the order she meets them.
 *
 * `active` is the default for one reason: a finished topic must never render as outstanding. That
 * is the guilt framing the voice rules forbid, and the fastest way to make her stop opening the
 * tracker — so mastered lessons are out of the default view entirely and one tap away on their own
 * chip.
 */
export const LESSON_FILTERS: readonly LessonFilter[] = [
  'active',
  'not-started',
  'reviewing',
  'mastered',
]

const FILTER_LABELS: Record<LessonFilter, string> = {
  active: 'To do',
  'not-started': STATUS_LABELS['not-started'],
  reviewing: STATUS_LABELS.reviewing,
  mastered: STATUS_LABELS.mastered,
}

export function lessonFilterLabel(filter: LessonFilter): string {
  return FILTER_LABELS[filter]
}

export function isLessonFilter(value: string): value is LessonFilter {
  return (LESSON_FILTERS as readonly string[]).includes(value)
}

/**
 * The filter named by a URL parameter, falling back to `active`.
 *
 * The fallback is the point, not a nicety: `?status=` can arrive from a bookmark, a typed URL, or
 * a link saved before a rename, and an unrecognised value must show her normal list rather than an
 * empty screen she cannot explain. Same reasoning as the `?tab=` parameter on the ingest screen.
 */
export function parseLessonFilter(value: string | null): LessonFilter {
  return value !== null && isLessonFilter(value) ? value : 'active'
}

export function matchesFilter(lesson: Lesson, filter: LessonFilter): boolean {
  return filter === 'active' ? lesson.status !== 'mastered' : lesson.status === filter
}

/**
 * How many lessons each chip would show, so a chip can say so before she taps it.
 *
 * Counted from the whole list rather than from the visible rows: a count that changed depending on
 * which chip was selected would be worse than no count at all.
 */
export function lessonCounts(lessons: readonly Lesson[]): Record<LessonFilter, number> {
  const active = lessons.filter((lesson) => lesson.status !== 'mastered')

  return {
    active: active.length,
    'not-started': active.filter((lesson) => lesson.status === 'not-started').length,
    reviewing: active.filter((lesson) => lesson.status === 'reviewing').length,
    // Everything not in `active` is mastered, by definition of the two states.
    mastered: lessons.length - active.length,
  }
}

/**
 * What an empty chip says (Workflow E addition A: every chip gets one).
 *
 * A filter matching nothing is the *normal* case on a good week — she taps Mastered having
 * mastered none, or To do when everything is done — and a blank region under a row of chips is
 * indistinguishable from a bug.
 */
export const FILTER_EMPTY: Record<LessonFilter, { title: string; message: string }> = {
  active: {
    title: 'Nothing on your list yet',
    message:
      'Add the topics you’re working through, one part at a time. A rough date is fine — you can move it whenever.',
  },
  'not-started': {
    title: 'Nothing waiting to start',
    message:
      'Everything you’ve added is either in review or done. Add a lesson when you’re ready for the next one.',
  },
  reviewing: {
    title: 'Nothing in review right now',
    message: 'Open a lesson and set it to Reviewing when you pick it up — or start something new.',
  },
  mastered: {
    title: 'Nothing mastered yet',
    message:
      'When a topic feels solid, mark it and it’ll move in here. No rush — mastered is a place to arrive, not a race.',
  },
}
