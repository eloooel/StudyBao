import { prcPartOrder } from '@/db/schema'
import type { Lesson } from '@/db/types'
import { studyDayMsFromDateInput, studyDaysBetween } from '@/lib/study-day'
import type { DateGroupId, LessonFilter, LessonGroup, LessonGroupId, LessonsView } from '../types'
import { lessonCounts, matchesFilter } from './status'

/**
 * The rules about *when* a lesson is due, and in what order she sees them.
 *
 * Everything here is a pure function of `(lessons, filter, now)`. That is deliberate: the
 * interesting failures are a lesson that is overdue at 00:30 but not at 23:59, a section order that
 * puts "Later on" above "Still waiting", and a mastered topic that renders as late. None of those
 * needs a database to reproduce, so none of them is tested through one.
 *
 * **Every day count here goes through `src/lib/study-day.ts`.** A deadline is anchored at the 04:00
 * study-day start of the day she means, so comparing against `Date.now()`'s calendar date — or
 * against `daysUntilExam`, which is a whole-24-hour count — would make a lesson due "today" flip to
 * overdue at midnight while she is still studying.
 */

/** How many study days ahead still counts as "this week". */
export const THIS_WEEK_STUDY_DAYS = 7

/**
 * Local weekday and month names, spelled out rather than formatted through `Intl`.
 *
 * `Intl` output depends on the runtime's locale data (en-GB gives "Fri 6 Nov", en-US gives
 * "Fri, Nov 6"), which would make these labels — and every test that asserts one — depend on where
 * the suite happens to run. The app is for one person in one language, so the names are written
 * down once.
 */
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * The indexes below are always in range — `Date.getDay()` is 0–6 and `getMonth()` is 0–11 — and the
 * fallbacks exist only because `noUncheckedIndexedAccess` is on and a non-null assertion is not
 * allowed here. They are unreachable, not defensive defaults.
 */
function weekdayName(index: number): string {
  return WEEKDAY_NAMES[index] ?? WEEKDAY_NAMES[0]
}

function monthName(index: number): string {
  return MONTH_NAMES[index] ?? MONTH_NAMES[0]
}

export const GROUP_TITLES: Record<LessonGroupId, string> = {
  overdue: 'Still waiting',
  'this-week': 'This week',
  later: 'Later on',
  'no-date': 'No date yet',
  mastered: 'Mastered',
}

/**
 * What a section says when it has no rows. Every section has one, for the same reason every chip
 * does: a section that vanishes is indistinguishable from a section that is broken, and "nothing
 * has slipped" is the sentence she most wants to read on a good week.
 */
export const GROUP_EMPTY_MESSAGES: Record<LessonGroupId, string> = {
  overdue: 'Nothing has slipped.',
  'this-week': 'Nothing due in the next seven days.',
  later: 'Nothing further out yet.',
  'no-date': 'Every lesson has a date.',
  mastered: 'Nothing mastered yet.',
}

/** The four date sections in render order. `mastered` is deliberately not a date section. */
export const DATE_GROUPS: readonly DateGroupId[] = ['overdue', 'this-week', 'later', 'no-date']

/**
 * Whole study days from `now` until a lesson's deadline, or `undefined` when it has none.
 *
 * **Not `daysUntilExam`.** That one is a whole-24-hour `ceil` against a date fixed in the world;
 * this is the 04:00 study-day rule, so a lesson due today is 0 at 23:59 and still 0 at 03:00 the
 * next morning. Substituting one for the other is invisible until it is wrong at exactly the hour
 * she is most likely to be studying. See the doc comment on `daysUntilExam`.
 */
export function daysUntilDeadline(lesson: Lesson, now: number): number | undefined {
  if (lesson.deadline === undefined) return undefined
  return studyDaysBetween(now, lesson.deadline)
}

/**
 * Whether a lesson has slipped past its date.
 *
 * A **mastered** lesson is never overdue, whatever its date says: she finished it. A finished topic
 * rendering as late is the guilt framing the tracker must not produce, and it is the same reasoning
 * that keeps mastered lessons out of the default view.
 */
export function isOverdue(lesson: Lesson, now: number): boolean {
  if (lesson.status === 'mastered') return false

  const days = daysUntilDeadline(lesson, now)
  return days !== undefined && days < 0
}

/** `Fri 6 Nov`, with the year only once it is no longer the year `now` falls in. */
export function deadlineDateLabel(deadline: number, now: number): string {
  const date = new Date(deadline)
  const day = `${weekdayName(date.getDay())} ${date.getDate()} ${monthName(date.getMonth())}`

  return date.getFullYear() === new Date(now).getFullYear() ? day : `${day} ${date.getFullYear()}`
}

/** `today` / `tomorrow` / `yesterday` / `in 12 days` / `3 days ago`. */
export function deadlineRelativeLabel(deadline: number, now: number): string {
  const days = studyDaysBetween(now, deadline)

  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}

/**
 * The whole deadline line for a row: the date, then how far away it is.
 *
 * Today, tomorrow and yesterday stand alone because a word beats a date at that range — "Today" is
 * what she wants to read, not "Mon 21 Sep · today" — and because those are the three days where the
 * 04:00 boundary is doing visible work.
 */
export function formatDeadline(deadline: number | undefined, now: number): string {
  if (deadline === undefined) return 'No date yet'

  const days = studyDaysBetween(now, deadline)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'

  return `${deadlineDateLabel(deadline, now)} · ${deadlineRelativeLabel(deadline, now)}`
}

/**
 * What the form's date field means.
 *
 * Three outcomes, and the third is the one worth having: an empty field is **no date yet** (a real
 * state, not a mistake — that is why `deadline` is optional), a valid `YYYY-MM-DD` becomes the 04:00
 * study-day start of that day, and anything else is **refused** rather than silently dropped,
 * because a date that vanishes is a deadline she believes she set. A date input cannot produce the
 * third case in a browser; it lives here because the decision is a rule, and a rule stated once as a
 * pure function is testable without a DOM.
 */
export type DeadlineInput =
  { kind: 'none' } | { kind: 'date'; deadline: number } | { kind: 'invalid' }

export function readDeadlineInput(value: string): DeadlineInput {
  if (value.trim() === '') return { kind: 'none' }

  const deadline = studyDayMsFromDateInput(value)
  return deadline === undefined ? { kind: 'invalid' } : { kind: 'date', deadline }
}

/**
 * Dated before undated, soonest deadline first, then official exam order, then topic, then id.
 *
 * The `id` tie-break is not decoration: without it, two lessons with the same topic in the same
 * part can swap places between renders, and a list that rearranges itself looks broken.
 */
export function sortLessons(lessons: readonly Lesson[]): Lesson[] {
  return [...lessons].sort(compareLessons)
}

function compareLessons(a: Lesson, b: Lesson): number {
  if (a.deadline !== undefined && b.deadline !== undefined) {
    if (a.deadline !== b.deadline) return a.deadline - b.deadline
  } else if (a.deadline !== undefined) {
    return -1
  } else if (b.deadline !== undefined) {
    return 1
  }

  return (
    prcPartOrder(a.subject) - prcPartOrder(b.subject) ||
    a.topic.localeCompare(b.topic) ||
    a.id.localeCompare(b.id)
  )
}

/**
 * The sections for one filter: overdue → this week → later → no date yet, and always all four.
 *
 * All four are returned even when empty, because each carries its own line of explanation. A
 * section that disappears is indistinguishable from a section that is broken.
 *
 * The `mastered` chip is the exception: it gets one flat section. A finished topic has no urgency,
 * and grouping mastered lessons by date would file one under "Still waiting" the moment its date
 * passed — the exact rendering this feature exists to avoid.
 */
export function lessonGroups(
  lessons: readonly Lesson[],
  filter: LessonFilter,
  now: number,
): LessonGroup[] {
  const visible = lessons.filter((lesson) => matchesFilter(lesson, filter))

  if (filter === 'mastered') {
    return [
      {
        id: 'mastered',
        title: GROUP_TITLES.mastered,
        emptyMessage: GROUP_EMPTY_MESSAGES.mastered,
        lessons: sortLessons(visible),
      },
    ]
  }

  const buckets: Record<DateGroupId, Lesson[]> = {
    overdue: [],
    'this-week': [],
    later: [],
    'no-date': [],
  }

  for (const lesson of visible) {
    const days = daysUntilDeadline(lesson, now)

    if (days === undefined) buckets['no-date'].push(lesson)
    else if (isOverdue(lesson, now)) buckets.overdue.push(lesson)
    else if (days <= THIS_WEEK_STUDY_DAYS) buckets['this-week'].push(lesson)
    else buckets.later.push(lesson)
  }

  return DATE_GROUPS.map((id) => ({
    id,
    title: GROUP_TITLES[id],
    emptyMessage: GROUP_EMPTY_MESSAGES[id],
    lessons: sortLessons(buckets[id]),
  }))
}

/**
 * The whole view model for one render: the sections, the chip counts, and the clock they were
 * computed against.
 *
 * One function rather than three calls in the hook, so the counts and the sections can never be
 * computed against two different clocks — which is a real possibility across the 04:00 boundary and
 * would show a chip count that disagrees with the list under it.
 */
export function selectLessons(
  lessons: readonly Lesson[],
  filter: LessonFilter,
  now: number,
): LessonsView {
  const groups = lessonGroups(lessons, filter, now)

  return {
    groups,
    counts: lessonCounts(lessons),
    total: groups.reduce((sum, group) => sum + group.lessons.length, 0),
    now,
  }
}
