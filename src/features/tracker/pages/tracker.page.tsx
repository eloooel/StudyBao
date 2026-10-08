import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { Lesson } from '@/db/types'
import { LessonFormView } from '../components/lesson-form-view'
import { TrackerView } from '../components/tracker-view'
import { useLessonActions } from '../hooks/use-lesson-actions'
import { useLessonsData } from '../hooks/use-lessons-data'
import { parseLessonFilter } from '../lib/status'
import type { LessonFormTarget } from '../types'

/**
 * Layer 1 — lessons, plus the add/edit/delete flows.
 *
 * The filter lives in the URL (`?status=reviewing`), like the ingest tab and the review mode, so a
 * refresh or an iPad tab restore keeps her where she was. It is written with `replace`, because a
 * filter is a view of one list rather than a place: Back should leave the screen, not walk back
 * through four chips.
 *
 * Confirmation is required for deletion even though it is a soft delete — from her side a deleted
 * lesson is gone, and the tombstone is an implementation detail she should never have to know
 * about. So the dialog says what will happen in her terms, not the schema's.
 */
export default function TrackerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = parseLessonFilter(searchParams.get('status'))
  const data = useLessonsData(filter)
  const { saving, error, saveNewLesson, saveLesson, moveStatus, removeLesson, clearError } =
    useLessonActions()

  const [formTarget, setFormTarget] = useState<LessonFormTarget>(null)
  const [pendingDelete, setPendingDelete] = useState<Lesson | undefined>(undefined)

  return (
    <>
      <TrackerView
        groups={data.groups}
        counts={data.counts}
        total={data.total}
        now={data.now}
        filter={filter}
        loading={data.loading}
        onSelectFilter={(next) => {
          setSearchParams(next === 'active' ? {} : { status: next }, { replace: true })
        }}
        onAddLesson={() => {
          clearError()
          setFormTarget({ mode: 'create' })
        }}
        onEditLesson={(lesson) => {
          clearError()
          setFormTarget({ mode: 'edit', lesson })
        }}
        onToggleMastered={(lesson) => {
          // The one-tap route to done, and back. There is no stored "previous status" to restore,
          // so a lesson that turns out not to be solid goes to Reviewing — which is what the button
          // says it will do.
          void moveStatus(lesson.id, lesson.status === 'mastered' ? 'reviewing' : 'mastered')
        }}
      />

      <LessonFormView
        open={formTarget !== null}
        target={formTarget}
        onSubmit={(values) => {
          if (formTarget === null) return
          clearError()

          void (async () => {
            const ok =
              formTarget.mode === 'create'
                ? await saveNewLesson(values)
                : await saveLesson(formTarget.lesson.id, values)
            if (ok) setFormTarget(null)
          })()
        }}
        onClose={() => {
          clearError()
          setFormTarget(null)
        }}
        onDelete={
          formTarget?.mode === 'edit' ? () => setPendingDelete(formTarget.lesson) : undefined
        }
      />

      {saving ? (
        <p className="sr-only" role="status">
          Saving
        </p>
      ) : null}

      <Modal
        open={pendingDelete !== undefined}
        onClose={() => setPendingDelete(undefined)}
        title="Delete this lesson?"
        description="It disappears from your plan. This can’t be undone from here."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(undefined)}>
              Keep it
            </Button>
            <Button
              variant="strong"
              onClick={() => {
                if (pendingDelete) void removeLesson(pendingDelete.id)
                setPendingDelete(undefined)
                setFormTarget(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">{pendingDelete?.topic}</p>
      </Modal>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-accent">
          {error}
        </p>
      ) : null}
    </>
  )
}
