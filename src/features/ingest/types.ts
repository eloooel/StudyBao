/**
 * Every type the ingest feature uses, including component prop types.
 *
 * The shape that matters is provenance. `NormalizedLine.index` is an index into the
 * normalized input; `ParsedCard.sourceLines` and `ParsedLeftover.sourceLines` are the
 * indices a given output was assembled from. Together they are what makes the feature's
 * one hard invariant assertable: **every normalized line belongs to exactly one card's
 * span or to the leftover queue — never two, never none.** See docs/ai/write-tests.md
 * cases 6 and 7, and `assertProvenance` in lib/parse.ts, which enforces it at runtime.
 *
 * Lines are an artifact of OCR and PDF extraction, not a unit of meaning, so a card may
 * own several of them. That is why the invariant counts coverage, not line totals.
 */
import type { Deck } from '@/db/types'

/** One non-empty, whitespace-collapsed input line, carrying its index in the input. */
export interface NormalizedLine {
  index: number
  text: string
}

/**
 * A card the parser believes it found.
 *
 * "Proposed" is a UI state, not a parser state — this is only ever a candidate until she
 * accepts it in the review screen. Nothing here reaches the database on its own.
 */
export interface ParsedCard {
  front: string
  back: string
  /** Indices into the normalized input. Always at least one, never shared with another card. */
  sourceLines: number[]
}

/**
 * Text that did not become a card, kept verbatim rather than dropped.
 *
 * A parse that silently discards an awkward line loses a card she will never notice is
 * missing, which is the failure mode this whole feature is built around. So there is no
 * "ignored" bucket — anything not proposed as a card lands here.
 */
export interface ParsedLeftover {
  text: string
  sourceLines: number[]
}

export interface ParseResult {
  cards: ParsedCard[]
  /**
   * Typed with the reason rather than as a bare `ParsedLeftover`, because the review screen
   * exists to explain what failed to parse. "No separator found" and "this answer lost its
   * question" look identical in the text and call for different edits from her.
   */
  leftover: LeftoverQueueEntry[]
}

/**
 * Why a line did not become a card. Surfaced in the review screen so the leftover queue
 * can explain itself instead of looking like a parser failure.
 *
 * - `prose` — contains something separator-shaped, but the left side is not a term.
 * - `no-separator` — nothing separator-shaped at all.
 * - `unpaired-question` — a `Q1.` with no answer under it.
 * - `unpaired-answer` — an `A1.` with no question above it.
 */
export type LeftoverReason = 'prose' | 'no-separator' | 'unpaired-question' | 'unpaired-answer'

export interface LeftoverQueueEntry extends ParsedLeftover {
  /** Why this line did not become a card. */
  reason: LeftoverReason
}

/**
 * What the review screen is currently showing for one proposed card.
 *
 * This lives in the persisted draft because it is exactly the state a reload must not
 * lose: which cards have not been decided yet. `accepted` is durable in the database by
 * the time it is set; see hooks/use-ingest-actions.ts.
 */
export interface ReviewCard {
  id: string
  front: string
  back: string
  origin: 'parsed' | 'manual'
  status: 'pending' | 'accepted' | 'discarded'
  /** Indices into the normalized input — the card's provenance, carried for the UI. */
  sourceLines: number[]
}

/** The tab she is on. Held in the URL so a refresh returns to the same path. */
export type IngestTab = 'paste' | 'pdf' | 'photo'

/** Whether a tab can be used yet. A tab that is not built says why rather than hiding. */
export interface IngestTabStatus {
  id: IngestTab
  label: string
  enabled: boolean
  /** Shown under the tab when it is not enabled. */
  note?: string
}

export interface IngestViewProps {
  tab: IngestTab
  tabs: readonly IngestTabStatus[]
  onSelectTab: (tab: IngestTab) => void
  decks: readonly Deck[]
  deckId: string
  onSelectDeck: (deckId: string) => void
  text: string
  onChangeText: (text: string) => void
  onSubmit: () => void
  /** How many visible lines the parser will see, so she can sanity-check a paste. */
  lineCount: number
  /** Set when the draft could not be kept across a reload. */
  persistenceNote?: string
  error?: string
}

export interface CardDraftFields {
  front: string
  back: string
}

export interface IngestReviewViewProps {
  deckName: string
  sourceLabel: string
  cards: readonly ReviewCard[]
  leftover: readonly LeftoverQueueEntry[]
  convertedLeftoverIds: readonly string[]
  progress: BatchProgressView
  saving: boolean
  onAccept: (cardId: string) => void
  onAcceptAll: () => void
  onDiscard: (cardId: string) => void
  onEdit: (card: ReviewCard) => void
  onConvertLeftover: (entry: LeftoverQueueEntry) => void
  onDiscardLeftover: (entry: LeftoverQueueEntry) => void
  onFinish: () => void
  onBack: () => void
  error?: string
}

/** The counters the review header shows. Mirrors `BatchProgress` without the `done` flag. */
export interface BatchProgressView {
  pending: number
  accepted: number
  discarded: number
  leftoverRemaining: number
}
