import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { dateInputFromStudyDayMs } from '@/lib/study-day'
import { readDeadlineInput } from '../lib/deadline'
import { LESSON_STATUSES, lessonStatusLabel } from '../lib/status'
import { DEFAULT_SUBJECT, SUBJECT_OPTIONS } from '../lib/subject'
import type { LessonFormValues, LessonFormViewProps } from '../types'

/**
 * Layer 3 — the add/edit lesson form, and the **only** lesson form (docs/BUILD_GUIDE.md §4).
 *
 * Built from the shared primitives — `Modal`, `Input`, `Button`, and the same styled native
 * `<select>` the ingest deck picker uses — rather than a second form system. The fields live in a
 * child mounted with a **new identity per target** (the `key` below), because the Modal keeps its
 * children mounted even while closed: a form holding its own state at this level would still show
 * the previous lesson's topic the next time it opened. Remounting is the fix, and it is why there
 * is no "sync props into state" effect anywhere here.
 *
 * Validation is deliberately gentle and there is exactly one requirement. A topic with no date is a
 * normal lesson — that is why `deadline` is optional — so the only thing that blocks saving is
 * having nothing to call it, and the submit button stays enabled so that pressing it *says* so
 * instead of doing nothing.
 */
export function LessonFormView({ open, target, onSubmit, onClose, onDelete }: LessonFormViewProps) {
  const editing = target?.mode === 'edit'

  const identity =
    target?.mode === 'edit'
      ? `edit:${target.lesson.id}`
      : target?.mode === 'create'
        ? 'create'
        : 'closed'

  const initial: LessonFormValues =
    target?.mode === 'edit'
      ? {
          subject: target.lesson.subject,
          topic: target.lesson.topic,
          status: target.lesson.status,
          // Spread conditionally so an absent field stays absent rather than becoming an explicit
          // `undefined` in the form's state.
          ...(target.lesson.deadline === undefined ? {} : { deadline: target.lesson.deadline }),
          ...(target.lesson.notes === undefined ? {} : { notes: target.lesson.notes }),
        }
      : { subject: DEFAULT_SUBJECT, topic: '', status: 'not-started' }

  return (
    <Modal
      open={open && target !== null}
      onClose={onClose}
      title={editing ? 'Edit this lesson' : 'Add a lesson'}
      description={
        editing
          ? 'Change anything you like — the lesson keeps its place.'
          : 'A topic and a part is enough. The date can wait.'
      }
      footer={
        editing && onDelete ? (
          <Button variant="ghost" onClick={onDelete}>
            Delete this lesson
          </Button>
        ) : null
      }
    >
      <LessonFormFields
        key={identity}
        initial={initial}
        editing={editing}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Modal>
  )
}

interface LessonFormFieldsProps {
  initial: LessonFormValues
  editing: boolean
  onSubmit: (values: LessonFormValues) => void
  onClose: () => void
}

function LessonFormFields({ initial, editing, onSubmit, onClose }: LessonFormFieldsProps) {
  const [values, setValues] = useState<LessonFormValues>(initial)
  // The date input speaks `YYYY-MM-DD`; the model stores the 04:00 study-day start of that day.
  // Separate state because it is a different representation of one field, not a second field.
  const [dateInput, setDateInput] = useState(dateInputFromStudyDayMs(initial.deadline))
  const [error, setError] = useState<string | undefined>(undefined)

  const notes = values.notes ?? ''

  function handleSubmit() {
    if (values.topic.trim().length === 0) {
      setError('Give it a topic — that’s the one thing a lesson needs.')
      return
    }

    // The decision itself is a pure function with its own tests; this only reports it.
    const date = readDeadlineInput(dateInput)
    if (date.kind === 'invalid') {
      setError('That date doesn’t look right. Pick it from the calendar and try again.')
      return
    }

    onSubmit({
      subject: values.subject,
      topic: values.topic.trim(),
      status: values.status,
      // `none` means "no date yet": an empty field is a real state, not a mistake.
      ...(date.kind === 'date' ? { deadline: date.deadline } : {}),
      ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-display text-sm font-semibold text-ink">Which part?</span>
        <select
          value={values.subject}
          onChange={(event) => {
            // Matched against the vocabulary rather than cast: the option values come from
            // `SUBJECT_OPTIONS`, and a value that is not in the list is simply not applied.
            const chosen = SUBJECT_OPTIONS.find((option) => option.part === event.target.value)
            if (chosen === undefined) return
            setValues((previous) => ({ ...previous, subject: chosen.part }))
            setError(undefined)
          }}
          className="min-h-12 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base text-ink focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          {SUBJECT_OPTIONS.map((option) => (
            <option key={option.part} value={option.part}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <Input
        label="Topic"
        value={values.topic}
        onChange={(event) => {
          setValues((previous) => ({ ...previous, topic: event.target.value }))
          setError(undefined)
        }}
        placeholder="Fluid and electrolytes"
      />

      <Input
        label="Date"
        type="date"
        value={dateInput}
        hint="Optional. Leave it empty and it waits in No date yet until you’re ready."
        onChange={(event) => {
          setDateInput(event.target.value)
          setError(undefined)
        }}
      />

      <label className="flex flex-col gap-1.5">
        <span className="font-display text-sm font-semibold text-ink">Where is it up to?</span>
        <select
          value={values.status}
          onChange={(event) => {
            const chosen = LESSON_STATUSES.find((status) => status === event.target.value)
            if (chosen === undefined) return
            setValues((previous) => ({ ...previous, status: chosen }))
            setError(undefined)
          }}
          className="min-h-12 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base text-ink focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          {LESSON_STATUSES.map((status) => (
            <option key={status} value={status}>
              {lessonStatusLabel(status)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-display text-sm font-semibold text-ink">
          Notes <span className="font-normal text-ink-muted">(optional)</span>
        </span>
        <textarea
          value={notes}
          onChange={(event) => {
            setValues((previous) => ({ ...previous, notes: event.target.value }))
            setError(undefined)
          }}
          rows={3}
          placeholder="Pages to read, a lecturer’s tip, anything worth remembering."
          className="min-h-24 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 py-2.5 text-base leading-relaxed text-ink placeholder:text-ink-faint focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-accent">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        {/*
          Not `disabled` when the topic is empty, deliberately unlike the card form: a disabled
          button that refuses a tap explains nothing, and the error line above says exactly what is
          missing. The guard in `handleSubmit` is the same check.
        */}
        <Button onClick={handleSubmit}>{editing ? 'Save changes' : 'Add lesson'}</Button>
      </div>
    </div>
  )
}
