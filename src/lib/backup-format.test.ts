import { describe, expect, it } from 'vitest'

import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  SETTINGS_ROW_ID,
  buildEnvelope,
  countRows,
  parseBackup,
  serializeBackup,
  withSeededMarker,
} from './backup-format'

/**
 * The backup envelope's rules.
 *
 * These are the checks that stand between a file she picked and six tables being replaced, so each
 * one is asserted to *refuse* rather than to throw: the caller needs a reason it can put in front of
 * her, not an exception. The damage is applied to the *serialised* file, never to the parsed result,
 * so every case goes through the same door a real file does.
 */

const EXPORTED_AT = 1_800_000_000_000

/**
 * A deliberately loose file object, so a test can damage exactly one thing.
 *
 * `format`, `formatVersion` and `exportedAt` are optional so a test can `delete` one. `counts` and
 * `tables` are required and mutable, because most damage is a value inside them.
 */
interface LooseFile {
  format?: unknown
  formatVersion?: unknown
  exportedAt?: unknown
  counts: Record<string, unknown>
  tables: Record<string, unknown[]>
}

function fileObject(): LooseFile {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: EXPORTED_AT,
    counts: { decks: 1, cards: 1, reviewLogs: 1, settings: 1, sessions: 1, lessons: 1 },
    tables: {
      decks: [{ id: 'deck-1', subject: 'practice-i' }],
      cards: [{ id: 'card-1', deckId: 'deck-1' }],
      reviewLogs: [{ id: 'log-1', cardId: 'card-1', grade: 4 }],
      settings: [{ id: SETTINGS_ROW_ID, seededAt: 1, cramThresholdDays: 30, cloudSync: true }],
      sessions: [{ id: 'session-1', completed: true }],
      lessons: [{ id: 'lesson-1', status: 'reviewing' }],
    },
  }
}

function textOf(damage: (file: LooseFile) => void = () => {}): string {
  const file = fileObject()
  damage(file)
  return JSON.stringify(file)
}

describe('building a backup', () => {
  it('stamps the format, the version and the export time', () => {
    const envelope = buildEnvelope(
      {
        decks: [{ id: 'deck-1' }],
        cards: [],
        reviewLogs: [],
        settings: [{ id: SETTINGS_ROW_ID }],
        sessions: [],
        lessons: [],
      },
      EXPORTED_AT,
    )

    expect(envelope.format).toBe(BACKUP_FORMAT)
    expect(envelope.formatVersion).toBe(BACKUP_FORMAT_VERSION)
    expect(envelope.exportedAt).toBe(EXPORTED_AT)
  })

  it('counts every table, including the empty ones', () => {
    const envelope = buildEnvelope(
      {
        decks: [{ id: 'deck-1' }, { id: 'deck-2' }],
        cards: [],
        reviewLogs: [{ id: 'log-1' }],
        settings: [{ id: SETTINGS_ROW_ID }],
        sessions: [],
        lessons: [],
      },
      EXPORTED_AT,
    )

    expect(envelope.counts).toEqual({
      decks: 2,
      cards: 0,
      reviewLogs: 1,
      settings: 1,
      sessions: 0,
      lessons: 0,
    })
  })

  it('counts whatever each table holds rather than a fixed list', () => {
    expect(
      countRows({
        decks: [],
        cards: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        reviewLogs: [],
        settings: [],
        sessions: [],
        lessons: [],
      }).cards,
    ).toBe(3)
  })

  it('survives a round trip through its own serialisation, rows untouched', () => {
    const file = fileObject()
    const rows = {
      decks: file.tables.decks ?? [],
      cards: file.tables.cards ?? [],
      reviewLogs: file.tables.reviewLogs ?? [],
      settings: file.tables.settings ?? [],
      sessions: file.tables.sessions ?? [],
      lessons: file.tables.lessons ?? [],
    }

    const parsed = parseBackup(serializeBackup(buildEnvelope(rows, EXPORTED_AT)))

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.envelope.tables).toEqual(rows)
    expect(parsed.envelope.exportedAt).toBe(EXPORTED_AT)
    expect(parsed.envelope.formatVersion).toBe(BACKUP_FORMAT_VERSION)
  })

  it('ignores extra envelope keys, so a later build adding one is still readable', () => {
    expect(parseBackup(JSON.stringify({ ...fileObject(), appVersion: '0.2.0' })).ok).toBe(true)
  })
})

describe('refusing a file', () => {
  it('refuses text that is not JSON', () => {
    expect(parseBackup('not json at all')).toEqual({ ok: false, failure: { code: 'not-json' } })
  })

  it('refuses JSON that is not an object', () => {
    for (const notAnObject of ['[]', '"a string"', 'null', '42', 'true']) {
      expect(parseBackup(notAnObject), notAnObject).toEqual({
        ok: false,
        failure: { code: 'not-a-backup' },
      })
    }
  })

  it('refuses JSON that is not one of ours', () => {
    expect(parseBackup(textOf((file) => (file.format = 'some-other-app')))).toEqual({
      ok: false,
      failure: { code: 'not-a-backup' },
    })
    expect(parseBackup(textOf((file) => delete file.format))).toEqual({
      ok: false,
      failure: { code: 'not-a-backup' },
    })
  })

  it('refuses a file with no usable export time', () => {
    expect(parseBackup(textOf((file) => delete file.exportedAt))).toEqual({
      ok: false,
      failure: { code: 'not-a-backup' },
    })
    expect(parseBackup(textOf((file) => (file.exportedAt = 'yesterday')))).toEqual({
      ok: false,
      failure: { code: 'not-a-backup' },
    })
  })

  it('refuses a format version that is missing or unusable', () => {
    const unusable = [
      (file: LooseFile) => delete file.formatVersion,
      (file: LooseFile) => (file.formatVersion = '1'),
      (file: LooseFile) => (file.formatVersion = 1.5),
      (file: LooseFile) => (file.formatVersion = 0),
      (file: LooseFile) => (file.formatVersion = -1),
      (file: LooseFile) => (file.formatVersion = null),
    ]

    for (const damage of unusable) {
      expect(parseBackup(textOf(damage))).toEqual({
        ok: false,
        failure: { code: 'version-missing' },
      })
    }
  })

  it('refuses a version from the future rather than guessing', () => {
    expect(parseBackup(textOf((file) => (file.formatVersion = BACKUP_FORMAT_VERSION + 1)))).toEqual({
      ok: false,
      failure: { code: 'version-newer', found: BACKUP_FORMAT_VERSION + 1 },
    })
  })

  it('refuses a file that is missing a whole table', () => {
    expect(parseBackup(textOf((file) => delete file.tables.lessons))).toEqual({
      ok: false,
      failure: { code: 'table-invalid', table: 'lessons' },
    })
  })

  it('refuses a table that is not a list', () => {
    expect(
      parseBackup(textOf((file) => (file.tables.lessons = { id: 'lesson-1' } as unknown as unknown[]))),
    ).toEqual({
      ok: false,
      failure: { code: 'table-invalid', table: 'lessons' },
    })
  })

  it('refuses a table this version does not know about, rather than dropping it', () => {
    expect(parseBackup(textOf((file) => (file.tables.notes = [])))).toEqual({
      ok: false,
      failure: { code: 'table-unknown', table: 'notes' },
    })
  })

  it('refuses a tables field that is not an object at all', () => {
    // Built by spread rather than mutation: the point is a value the type would not allow.
    expect(parseBackup(JSON.stringify({ ...fileObject(), tables: 42 }))).toEqual({
      ok: false,
      failure: { code: 'not-a-backup' },
    })
  })

  it('refuses a record that is not an object, or has no id', () => {
    const damaged = [
      (file: LooseFile) => (file.tables.cards = [null]),
      (file: LooseFile) => (file.tables.cards = ['card-1']),
      (file: LooseFile) => (file.tables.cards = [{ deckId: 'deck-1' }]),
      (file: LooseFile) => (file.tables.cards = [{ id: '' }]),
      (file: LooseFile) => (file.tables.cards = [{ id: 7 }]),
    ]

    for (const damage of damaged) {
      expect(parseBackup(textOf(damage))).toEqual({
        ok: false,
        failure: { code: 'record-invalid', table: 'cards' },
      })
    }
  })

  it('refuses the same id twice, which bulkPut would collapse silently', () => {
    expect(
      parseBackup(
        textOf((file) => {
          file.tables.cards = [{ id: 'card-1' }, { id: 'card-1' }]
          file.counts.cards = 2
        }),
      ),
    ).toEqual({ ok: false, failure: { code: 'record-duplicate', table: 'cards' } })
  })

  it('refuses counts that disagree with what the file holds', () => {
    expect(parseBackup(textOf((file) => (file.counts.cards = 429)))).toEqual({
      ok: false,
      failure: { code: 'counts-mismatch', table: 'cards', said: 429, found: 1 },
    })
  })

  it('refuses a count that is missing or not a number', () => {
    const damaged = [
      (file: LooseFile) => delete file.counts.cards,
      (file: LooseFile) => (file.counts.cards = '1'),
      (file: LooseFile) => (file.counts.cards = -1),
      (file: LooseFile) => (file.counts.cards = 1.5),
    ]

    for (const damage of damaged) {
      expect(parseBackup(textOf(damage))).toEqual({
        ok: false,
        failure: { code: 'counts-mismatch', table: 'cards', said: null, found: 1 },
      })
    }
  })

  it('refuses a file with no counts object at all', () => {
    // `undefined` disappears in JSON, so this serialises with no `counts` key.
    expect(parseBackup(JSON.stringify({ ...fileObject(), counts: undefined }))).toEqual({
      ok: false,
      failure: { code: 'not-a-backup' },
    })
  })

  it('refuses a file whose settings table holds no rows', () => {
    // Not a cosmetic check: a file without the settings singleton leaves the seeding gate unset,
    // and the next open adds five duplicate PRC decks on top of the imported ones.
    expect(
      parseBackup(
        textOf((file) => {
          file.tables.settings = []
          file.counts.settings = 0
        }),
      ),
    ).toEqual({ ok: false, failure: { code: 'settings-missing' } })
  })

  it('refuses a settings row that is not the singleton id', () => {
    expect(parseBackup(textOf((file) => (file.tables.settings = [{ id: 'other' }])))).toEqual({
      ok: false,
      failure: { code: 'settings-missing' },
    })
  })
})

describe('the seeding marker', () => {
  it('leaves an existing marker exactly as it was', () => {
    const rows = [{ id: SETTINGS_ROW_ID, seededAt: 123, cloudSync: true }]

    expect(withSeededMarker(rows, 999)).toEqual(rows)
  })

  it('stamps a missing or unusable marker, so seeding stays gated', () => {
    for (const marker of [undefined, null, 'yesterday', Number.NaN]) {
      const rows = [{ id: SETTINGS_ROW_ID, seededAt: marker }]

      const stamped = withSeededMarker(rows, 999)

      expect(stamped[0]?.seededAt, String(marker)).toBe(999)
      expect(stamped[0]?.id).toBe(SETTINGS_ROW_ID)
    }
  })

  it('touches only the settings singleton', () => {
    const rows = [{ id: 'deck-1' }, { id: SETTINGS_ROW_ID }, { id: 'lesson-1', seededAt: 'no' }]

    const stamped = withSeededMarker(rows, 999)

    expect(stamped[0]).toEqual({ id: 'deck-1' })
    expect(stamped[2]).toEqual({ id: 'lesson-1', seededAt: 'no' })
    expect(stamped[1]?.seededAt).toBe(999)
  })

  it('does not mutate the rows it was given', () => {
    const rows = [{ id: SETTINGS_ROW_ID }]

    withSeededMarker(rows, 999)

    expect(rows[0]).toEqual({ id: SETTINGS_ROW_ID })
  })
})
