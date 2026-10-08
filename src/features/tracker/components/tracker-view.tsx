import { CalendarIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Tag, type TagTone } from '@/components/ui/tag'
import type { Lesson, LessonStatus } from '@/db/types'
import { formatDeadline } from '../lib/deadline'
import { FILTER_EMPTY, LESSON_FILTERS, lessonFilterLabel, lessonStatusLabel } from '../lib/status'
import { subjectLabel } from '../lib/subject'
import type { TrackerViewProps } from '../types'

/**
 * Layer 3 — the lesson list. Pure JSX from typed props: no hooks, no database, no clock.
 *
 * `now` arrives as a prop rather than being read here, so the date labels are a deterministic
 * function of what the hook computed. Two `Date.now()` calls inside one render can straddle 04:00
 * and show a lesson as "Yesterday" in a section headed "This week".
 *
 * Two rules from Workflow E are visible in the shape of this file rather than only in the lib:
 * a section is never omitted (each carries its own line when empty), and a mastered lesson is
 * never accompanied by anything that reads as late.
 */

/**
 * Sage for mastered, mauve for not started, the soft rose for in review — the app's badge
 * language, so "mastered" reads as its own thing rather than as another pink. The `dot` on the tag
 * is the same status without relying on colour (docs/BUILD_GUIDE.md §5).
 */
const STATUS_TONES: Record<LessonStatus, TagTone> = {
  'not-started': 'neutral',
  reviewing: 'attention',
  mastered: 'success',
}

/** Ids for `aria-labelledby`. The headings are the sections' only labels. */
const HEADING_PREFIX = 'lesson-group'

export function TrackerView({
  groups,
  filter,
  counts,
  total,
  now,
  loading,
  onSelectFilter,
  onAddLesson,
  onEditLesson,
  onToggleMastered,
}: TrackerViewProps) {
  const empty = FILTER_EMPTY[filter]

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl">Lessons</h1>
        <p className="text-sm text-ink-muted">Your study plan, so it stops living in your head.</p>
      </header>

      <Button size="lg" fullWidth onClick={onAddLesson}>
        Add a lesson
      </Button>

      {/*
        The filter is a row of chips, not a select: it is the most-used control on the screen, and
        each chip carries its own count so she can see what is behind it before tapping.
      */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Which lessons to show">
        {LESSON_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={filter === option}
            onClick={() => onSelectFilter(option)}
            className="rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Tag tone={filter === option ? 'accent' : 'neutral'}>
              {lessonFilterLabel(option)} · {counts[option]}
            </Tag>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-ink-muted" role="status">
          Getting your lessons ready…
        </p>
      ) : total === 0 ? (
        /*
          One empty state per chip, not one for the screen (Workflow E addition A). A filter that
          matches nothing is the normal case on a good week — Mastered with nothing mastered, To do
          with everything done — and a blank region under the chips reads as a broken screen.
        */
        <EmptyState
          icon={<CalendarIcon className="size-6" />}
          title={empty.title}
          message={empty.message}
          action={<Button onClick={onAddLesson}>Add a lesson</Button>}
        />
      ) : (
        groups.map((group) => (
          <section
            key={group.id}
            className="flex flex-col gap-3"
            aria-labelledby={`${HEADING_PREFIX}-${group.id}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2
                id={`${HEADING_PREFIX}-${group.id}`}
                className="font-display text-base font-semibold text-ink"
              >
                {group.title}
              </h2>
              {group.lessons.length > 0 ? (
                <span className="text-xs text-ink-faint">{group.lessons.length}</span>
              ) : null}
            </div>

            {group.lessons.length === 0 ? (
              /* A section is never dropped when it empties: a heading that disappears is
                 indistinguishable from one that is broken. */
              <p className="text-sm text-ink-muted">{group.emptyMessage}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {group.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <LessonRow
                      lesson={lesson}
                      now={now}
                      onEdit={onEditLesson}
                      onToggleMastered={onToggleMastered}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  )
}

interface LessonRowProps {
  lesson: Lesson
  now: number
  onEdit: (lesson: Lesson) => void
  onToggleMastered: (lesson: Lesson) => void
}

function LessonRow({ lesson, now, onEdit, onToggleMastered }: LessonRowProps) {
  const mastered = lesson.status === 'mastered'

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-semibold text-ink">{lesson.topic}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              {subjectLabel(lesson.subject)} · {formatDeadline(lesson.deadline, now)}
            </p>
          </div>
          <Tag tone={STATUS_TONES[lesson.status]} dot>
            {lessonStatusLabel(lesson.status)}
          </Tag>
        </div>

        {lesson.notes ? (
          <p className="text-sm leading-relaxed text-ink-muted">{lesson.notes}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => onEdit(lesson)}>
            Edit
          </Button>
          {/*
            The one-tap route to "done", which is what makes the definition of done reachable
            without opening the form. Reversible in the same place: a topic that turns out not to be
            solid goes back to Reviewing from the Mastered chip.
          */}
          <Button variant="ghost" size="sm" onClick={() => onToggleMastered(lesson)}>
            {mastered ? 'Back to reviewing' : 'Mark mastered'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
