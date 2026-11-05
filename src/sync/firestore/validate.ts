import type { Grade, LessonStatus, PrcPart, SessionType } from '@/db/types'

import type { SyncedTable } from '../lib/merge'

/**
 * A pulled row is **untrusted input**, and this is where that is taken literally.
 *
 * `pull` reads documents that the other device wrote, or a future version wrote, or that were hand-edited
 * in the Firebase console. A row missing `updatedAt` that reaches a repository is not a cosmetic defect:
 * `mergeByUpdatedAt` would compare `undefined > number` (false), keep the local copy, and then push the
 * local copy back — so the bad row would be silently discarded *or* a valid local change would be lost,
 * depending on direction. The worst version of it writes a record whose `nextReview` is not a number, and
 * the card never comes due again.
 *
 * So every row is checked against the database types **before** it can reach a repository, and a rejected
 * row is reported rather than written. The alternative — trusting the remote because "only she can write
 * it" — is the same assumption that makes owner-only rules sufficient for authorisation and insufficient
 * for data integrity. The rules decide *who* may write; this decides *what* is a record.
 *
 * ## What is checked, and the one thing that is not rebuilt
 *
 * Every field the data model requires is checked, including the optional ones' types when present, so a
 * `deletedAt: null` cannot slip through and be read as a tombstone. A rejected row carries a reason that
 * is for a developer, not for her.
 *
 * The **whole object is kept**, unknown keys included, rather than being rebuilt field by field. Rebuilding
 * would drop a field added by a newer build on the other device, and a later merge could then push the
 * stripped version back over the good one. Passing the original through means an unknown field survives a
 * round-trip; the checks above still guarantee the fields this build reads are sound.
 */

export type RemoteValidation =
  { ok: true; row: Record<string, unknown> } | { ok: false; reason: string }

/*
 * The vocabularies, as `Record<Union, true>` rather than arrays.
 *
 * A `readonly string[]` would compile when someone adds `'practice-vi'` to `PrcPart` and forgets this
 * file; a `Record<PrcPart, true>` fails to compile until the new key is added. That is the same guard
 * `BACKUP_TABLES` gets from its schema test, applied where a compile error can carry it.
 */
const PRC_PARTS: Record<PrcPart, true> = {
  'practice-i': true,
  'practice-ii': true,
  'practice-iii': true,
  'practice-iv': true,
  'practice-v': true,
}

const SESSION_TYPES: Record<SessionType, true> = {
  working: true,
  break: true,
  longBreak: true,
}

const LESSON_STATUSES: Record<LessonStatus, true> = {
  'not-started': true,
  reviewing: true,
  mastered: true,
}

const GRADES: Record<Grade, true> = { 0: true, 3: true, 4: true, 5: true }

/** The settings singleton's id, duplicated from `SETTINGS_ID` so this module stays out of the Dexie module. */
const SETTINGS_ROW_ID = 'app'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Epoch ms is always a finite number. `NaN` and `Infinity` would poison every later comparison. */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || isNumber(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

/** A string from a fixed vocabulary. The `typeof` check is what stops `'4'` matching the key `4`. */
function isOneOf<K extends string>(record: Record<K, true>, value: unknown): value is K {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(record, value)
}

/** The four SM-2 grades, as numbers. A `'4'` from a hand-edited document must not pass. */
function isGrade(value: unknown): value is Grade {
  return typeof value === 'number' && Object.prototype.hasOwnProperty.call(GRADES, value)
}

/**
 * Fields shared by every mutable record. `ReviewLog` is the stated exception: append-only, so it has
 * neither `updatedAt` nor `deletedAt` (`docs/BUILD_GUIDE.md` §6, and `ReviewLog`'s own doc comment).
 */
function isMutableRecord(row: Record<string, unknown>): string | null {
  if (!isNumber(row.updatedAt)) return 'updatedAt must be a finite number'
  if (!isOptionalNumber(row.deletedAt)) return 'deletedAt must be a finite number when present'
  return null
}

type FieldCheck = (row: Record<string, unknown>) => string | null

const CHECKS: Record<SyncedTable, FieldCheck> = {
  decks: (row) => {
    if (!isOneOf(PRC_PARTS, row.subject)) return 'subject is not a PRC part'
    if (!isString(row.name)) return 'name must be a string'
    if (!isString(row.scope)) return 'scope must be a string'
    return isMutableRecord(row)
  },

  cards: (row) => {
    if (!isString(row.deckId)) return 'deckId must be a string'
    if (!isString(row.front)) return 'front must be a string'
    if (!isString(row.back)) return 'back must be a string'
    if (!isStringArray(row.tags)) return 'tags must be an array of strings'
    if (!isNumber(row.easeFactor)) return 'easeFactor must be a finite number'
    if (!isNumber(row.intervalDays)) return 'intervalDays must be a finite number'
    if (!isNumber(row.repetitions)) return 'repetitions must be a finite number'
    if (!isNumber(row.lapses)) return 'lapses must be a finite number'
    // `learningStep` is a number or `null` once graduated — never absent.
    if (row.learningStep !== null && !isNumber(row.learningStep)) {
      return 'learningStep must be a finite number or null'
    }
    if (!isNumber(row.nextReview)) return 'nextReview must be a finite number'
    if (!isOptionalNumber(row.lastReviewedAt)) {
      return 'lastReviewedAt must be a finite number when present'
    }
    if (!isNumber(row.createdAt)) return 'createdAt must be a finite number'
    return isMutableRecord(row)
  },

  reviewLogs: (row) => {
    // Append-only, so the two mutable-record fields are deliberately not required here.
    if (!isString(row.cardId)) return 'cardId must be a string'
    if (!isString(row.deckId)) return 'deckId must be a string'
    if (!isNumber(row.reviewedAt)) return 'reviewedAt must be a finite number'
    if (!isGrade(row.grade)) return 'grade must be 0, 3, 4 or 5'
    if (!isNumber(row.msSpent)) return 'msSpent must be a finite number'
    return null
  },

  settings: (row) => {
    if (row.id !== SETTINGS_ROW_ID) return `settings id must be '${SETTINGS_ROW_ID}'`
    if (!isNumber(row.cramThresholdDays)) return 'cramThresholdDays must be a finite number'
    if (typeof row.cloudSync !== 'boolean') return 'cloudSync must be a boolean'
    if (!isOptionalNumber(row.examDate)) return 'examDate must be a finite number when present'
    if (!isOptionalNumber(row.seededAt)) return 'seededAt must be a finite number when present'
    if (!isOptionalNumber(row.installPromptSeenAt)) {
      return 'installPromptSeenAt must be a finite number when present'
    }
    if (!isOptionalNumber(row.workMin)) return 'workMin must be a finite number when present'
    if (!isOptionalNumber(row.breakMin)) return 'breakMin must be a finite number when present'
    if (!isOptionalNumber(row.longBreakMin)) {
      return 'longBreakMin must be a finite number when present'
    }
    if (!isOptionalNumber(row.cyclesBeforeLongBreak)) {
      return 'cyclesBeforeLongBreak must be a finite number when present'
    }
    return isMutableRecord(row)
  },

  sessions: (row) => {
    if (!isOneOf(SESSION_TYPES, row.type)) return 'type is not a session type'
    if (!isNumber(row.startedAt)) return 'startedAt must be a finite number'
    if (!isNumber(row.endedAt)) return 'endedAt must be a finite number'
    if (!isNumber(row.plannedMs)) return 'plannedMs must be a finite number'
    if (!isNumber(row.actualMs)) return 'actualMs must be a finite number'
    if (typeof row.completed !== 'boolean') return 'completed must be a boolean'
    if (!isNumber(row.tabHiddenCount)) return 'tabHiddenCount must be a finite number'
    return isMutableRecord(row)
  },

  lessons: (row) => {
    if (!isOneOf(PRC_PARTS, row.subject)) return 'subject is not a PRC part'
    if (!isString(row.topic)) return 'topic must be a string'
    if (!isOptionalNumber(row.deadline)) return 'deadline must be a finite number when present'
    if (!isOneOf(LESSON_STATUSES, row.status)) return 'status is not a lesson status'
    if (!isOptionalString(row.notes)) return 'notes must be a string when present'
    return isMutableRecord(row)
  },
}

/**
 * Check one document from the remote, or say why it cannot be a record.
 *
 * `id` is required for every table and is checked here as well as against the document path in `pull`,
 * because a record whose body id and path id disagree would be written under a third identity.
 */
export function validateRemoteRow(table: SyncedTable, value: unknown): RemoteValidation {
  if (!isObject(value)) return { ok: false, reason: 'row is not an object' }

  if (!isString(value.id) || value.id === '') return { ok: false, reason: 'id must be a string' }

  const reason = CHECKS[table](value)
  if (reason !== null) return { ok: false, reason }

  return { ok: true, row: value }
}
