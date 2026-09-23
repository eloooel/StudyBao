import { STUDY_DAY_ROLLOVER_HOUR } from '@/lib/study-day'
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
 * A date input gives a calendar day, not an instant, and the exam date has to mean "the
 * study day she sits the exam" rather than "an instant 8 hours into it". Anchoring to the
 * 04:00 boundary keeps the countdown from being off by one depending on the time of day she
 * opened Settings.
 *
 * Returns `undefined` for an empty or unparseable value, so clearing the field clears it
 * rather than storing `NaN`.
 */
export function examDateToEpochMs(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return undefined

  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), STUDY_DAY_ROLLOVER_HOUR)

  // Reject a rolled-over date like 2027-02-31, which `Date` would silently turn into March.
  if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return undefined

  return date.getTime()
}

/** Epoch ms back to the `YYYY-MM-DD` a date input expects. */
export function epochMsToExamDateInput(examDate: number | undefined): string {
  if (examDate === undefined) return ''

  const date = new Date(examDate)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Whole study days from `now` until the exam. Negative once the date has passed. */
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
