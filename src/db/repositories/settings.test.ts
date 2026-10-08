import { describe, expect, it } from 'vitest'

import { MS_PER_DAY } from '@/lib/time'
import { DEFAULT_CRAM_THRESHOLD_DAYS, SETTINGS_ID, getDb } from '../schema'
import { daysUntilExam, getSettings, updateSettings } from './settings'

/**
 * The settings row, and the exam countdown.
 *
 * The date-input round trip that used to live here moved to `src/lib/study-day.test.ts` with the
 * conversion itself in Workflow E, when lesson deadlines needed the same 04:00 anchor. What stays
 * is the repository, plus `daysUntilExam` — whose 24-hour `ceil` is deliberately *not* the
 * study-day rule, so it is pinned here rather than in the study-day suite.
 */

describe('getSettings', () => {
  it('returns defaults for a database that has a settings row from seeding', async () => {
    const settings = await getSettings()

    expect(settings.id).toBe(SETTINGS_ID)
    expect(settings.cramThresholdDays).toBe(DEFAULT_CRAM_THRESHOLD_DAYS)
    expect(settings.cloudSync).toBe(true)
    // Seeding stamped this, so no exam date has been set yet.
    expect(settings.examDate).toBeUndefined()
    expect(settings.seededAt).toBeGreaterThan(0)
  })

  it('fills defaults rather than returning undefined when the row is missing', async () => {
    const db = await getDb()
    await db.settings.clear()

    const settings = await getSettings()

    expect(settings.cramThresholdDays).toBe(DEFAULT_CRAM_THRESHOLD_DAYS)
    expect(settings.cloudSync).toBe(true)
    expect(settings.updatedAt).toBe(0)
  })
})

describe('updateSettings', () => {
  it('merges a patch and stamps updatedAt', async () => {
    const now = 1_800_000_000_000

    const updated = await updateSettings({ cramThresholdDays: 21 }, now)

    expect(updated.cramThresholdDays).toBe(21)
    expect(updated.updatedAt).toBe(now)
    // Untouched fields survive the merge.
    expect(updated.cloudSync).toBe(true)
  })

  it('persists across reads', async () => {
    await updateSettings({ examDate: 1_800_000_000_000 })

    expect((await getSettings()).examDate).toBe(1_800_000_000_000)
  })

  it('clears a field when the patch sets it to undefined', async () => {
    await updateSettings({ examDate: 1_800_000_000_000 })
    expect((await getSettings()).examDate).toBe(1_800_000_000_000)

    await updateSettings({ examDate: undefined })

    const settings = await getSettings()
    expect(settings.examDate).toBeUndefined()
    // Removed, not stored as an explicit undefined property — otherwise it would reappear.
    expect(Object.hasOwn(settings, 'examDate')).toBe(false)
  })

  it('toggles cloud sync', async () => {
    await updateSettings({ cloudSync: false })

    expect((await getSettings()).cloudSync).toBe(false)
  })
})

describe('daysUntilExam', () => {
  const examDate = new Date(2027, 1, 26, 4, 0, 0, 0).getTime()

  it('returns undefined when no exam date is set', () => {
    expect(daysUntilExam(undefined)).toBeUndefined()
  })

  it('counts whole days remaining', () => {
    expect(daysUntilExam(examDate, examDate - 10 * MS_PER_DAY)).toBe(10)
    expect(daysUntilExam(examDate, examDate - MS_PER_DAY)).toBe(1)
  })

  it('is zero on the day itself', () => {
    expect(daysUntilExam(examDate, examDate)).toBe(0)
  })

  it('goes negative once the date has passed', () => {
    expect(daysUntilExam(examDate, examDate + MS_PER_DAY)).toBe(-1)
  })
})
