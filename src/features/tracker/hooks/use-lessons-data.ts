import { useCallback } from 'react'

import { listLessons } from '@/db/repositories/lessons'
import { useDatabaseValue } from '@/lib/use-database-value'
import { selectLessons } from '../lib/deadline'
import type { LessonFilter, LessonsView } from '../types'

/**
 * Layer 2 — the tracker's read path.
 *
 * The rules (what is overdue, what belongs in which section, in what order) are pure functions in
 * `lib/deadline.ts`. This hook's only jobs are to read the table and to hold **one** clock for the
 * whole render:
 *
 * - one clock, because the sections and the chip counts must not be computed against two different
 *   `Date.now()` values — across the 04:00 boundary that shows a count that disagrees with the list
 *   underneath it;
 * - captured inside the loader rather than passed in, because `useDatabaseValue` re-reads whenever
 *   `load` changes identity. A `Date.now()` in the dependency list is a new function on every
 *   render, which cancels and restarts its own read forever and leaves `loading` true. That mistake
 *   was made once in Workflow C and cost an afternoon.
 *
 * `now` is therefore refreshed on every read: a data change, a filter change, or a screen change.
 * A tab left open past 04:00 keeps saying "Today" until something moves — which is the honest
 * trade for not re-rendering a list of twenty rows every minute.
 */
const EMPTY: LessonsView = {
  groups: [],
  counts: { active: 0, 'not-started': 0, reviewing: 0, mastered: 0 },
  total: 0,
  now: 0,
}

export function useLessonsData(filter: LessonFilter): LessonsView & { loading: boolean } {
  const load = useCallback(
    async () => selectLessons(await listLessons(), filter, Date.now()),
    [filter],
  )

  const { value, loading } = useDatabaseValue(load, EMPTY)

  return { ...value, loading }
}
