import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { backupFilename, downloadTextFile } from './backup-file'

/**
 * The download plumbing.
 *
 * jsdom has `Blob` and `File` but **not** `URL.createObjectURL`, so the two URL methods are
 * installed here by hand rather than mocked through a module boundary — that keeps the test
 * exercising the real function, including the element it builds and removes.
 */

const URL_METHODS = ['createObjectURL', 'revokeObjectURL'] as const

let clicked: HTMLAnchorElement[] = []

beforeEach(() => {
  clicked = []
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:studybao-backup'),
    revokeObjectURL: vi.fn(),
  })
  // jsdom's anchor click tries to navigate, which is noise and not what is under test.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this)
  })
})

afterEach(() => {
  for (const method of URL_METHODS) Reflect.deleteProperty(URL, method)
})

describe('naming the file', () => {
  it('names it for the day and the app, so she can recognise it a month later', () => {
    const name = backupFilename(Date.UTC(2026, 9, 8, 12, 0, 0))

    expect(name).toMatch(/^studybao-backup-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('zero-pads the month and the day', () => {
    const march = new Date(2026, 2, 5, 12, 0, 0).getTime()

    expect(backupFilename(march)).toContain('-03-05')
  })

  it('uses the local calendar day, not the UTC one', () => {
    const localMidday = new Date(2026, 9, 8, 12, 0, 0).getTime()

    expect(backupFilename(localMidday)).toBe(
      `studybao-backup-${new Date(localMidday).getFullYear()}-10-08.json`,
    )
  })
})

describe('handing the file to the browser', () => {
  it('downloads it under the name it was given, as JSON', () => {
    downloadTextFile('studybao-backup-2026-10-08.json', '{"format":"studybao-backup"}')

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0]
    expect(blob).toBeInstanceOf(Blob)
    expect((blob as Blob).type).toBe('application/json')

    expect(clicked).toHaveLength(1)
    expect(clicked[0]?.download).toBe('studybao-backup-2026-10-08.json')
    expect(clicked[0]?.href).toBe('blob:studybao-backup')
  })

  it('takes the anchor back out of the page, so nothing is left behind', () => {
    downloadTextFile('studybao-backup-2026-10-08.json', '{}')

    expect(document.querySelector('a')).toBeNull()
  })

  it('holds the blob URL open long enough for the browser to take it', () => {
    vi.useFakeTimers()
    try {
      downloadTextFile('studybao-backup-2026-10-08.json', '{}')

      // Not revoked on the same tick: a URL revoked before the browser has read it is a download
      // that silently never happens.
      expect(URL.revokeObjectURL).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1000)

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:studybao-backup')
    } finally {
      vi.useRealTimers()
    }
  })
})
