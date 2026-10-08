import { type BackupFailure, type BackupTable } from '@/lib/backup-format'

/**
 * Every word this feature says to her, in one place.
 *
 * The database layer returns machine codes and this module turns them into sentences, so
 * `src/db/` never carries user-facing prose and the copy can be reviewed as copy. Voice is
 * `docs/BUILD_GUIDE.md` §5: warm, plain, specific about what to do next, and never clinical.
 *
 * **Every refusal ends by saying nothing was changed**, because that is the reassurance that
 * matches the guarantee — the import is one transaction, so a refused file cannot have touched the
 * database. A failure message that leaves her wondering "did that half-work?" is the thing to avoid.
 */

/** What each table is called on screen. Never the internal name. */
export const TABLE_LABELS: Record<BackupTable, string> = {
  decks: 'Decks',
  cards: 'Cards',
  reviewLogs: 'Reviews',
  settings: 'Your settings',
  sessions: 'Focus blocks',
  lessons: 'Lessons',
}

/**
 * The tables the confirmation dialog lists, in order.
 *
 * `settings` is deliberately absent: "Your settings — 1" is a row that tells her nothing. What
 * matters about it is *stated instead* — that the exam date and her preferences come from the file
 * too, which is the part she would be surprised by.
 */
export const COUNTED_TABLES: readonly BackupTable[] = [
  'decks',
  'cards',
  'reviewLogs',
  'sessions',
  'lessons',
]

/** A table's name inside a sentence: "one of your cards", "its lesson list". */
const TABLE_NOUN: Record<BackupTable, string> = {
  decks: 'deck',
  cards: 'card',
  reviewLogs: 'review',
  settings: 'settings',
  sessions: 'focus block',
  lessons: 'lesson',
}

/** A table's name as a plural inside a sentence: "429 cards", "all of your lessons". */
const TABLE_NOUNS: Record<BackupTable, string> = {
  decks: 'decks',
  cards: 'cards',
  reviewLogs: 'reviews',
  settings: 'settings rows',
  sessions: 'focus blocks',
  lessons: 'lessons',
}

/** Hundreds of reviews are read at a glance, not counted: "1,208", not "1208". */
export function formatCount(value: number): string {
  // Pinned, not the device locale: this is a count in a sentence this module wrote, and a test
  // that changed with the machine's locale would be a test that fails on her laptop only.
  return value.toLocaleString('en-US')
}

/**
 * The reason a file was refused, in her words.
 *
 * The `switch` is exhaustive by type: adding a failure code without copy here is a compile error,
 * which is the only way to guarantee she never sees an empty or machine-worded message.
 */
export function backupFailureMessage(failure: BackupFailure): string {
  switch (failure.code) {
    case 'not-json':
      return 'That file wouldn’t open. Pick the .json file you saved from this screen — nothing was changed.'

    case 'not-a-backup':
      return 'That doesn’t look like a StudyBao backup. Pick the .json file you saved from this screen — nothing was changed.'

    case 'version-missing':
      return 'That file doesn’t say which version it is, so it isn’t safe to load. Nothing was changed.'

    case 'version-newer':
      return 'That backup was made by a newer version of StudyBao than this one. Refresh this page, then try again — nothing was changed.'

    case 'table-invalid':
      return `That file’s ${TABLE_NOUN[failure.table]} list is missing or damaged, so it isn’t a complete backup. Try the most recent backup you saved — nothing was changed.`

    // Deliberately does not name the unknown table: the name comes from the file, she cannot act on
    // it, and echoing unchecked file content into a banner buys nothing.
    case 'table-unknown':
      return 'That file has something in it this version doesn’t understand, so it looks damaged. Try the most recent backup you saved — nothing was changed.'

    case 'record-invalid':
      return `That file looks damaged — one of your ${TABLE_NOUNS[failure.table]} isn’t readable. Try the most recent backup you saved — nothing was changed.`

    case 'record-duplicate':
      return `That file looks damaged — it has the same ${TABLE_NOUN[failure.table]} twice. Try the most recent backup you saved — nothing was changed.`

    case 'counts-mismatch':
      return failure.said === null
        ? `That file looks damaged — its ${TABLE_NOUN[failure.table]} count is missing. Try the most recent backup you saved — nothing was changed.`
        : `That file looks incomplete — it says ${formatCount(failure.said)} ${TABLE_NOUNS[failure.table]} but only holds ${formatCount(failure.found)}. Try the most recent backup you saved — nothing was changed.`

    case 'settings-missing':
      return 'That file has no settings in it, so it isn’t a complete backup. Try the most recent backup you saved — nothing was changed.'
  }
}

/** Everything else the screen says, so the whole voice of this feature is readable in one place. */
export const BACKUP_COPY = {
  exportSuccess: (fileName: string) => `Saved ${fileName} — keep it somewhere you’ll find it.`,
  exportFailed: 'Couldn’t save the file. Check your browser’s download settings and try again.',
  /** The pre-import save, from inside the dialog. Says what it is for, not just that it worked. */
  preImportSaved: 'Saved. That file is your way back.',
  importSuccess: 'All set — everything from that file is on this device now.',
  importFailed:
    'Something went wrong while loading that file. Nothing was changed — your data is exactly as it was.',
  unreadable:
    'That file couldn’t be read. If it’s saved in iCloud Drive, open it once to download it, then try again — nothing was changed.',
} as const
