/**
 * The backup envelope: one JSON file holding every table, and the rules for reading one back.
 *
 * Pure — no Dexie, no DOM, no clock. It lives in `src/lib/` rather than in `src/db/` for the same
 * reason `study-day.ts` does: it is a rule about the data model that both the repositories and the
 * settings feature need, and putting it in either one would force the other to import across a
 * layer. See docs/EXPORT-IMPORT.md.
 *
 * ## Why this module is the only place the table list lives
 *
 * A backup that silently omits a table is worse than no backup, because she will trust it. So the
 * list of tables is declared once, here, and `src/db/repositories/backup.test.ts` asserts that the
 * open schema declares **exactly** these tables — adding a seventh table to `schema.ts` without
 * adding it here turns the suite red instead of shipping a file that is quietly missing her data.
 *
 * ## What is validated, and what deliberately is not
 *
 * Validated: the envelope's shape, the format version, that every table is present and is an array,
 * that every record is an object with a unique non-empty string `id`, that the per-table counts in
 * the file match the arrays, and that the settings singleton is present. Those are the checks that
 * make "never write a partial import" hold.
 *
 * **Not** validated: the rest of each record's shape. A `nextReview` that is a string instead of a
 * number would pass here, and `selectDueCards` would then compare a number against a string, so the
 * card would never come due and would silently vanish from review. The compensating control is that
 * the export is the source of truth: a bad import is redoable from a good file, and the pre-import
 * save exists so the file she has is not the only one. See docs/ai/change-data-model.md.
 */

/** Discriminator, so "not one of our files" is answerable without reasoning about a version. */
export const BACKUP_FORMAT = 'studybao-backup'

/**
 * **1.** A future importer compares against this and refuses anything newer rather than guessing.
 * Bump it when the shape of the envelope changes in a way an older build cannot read — not for a
 * new optional field inside a record.
 */
export const BACKUP_FORMAT_VERSION = 1

/**
 * Every table in the database, in a fixed order, so two exports of the same data are identical.
 *
 * The settings singleton's id, duplicated from `SETTINGS_ID` in `src/db/schema.ts`. Deliberate:
 * this module must not import the Dexie schema, so the value is copied and the two are asserted
 * equal in `src/db/repositories/backup.test.ts`. They cannot drift silently.
 */
export const BACKUP_TABLES = [
  'decks',
  'cards',
  'reviewLogs',
  'settings',
  'sessions',
  'lessons',
] as const

export type BackupTable = (typeof BACKUP_TABLES)[number]

/** The settings row's id. See `BACKUP_TABLES` for why this is not imported. */
export const SETTINGS_ROW_ID = 'app'

/** A count per table. Shown to her before a destructive import, and a cross-check after a parse. */
export type TableCounts = Record<BackupTable, number>

/**
 * A row as far as the parser checks it: a plain object with a non-empty string id. The rest of the
 * fields arrive as `unknown` on purpose — see the module comment on what is not validated.
 */
export interface BackupRow {
  id: string
  [field: string]: unknown
}

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  /** Epoch ms, like every other timestamp in this app. */
  exportedAt: number
  counts: TableCounts
  tables: Record<BackupTable, BackupRow[]>
}

/**
 * Why a file was refused.
 *
 * Machine-readable on purpose: the words she reads live in
 * `src/features/settings/lib/backup-messages.ts`, so `src/db/` never carries user-facing prose.
 * Each code has a different remedy, which is the test for whether it deserves to exist:
 * a wrong file, an out-of-date app, a damaged file, or a damaged file that a fresh export fixes.
 */
export type BackupFailure =
  | { code: 'not-json' }
  | { code: 'not-a-backup' }
  | { code: 'version-missing' }
  | { code: 'version-newer'; found: number }
  | { code: 'table-invalid'; table: BackupTable }
  | { code: 'table-unknown'; table: string }
  | { code: 'record-invalid'; table: BackupTable }
  | { code: 'record-duplicate'; table: BackupTable }
  /** `said: null` means the file's count for that table was missing or not a number. */
  | { code: 'counts-mismatch'; table: BackupTable; said: number | null; found: number }
  | { code: 'settings-missing' }

export type BackupParseResult =
  { ok: true; envelope: BackupEnvelope } | { ok: false; failure: BackupFailure }

/**
 * Build the envelope that gets written to the file.
 *
 * The cast is the one place this module admits that `src/db/types.ts`'s records and its own looser
 * `BackupRow` are different types: the exporter holds typed rows, and the envelope type is the
 * validated one because that is also the shape that arrives from a file. Nothing is checked here —
 * this side is writing rows that came out of IndexedDB.
 */
export function buildEnvelope(
  tables: Record<BackupTable, readonly unknown[]>,
  exportedAt: number,
): BackupEnvelope {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt,
    counts: countRows(tables),
    tables: tables as Record<BackupTable, BackupRow[]>,
  }
}

/** The counts shown on the confirmation dialog, and the cross-check against the file's own. */
export function countRows(tables: Record<BackupTable, readonly unknown[]>): TableCounts {
  const counts = {} as TableCounts
  for (const table of BACKUP_TABLES) counts[table] = tables[table].length
  return counts
}

/** Indented, so a human who opens the file sees structure rather than one enormous line. */
export function serializeBackup(envelope: BackupEnvelope): string {
  return JSON.stringify(envelope, null, 2)
}

/**
 * Parse and validate a file's text. Never throws: every failure is a value, so the caller reports a
 * reason instead of an exception it cannot phrase.
 */
export function parseBackup(text: string): BackupParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, failure: { code: 'not-json' } }
  }

  if (!isPlainObject(parsed)) return { ok: false, failure: { code: 'not-a-backup' } }

  // The discriminator and `exportedAt` are envelope-level damage with one remedy — the file is not
  // one of ours, or it is truncated — so they share a code rather than inventing copy that would
  // tell her the same thing three ways.
  if (parsed.format !== BACKUP_FORMAT) return { ok: false, failure: { code: 'not-a-backup' } }
  if (typeof parsed.exportedAt !== 'number' || !Number.isFinite(parsed.exportedAt)) {
    return { ok: false, failure: { code: 'not-a-backup' } }
  }

  const version = parsed.formatVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, failure: { code: 'version-missing' } }
  }
  if (version > BACKUP_FORMAT_VERSION) {
    return { ok: false, failure: { code: 'version-newer', found: version } }
  }

  const tables = parsed.tables
  if (!isPlainObject(tables)) return { ok: false, failure: { code: 'not-a-backup' } }

  // An unknown table is refused rather than ignored: a later build adding a table without bumping
  // the version would otherwise be imported by this one with that table silently dropped, which is
  // the exact failure this format exists to prevent. A frozen version 1 cannot contain one.
  for (const key of Object.keys(tables)) {
    if (!isBackupTable(key)) return { ok: false, failure: { code: 'table-unknown', table: key } }
  }

  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(tables[table])) {
      return { ok: false, failure: { code: 'table-invalid', table } }
    }
  }

  const rows = {} as Record<BackupTable, BackupRow[]>
  for (const table of BACKUP_TABLES) {
    const raw = tables[table] as unknown[]
    const seen = new Set<string>()
    const validated: BackupRow[] = []

    for (const row of raw) {
      if (!isBackupRow(row)) return { ok: false, failure: { code: 'record-invalid', table } }
      // A duplicate id would be collapsed by `bulkPut` without a word, which is the shape of a
      // truncated file rather than a loud corruption.
      if (seen.has(row.id)) return { ok: false, failure: { code: 'record-duplicate', table } }
      seen.add(row.id)
      validated.push(row)
    }

    rows[table] = validated
  }

  const counts = parsed.counts
  if (!isPlainObject(counts)) return { ok: false, failure: { code: 'not-a-backup' } }

  for (const table of BACKUP_TABLES) {
    const found = rows[table].length
    const said = counts[table]
    if (typeof said !== 'number' || !Number.isInteger(said) || said < 0) {
      return { ok: false, failure: { code: 'counts-mismatch', table, said: null, found } }
    }
    if (said !== found) {
      return { ok: false, failure: { code: 'counts-mismatch', table, said, found } }
    }
  }

  // Without the singleton row, `getSettings()` would read nothing and the seeding backstop would
  // find no `seededAt` on the next open — which is how an import ends with five duplicate PRC decks.
  if (!rows.settings.some((row) => row.id === SETTINGS_ROW_ID)) {
    return { ok: false, failure: { code: 'settings-missing' } }
  }

  return {
    ok: true,
    envelope: {
      format: BACKUP_FORMAT,
      formatVersion: version,
      exportedAt: parsed.exportedAt,
      counts: countRows(rows),
      tables: rows,
    },
  }
}

/**
 * Guarantee the seeding gate survives an import.
 *
 * `seededAt` on the settings singleton is what stops the five PRC decks being seeded again, so a
 * restored database without it would open by adding duplicates on top of the decks she just
 * imported. Validation requires the singleton row to exist; this makes the *marker* structurally
 * present rather than merely trusted, and it passes an existing value through untouched so a real
 * export round-trips byte-for-byte.
 *
 * It is applied inside the import transaction, immediately before the write.
 */
export function withSeededMarker(rows: readonly BackupRow[], now: number): BackupRow[] {
  return rows.map((row) => {
    if (row.id !== SETTINGS_ROW_ID) return row
    const seededAt = row.seededAt
    if (typeof seededAt === 'number' && Number.isFinite(seededAt)) return row
    return { ...row, seededAt: now }
  })
}

export function isBackupTable(value: string): value is BackupTable {
  return (BACKUP_TABLES as readonly string[]).includes(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBackupRow(value: unknown): value is BackupRow {
  if (!isPlainObject(value)) return false
  return typeof value.id === 'string' && value.id !== ''
}
