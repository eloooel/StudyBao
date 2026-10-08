import { describe, expect, it } from 'vitest'

import { BACKUP_TABLES, type BackupFailure } from '@/lib/backup-format'

import {
  BACKUP_COPY,
  COUNTED_TABLES,
  TABLE_LABELS,
  backupFailureMessage,
  formatCount,
} from './backup-messages'

/**
 * The words, tested.
 *
 * The value here is not that a sentence renders; it is that every machine failure has a sentence,
 * that the sentence tells her the one thing she needs (nothing was changed), and that no internal
 * vocabulary leaks into it. `backupFailureMessage` is exhaustive by type, so this file is what
 * proves the branches are also *useful*.
 */

const EVERY_FAILURE: readonly BackupFailure[] = [
  { code: 'not-json' },
  { code: 'not-a-backup' },
  { code: 'version-missing' },
  { code: 'version-newer', found: 2 },
  { code: 'table-invalid', table: 'lessons' },
  { code: 'table-unknown', table: 'notes' },
  { code: 'record-invalid', table: 'cards' },
  { code: 'record-duplicate', table: 'cards' },
  { code: 'counts-mismatch', table: 'cards', said: 429, found: 1 },
  { code: 'counts-mismatch', table: 'cards', said: null, found: 1 },
  { code: 'settings-missing' },
]

describe('a refusal', () => {
  it('always says nothing was changed, which is what the transaction guarantees', () => {
    for (const failure of EVERY_FAILURE) {
      const message = backupFailureMessage(failure)

      expect(message.length, failure.code).toBeGreaterThan(20)
      expect(message, failure.code).toMatch(/nothing was changed/i)
    }
  })

  it('never leaks a type name, an internal table name, or an undefined into the sentence', () => {
    for (const failure of EVERY_FAILURE) {
      const message = backupFailureMessage(failure)

      expect(message, failure.code).not.toMatch(
        /undefined|null|NaN|reviewLogs|record-|BackupFailure/,
      )
    }
  })

  it('names the damaged table the way she knows it', () => {
    expect(backupFailureMessage({ code: 'table-invalid', table: 'lessons' })).toContain('lesson')
    expect(backupFailureMessage({ code: 'record-invalid', table: 'reviewLogs' })).toContain(
      'one of your reviews',
    )
    expect(backupFailureMessage({ code: 'record-duplicate', table: 'sessions' })).toContain(
      'the same focus block twice',
    )
  })

  it('says what the file claimed and what it really held', () => {
    const message = backupFailureMessage({
      code: 'counts-mismatch',
      table: 'cards',
      said: 1208,
      found: 380,
    })

    expect(message).toContain('1,208 cards')
    expect(message).toContain('380')
  })

  it('points at a page refresh only where a refresh can actually help', () => {
    // The un-deferred advice for a corrupt version 1 file: refreshing cannot change it, and the
    // "app is older than the file" case is the version check's job. See docs/EXPORT-IMPORT.md.
    expect(backupFailureMessage({ code: 'version-newer', found: 2 })).toMatch(/refresh/i)
    expect(backupFailureMessage({ code: 'table-unknown', table: 'notes' })).not.toMatch(/refresh/i)
  })

  it('tells her a wrong file is the wrong file', () => {
    expect(backupFailureMessage({ code: 'not-json' })).toContain('.json')
    expect(backupFailureMessage({ code: 'not-a-backup' })).toContain('.json')
  })
})

describe('the labels and the counts', () => {
  it('has a name for every table, and no internal name survives', () => {
    for (const table of BACKUP_TABLES) {
      expect(TABLE_LABELS[table], table).not.toBe(table)
      expect(TABLE_LABELS[table].length, table).toBeGreaterThan(2)
    }
  })

  it('lists the five tables she would recognise, and not the settings row', () => {
    expect(COUNTED_TABLES).toEqual(['decks', 'cards', 'reviewLogs', 'sessions', 'lessons'])
    expect(COUNTED_TABLES).not.toContain('settings')
  })

  it('groups thousands so a count is read rather than counted', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(5)).toBe('5')
    expect(formatCount(1208)).toBe('1,208')
    expect(formatCount(1_048_576)).toBe('1,048,576')
  })
})

describe('the rest of the copy', () => {
  it('names the file it saved', () => {
    expect(BACKUP_COPY.exportSuccess('studybao-backup-2026-10-08.json')).toContain(
      'studybao-backup-2026-10-08.json',
    )
  })

  it('reassures after a failed import and after an unreadable file', () => {
    expect(BACKUP_COPY.importFailed).toMatch(/nothing was changed/i)
    expect(BACKUP_COPY.unreadable).toMatch(/nothing was changed/i)
  })

  it('says the pre-import save is the way back, not merely that it worked', () => {
    expect(BACKUP_COPY.preImportSaved).toMatch(/way back/i)
  })
})
