import { MS_PER_DAY } from '@/lib/time'
import { DEFAULT_CRAM_THRESHOLD_DAYS, SETTINGS_ID, getDb } from '../schema'
import type { AppSettings } from '../types'

/**
 * The settings row. A singleton, so there is no id argument anywhere in this module.
 *
 * `getSettings` always returns a row — it fills in defaults rather than making every call
 * site handle `undefined`. That matters because the alternative is a `??` at each of the
 * five places that read the cram threshold, and one of them will eventually forget.
 */
export async function getSettings(): Promise<AppSettings> {
  const db = await getDb()
  const stored = await db.settings.get(SETTINGS_ID)
  return withDefaults(stored)
}

/**
 * Merge a partial update into the settings row and stamp `updatedAt`.
 *
 * Read-modify-write inside a transaction so two writers cannot interleave and silently drop
 * one of the changes.
 */
export async function updateSettings(
  patch: Partial<AppSettings>,
  now = Date.now(),
): Promise<AppSettings> {
  const db = await getDb()

  return db.transaction('rw', db.settings, async () => {
    const base = withDefaults(await db.settings.get(SETTINGS_ID))

    // A key explicitly present with value `undefined` means "clear this field", so it is deleted
    // rather than written as an `undefined` property. Spreading would leave the old value in
    // place, which is the "I cleared the exam date and it came back" bug.
    const next: AppSettings = { ...base, ...patch, id: SETTINGS_ID, updatedAt: now }
    const mutable = next as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete mutable[key]
    }

    await db.settings.put(next)
    return next
  })
}

/**
 * The study-day start (04:00 local) for a `YYYY-MM-DD` value from a date input.
 *
 * **Moved to `src/lib/study-day.ts`** as `studyDayMsFromDateInput` in Workflow E, when lesson
 * deadlines needed the same conversion. It was a move rather than a copy because two copies of
 * "which day does this date mean" disagree eventually, and the failure is a deadline that sorts
 * into the wrong section with no way to see why. `src/lib/` rather than a feature because the
 * 04:00 rule is what `study-day.ts` exists to own.
 */

/**
 * Whole study days from `now` until the exam. Negative once the date has passed.
 *
 * **Deliberately a 24-hour count, and deliberately not reusable for a lesson deadline.** The exam
 * countdown answers "how many sleeps until the exam", where the date is a fixed fact in the world;
 * the `ceil` here is what makes the day before the exam read 1. A lesson's overdue-ness is a
 * study-day question — a lesson due today must not be overdue at 00:30 — and it goes through
 * `studyDaysBetween` in `@/lib/study-day`, which rolls over at 04:00.
 *
 * The two "days until" notions coexist on purpose. Swapping either one for the other is a silent
 * bug in one direction or the other: this function for a deadline reintroduces the midnight
 * boundary, and `studyDaysBetween` for the countdown moves the exam number at 04:00.
 */
export function daysUntilExam(examDate: number | undefined, now = Date.now()): number | undefined {
  if (examDate === undefined) return undefined
  return Math.ceil((examDate - now) / MS_PER_DAY)
}

function withDefaults(stored: AppSettings | undefined): AppSettings {
  return {
    // Spread first so an optional field that is genuinely absent stays absent rather than being
    // written as an `undefined` property.
    ...stored,
    id: SETTINGS_ID,
    cramThresholdDays: stored?.cramThresholdDays ?? DEFAULT_CRAM_THRESHOLD_DAYS,
    cloudSync: stored?.cloudSync ?? true,
    updatedAt: stored?.updatedAt ?? 0,
  }
}
