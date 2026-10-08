import { useCallback, useState } from 'react'

import {
  createLesson,
  setLessonStatus,
  softDeleteLesson,
  updateLesson,
} from '@/db/repositories/lessons'
import type { LessonStatus } from '@/db/types'
import { notifyDataChanged } from '@/lib/use-database-value'
import type { LessonFormValues } from '../types'

/**
 * Layer 2 — every write the tracker makes.
 *
 * A failed write surfaces as an error string for the form or the list to show rather than throwing
 * into the void: she cannot read a stack trace, and a save that silently does nothing is the worst
 * possible outcome for a topic she just typed.
 *
 * `moveStatus` is separate from `saveLesson` on purpose. It is the one-tap action from the list,
 * and it must not be able to touch anything else — a quick action that rewrote a topic from a stale
 * snapshot would be a worse bug than not having the shortcut.
 */
export interface LessonActions {
  saving: boolean
  error?: string
  saveNewLesson: (values: LessonFormValues) => Promise<boolean>
  saveLesson: (id: string, values: LessonFormValues) => Promise<boolean>
  moveStatus: (id: string, status: LessonStatus) => Promise<void>
  removeLesson: (id: string) => Promise<void>
  clearError: () => void
}

export function useLessonActions(): LessonActions {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const saveNewLesson = useCallback(async (values: LessonFormValues) => {
    setSaving(true)
    setError(undefined)
    try {
      await createLesson({
        subject: values.subject,
        topic: values.topic,
        status: values.status,
        ...(values.deadline === undefined ? {} : { deadline: values.deadline }),
        ...(values.notes === undefined ? {} : { notes: values.notes }),
      })
      notifyDataChanged()
      return true
    } catch {
      setError(
        'That lesson didn’t save. Try again — if it keeps happening, your device may be out of space.',
      )
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const saveLesson = useCallback(async (id: string, values: LessonFormValues) => {
    setSaving(true)
    setError(undefined)
    try {
      await updateLesson(id, {
        subject: values.subject,
        topic: values.topic,
        status: values.status,
        // Explicitly present and undefined, which the repository reads as "clear the date".
        deadline: values.deadline,
        notes: values.notes,
      })
      notifyDataChanged()
      return true
    } catch {
      setError('That change didn’t save. Try again — your lesson is still there as it was.')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const moveStatus = useCallback(async (id: string, status: LessonStatus) => {
    setSaving(true)
    setError(undefined)
    try {
      await setLessonStatus(id, status)
      notifyDataChanged()
    } catch {
      setError('That didn’t save. Try again — your lesson is still where it was.')
    } finally {
      setSaving(false)
    }
  }, [])

  const removeLesson = useCallback(async (id: string) => {
    setSaving(true)
    setError(undefined)
    try {
      await softDeleteLesson(id)
      notifyDataChanged()
    } catch {
      setError('That lesson couldn’t be removed. Nothing has been deleted.')
    } finally {
      setSaving(false)
    }
  }, [])

  const clearError = useCallback(() => setError(undefined), [])

  return { saving, error, saveNewLesson, saveLesson, moveStatus, removeLesson, clearError }
}
