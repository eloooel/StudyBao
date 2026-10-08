/*
 * The zone must be pinned before any date is constructed, which is why this is its own file — the
 * same reason `src/lib/study-day.dst.test.ts` is. Setting `TZ` mid-suite changes nothing for tests
 * that already built their dates, and a filename assertion that silently ran under UTC would pass
 * for the wrong reason.
 *
 * `Asia/Manila` rather than the machine's zone because that is where she is: UTC+8, no daylight
 * saving, so the UTC day and her day disagree for the first eight hours of every day.
 */
process.env.TZ = 'Asia/Manila'

import { describe, expect, it } from 'vitest'

import { backupFilename } from './backup-file'

describe('a backup saved in her own zone', () => {
  it('is really running in her zone, or the rest of this file proves nothing', () => {
    // UTC+8: the offset is -480 minutes, all year. If this fails, TZ did not take effect and every
    // assertion below would be testing UTC while reading as if it tested Manila.
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-480)
  })

  it('is named for her day, not the UTC day, when she saves it after midnight', () => {
    const justAfterMidnight = new Date('2026-10-08T00:30:00+08:00').getTime()

    // The trap this file exists for: the naive `toISOString().slice(0, 10)` dates this file to the
    // day before, so a backup she saves late at night carries yesterday's date.
    expect(new Date(justAfterMidnight).toISOString().slice(0, 10)).toBe('2026-10-07')
    expect(backupFilename(justAfterMidnight)).toBe('studybao-backup-2026-10-08.json')
  })

  it('is named for the new year when she saves it just after midnight on the 1st', () => {
    expect(backupFilename(new Date('2027-01-01T00:30:00+08:00').getTime())).toBe(
      'studybao-backup-2027-01-01.json',
    )
  })

  it('is named for her day when the UTC clock has already rolled over', () => {
    // 2026-10-08T23:30 in Manila is 15:30 UTC on the 8th; the two only disagree across midnight,
    // which is the case above. Asserted so the agreement itself is pinned rather than assumed.
    const lateEvening = new Date('2026-10-08T23:30:00+08:00').getTime()

    expect(backupFilename(lateEvening)).toBe('studybao-backup-2026-10-08.json')
  })
})
