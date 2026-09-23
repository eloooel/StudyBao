import { describe, expect, it } from 'vitest'

import { MS_PER_DAY } from '@/lib/time'
import { DEFAULT_CRAM_THRESHOLD_DAYS, SETTINGS_ID, getDb } from '../schema'
import {
  daysUntilExam,
  epochMsToExamDateInput,
  examDateToEpochMs,
  getSettings,
  updateSettings,
} from './settings'

/**
 * The settings row, and the exam-date round trip.
 *
 * The round trip is the part worth testing rather than eyeballing: a date input hands over a
 * calendar day, the model stores an epoch-ms instant, and an off-by-one here would silently move
 * her countdown and the day cram mode starts. Every assertion therefore names the local calendar
 * value it expects, never a raw number.
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

describe('examDateToEpochMs', () => {
  it('anchors the date to the 04:00 study-day start, in local time', () => {
    const parsed = examDateToEpochMs('2027-02-26')

    expect(parsed).toBeDefined()
    const date = new Date(parsed as number)
    expect(date.getFullYear()).toBe(2027)
    expect(date.getMonth()).toBe(1) // February
    expect(date.getDate()).toBe(26)
    expect(date.getHours()).toBe(4)
    expect(date.getMinutes()).toBe(0)
  })

  it('returns undefined for an empty value, so clearing the field clears the date', () => {
    expect(examDateToEpochMs('')).toBeUndefined()
    expect(examDateToEpochMs('   ')).toBeUndefined()
  })

  it('rejects a date that does not exist rather than rolling it over', () => {
    // `new Date(2027, 1, 31)` silently becomes 3 March. Storing that would move her exam.
    expect(examDateToEpochMs('2027-02-31')).toBeUndefined()
    expect(examDateToEpochMs('2027-13-01')).toBeUndefined()
  })

  it('rejects anything that is not a plain YYYY-MM-DD', () => {
    expect(examDateToEpochMs('26/02/2027')).toBeUndefined()
    expect(examDateToEpochMs('2027-2-6')).toBeUndefined()
    expect(examDateToEpochMs('tomorrow')).toBeUndefined()
  })

  it('accepts a leap day', () => {
    const parsed = examDateToEpochMs('2028-02-29')

    expect(parsed).toBeDefined()
    expect(new Date(parsed as number).getDate()).toBe(29)
  })
})

describe('epochMsToExamDateInput', () => {
  it('round-trips a date through the storage form and back', () => {
    for (const value of ['2027-02-26', '2026-12-01', '2028-02-29', '2027-01-01']) {
      const parsed = examDateToEpochMs(value)
      expect(epochMsToExamDateInput(parsed)).toBe(value)
    }
  })

  it('returns an empty string when no date is set', () => {
    expect(epochMsToExamDateInput(undefined)).toBe('')
  })

  it('reads a stored instant back as the calendar day it belongs to', () => {
    // 04:00 local on the 26th is unambiguously the 26th; this is why the 04:00 anchor matters.
    const atFourAm = new Date(2027, 1, 26, 4, 0, 0, 0).getTime()
    expect(epochMsToExamDateInput(atFourAm)).toBe('2027-02-26')
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
