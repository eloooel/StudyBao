import type { Lesson, LessonStatus, PrcPart } from '@/db/types'

/**
 * Every type this feature uses, including component prop types.
 *
 * All user-facing strings are `string` here, not a literal union: the app is for one person with
 * one language, and a translation layer would be speculative generality.
 */

/**
 * Which lessons the list is showing.
 *
 * `'active'` is deliberately not a stored status: it is every lesson that is not mastered, and it
 * is the default because a finished topic must never render as outstanding. The other three are the
 * stored `LessonStatus` keys, so a chip and a row cannot disagree about what a word means.
 */
export type LessonFilter = 'active' | LessonStatus

export type LessonGroupId = 'overdue' | 'this-week' | 'later' | 'no-date' | 'mastered'

/** The four date sections, in the order they render. `mastered` is not one of them. */
export type DateGroupId = Exclude<LessonGroupId, 'mastered'>

/** One section of the list, with the copy it shows when it has no rows. */
export interface LessonGroup {
  id: LessonGroupId
  title: string
  /** Rendered in place of rows when the section is empty. A blank region reads as a bug. */
  emptyMessage: string
  lessons: Lesson[]
}

/** Which lesson the form is editing, or `null` when it is closed. */
export type LessonFormTarget = { mode: 'create' } | { mode: 'edit'; lesson: Lesson } | null

export interface LessonFormValues {
  subject: PrcPart
  topic: string
  /** Absent means "no date yet"; the form's empty date field is the normal case, not an error. */
  deadline?: number
  status: LessonStatus
  notes?: string
}

/** Everything one render of the tracker needs, computed by `lib/deadline.ts`. */
export interface LessonsView {
  groups: LessonGroup[]
  counts: Record<LessonFilter, number>
  /** Live lessons matching the current chip. Zero means the chip's own empty state. */
  total: number
  /** The clock the sections were computed against. */
  now: number
}

export interface TrackerViewProps extends LessonsView {
  /** Which chip is showing, so the view can mark it and choose the empty state. */
  filter: LessonFilter
  loading: boolean
  onSelectFilter: (filter: LessonFilter) => void
  onAddLesson: () => void
  onEditLesson: (lesson: Lesson) => void
  onToggleMastered: (lesson: Lesson) => void
}

export interface LessonFormViewProps {
  open: boolean
  target: LessonFormTarget
  onSubmit: (values: LessonFormValues) => void
  onClose: () => void
  /** Editing only. A lesson that does not exist yet cannot be deleted. */
  onDelete?: () => void
}
