import type { LeftoverQueueEntry, ReviewCard } from '../types'

/**
 * The ingest draft, persisted so a reload does not cost her the batch.
 *
 * ## Why this exists
 *
 * Ingest is expensive to repeat: a 30-second OCR pass, then minutes of curation as she
 * accepts some cards, edits others, and converts leftover lines by hand. On an iPad a hard
 * refresh mid-session is realistic — a tab restore, an accidental swipe, ITP. Anything she
 * has already **accepted is already durable** in `cards`, so the exposure is the unreviewed
 * remainder plus her position in the batch. That is worth protecting and it is not worth a
 * schema change, so it does not get a Dexie table.
 *
 * ## Mechanism, and what it does not survive
 *
 * `sessionStorage`, one versioned key. Chosen over `localStorage` deliberately: it is
 * per-tab, so it cannot collide with the separate Home Screen container, and one tab's
 * abandoned batch cannot ambush the next launch.
 *
 * It does **not** survive any of these, and the review screen says so rather than implying
 * otherwise:
 *
 * - a browser or Home Screen app restart (session storage ends with the tab);
 * - iOS private browsing;
 * - an ITP storage eviction, which takes script-writable storage including this;
 * - opening the batch in a different tab.
 *
 * ## The ceiling
 *
 * The size is measured and checked **before** writing. Above the ceiling nothing is written
 * at all — never a truncated draft, because a half-restored batch is worse than a stated
 * limit: she would see some of her cards and no indication the rest existed. See
 * `DRAFT_SIZE_CEILING_BYTES`, which both the check and the message read, so the limit
 * cannot drift from what the message promises.
 */

/** The one key this feature owns. Versioned, so a shape change cannot be misread as data. */
export const DRAFT_STORAGE_KEY = 'studybao.ingest.draft.v1'

/**
 * The ceiling, as a single source of truth.
 *
 * 1 MiB is roughly 50× a 300-line paste and 10× a 40-page PDF's extracted text, so it is
 * not a limit she should ever meet by working normally. It exists so that a pathological
 * input hits a stated boundary instead of a `QuotaExceededError` mid-write, which would
 * leave an unknown amount of the draft stored.
 */
export const DRAFT_SIZE_CEILING_BYTES = 1024 * 1024

/** Why a draft was not persisted. Surfaced so the screen can explain itself honestly. */
export type PersistOutcome =
  | { persisted: true; bytes: number }
  | { persisted: false; reason: 'too-large'; bytes: number; ceiling: number }
  | { persisted: false; reason: 'unavailable' }

export interface IngestDraft {
  /** The version marker, checked on read so an old shape is discarded rather than misread. */
  version: 1
  /** The deck the accepted cards are written to. */
  deckId: string
  /** What the text came from — "Pasted text", a PDF filename, a photo. Shown in the header. */
  sourceLabel: string
  /** The normalized text, so the review screen can show the same text the parser saw. */
  sourceText: string
  /** Proposed cards and her decisions about them. */
  cards: ReviewCard[]
  /** What the parser could not turn into a card. */
  leftover: LeftoverQueueEntry[]
  /** Ids (see `entryId`) of leftover entries she has already converted into cards. */
  convertedLeftoverIds: string[]
  /** Epoch ms, for the "started at" line and for refusing a draft older than the tab. */
  startedAt: number
}

/**
 * The storage this module talks to, or `undefined` when there is none.
 *
 * Reached through `globalThis` rather than `window` so a test can hand it a double, and
 * wrapped in a try because Safari in private mode has historically thrown on *access* to
 * `sessionStorage`, not merely on write. Reading it lazily is what keeps that from becoming
 * an import-time crash.
 */
function storage(): Storage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

/**
 * Persist a draft, or refuse to.
 *
 * Measures first, writes second. Returns the outcome rather than throwing, because the
 * caller's job is to tell her what happened, and a thrown quota error would be swallowed
 * into a silent no-op — a batch that appears saved and is not.
 */
export function saveDraft(draft: IngestDraft): PersistOutcome {
  const store = storage()
  if (store === undefined) return { persisted: false, reason: 'unavailable' }

  let serialized: string
  try {
    serialized = JSON.stringify(draft)
  } catch {
    // A cyclic value cannot come from the parser, but a future field could introduce one,
    // and a throw here would look like a crash rather than a refused save.
    return { persisted: false, reason: 'unavailable' }
  }

  const bytes = byteLength(serialized)
  if (bytes > DRAFT_SIZE_CEILING_BYTES) {
    return {
      persisted: false,
      reason: 'too-large',
      bytes,
      ceiling: DRAFT_SIZE_CEILING_BYTES,
    }
  }

  try {
    store.setItem(DRAFT_STORAGE_KEY, serialized)
    return { persisted: true, bytes }
  } catch {
    // Quota or a disabled store. Explicit, so the screen can say the batch will not survive
    // a reload instead of silently keeping the previous draft.
    return { persisted: false, reason: 'unavailable' }
  }
}

/**
 * Read the draft, or `undefined` when there is none or it cannot be trusted.
 *
 * Every failure returns `undefined` rather than a partially-populated draft: a draft is
 * only useful if its provenance is intact, and an unreadable one would put the review
 * screen in a state where it cannot account for every line — the one thing this feature
 * refuses to do quietly.
 */
export function loadDraft(): IngestDraft | undefined {
  const store = storage()
  if (store === undefined) return undefined

  let raw: string | null
  try {
    raw = store.getItem(DRAFT_STORAGE_KEY)
  } catch {
    return undefined
  }
  if (raw === null) return undefined

  try {
    const parsed: unknown = JSON.parse(raw)
    return isIngestDraft(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function clearDraft(): void {
  const store = storage()
  if (store !== undefined) {
    try {
      store.removeItem(DRAFT_STORAGE_KEY)
    } catch {
      // Nothing useful to do: the draft is unreachable either way, and the batch in memory is
      // still usable.
    }
  }
  unpersistedBatch = undefined
}

/**
 * The batch that could not be persisted, held in memory for the tab's lifetime.
 *
 * A batch above the ceiling is refused storage **whole** rather than truncated, which leaves
 * the review screen with nothing to restore from. Without this, the only honest options would
 * be to lose the batch on navigation or to re-refuse it at the review route — and losing the
 * batch is the outcome the ceiling exists to make visible, not to cause.
 *
 * It is deliberately module state and not React state: the two routes are separate pages, and
 * a module variable is the smallest thing that both can see. It dies with the tab, which is
 * exactly its limit, and the review screen says so in words when it is in play.
 */
let unpersistedBatch: IngestDraft | undefined

export function keepUnpersistedBatch(draft: IngestDraft | undefined): void {
  unpersistedBatch = draft
}

export function getUnpersistedBatch(): IngestDraft | undefined {
  return unpersistedBatch
}

/**
 * The draft's size in bytes as the browser counts it.
 *
 * UTF-16 code units, which is what a `Storage` quota is measured in on every browser this
 * app targets. `TextEncoder` would report UTF-8 bytes and under-count a string full of
 * non-ASCII — OCR output regularly contains en dashes and typographic quotes, so the
 * difference is not hypothetical.
 */
function byteLength(serialized: string): number {
  return serialized.length * 2
}

/**
 * Whether a parsed value is a draft this build understands.
 *
 * A structural check, not a schema library: the shape is small, it only ever comes from
 * this app, and the version field is what makes a future shape change safe. Anything
 * unrecognised is discarded, which is the correct default — a misread draft would restore
 * cards that do not match the source text she is looking at.
 */
function isIngestDraft(value: unknown): value is IngestDraft {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>

  return (
    candidate['version'] === 1 &&
    typeof candidate['deckId'] === 'string' &&
    typeof candidate['sourceLabel'] === 'string' &&
    typeof candidate['sourceText'] === 'string' &&
    Array.isArray(candidate['cards']) &&
    Array.isArray(candidate['leftover']) &&
    Array.isArray(candidate['convertedLeftoverIds']) &&
    typeof candidate['startedAt'] === 'number'
  )
}
