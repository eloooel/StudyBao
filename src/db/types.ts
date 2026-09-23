/**
 * The data model. Source of truth for what is in IndexedDB.
 *
 * Rules that apply to every type here (CLAUDE.md, docs/ai/change-data-model.md):
 *
 * - **Every timestamp is epoch milliseconds (`number`).** No `Date` objects, no date
 *   strings. Format for display at the edge only.
 * - **Mutable synced records carry `updatedAt` and `deletedAt?`.** A record without
 *   them cannot be merged across two devices without losing either an edit or a
 *   deletion. `ReviewLog` is the named exception: it is append-only, so it has
 *   neither — see the doc comment on it.
 * - **Never hard-delete a synced record.** Set `deletedAt`; reads filter it out.
 *
 * See docs/BUILD_GUIDE.md §6 and docs/adr/0001-local-first-with-indexeddb.md.
 */

/** The five PRC Nursing Practice parts, as stable keys. */
export type PrcPart = 'practice-i' | 'practice-ii' | 'practice-iii' | 'practice-iv' | 'practice-v'

/**
 * A deck. One per Nursing Practice part (decision #7).
 *
 * `subject` is the stable key (`PrcPart`) and `name` is the display title, so a
 * renamed deck does not break a query that was written against the part it belongs to.
 */
export interface Deck {
  id: string
  /** The PRC part this deck mirrors. Ordering across the app comes from this. */
  subject: PrcPart
  /** Display name, e.g. "Nursing Practice I". */
  name: string
  /** The official scope text, verbatim from the PRC program. Shown as the deck's subtitle. */
  scope: string
  updatedAt: number
  deletedAt?: number
}

/**
 * The four grades. The numeric values are the SM-2 quality values and are stored in
 * the database, so they must never be renumbered.
 */
export type Grade = 0 | 3 | 4 | 5

export const GRADE_AGAIN: Grade = 0
export const GRADE_HARD: Grade = 3
export const GRADE_GOOD: Grade = 4
export const GRADE_EASY: Grade = 5

/**
 * A card, carrying its own SM-2 state.
 *
 * `createdAt` exists for one specific reason: cram mode orders never-reviewed cards
 * first (they are the unknown unknowns), and it measures their staleness from when
 * they were created. Without it that ordering has no honest input.
 */
export interface Card {
  id: string
  deckId: string
  front: string
  back: string
  /** Integrated knowledge areas (pharmacology, pathophysiology, …) — tags, never decks. */
  tags: string[]

  // ── SM-2 state ────────────────────────────────────────────────────────────
  /** Ease factor. Default 2.5, floor 1.3. Read `EASE_FACTOR_FLOOR` in sm2.ts. */
  easeFactor: number
  /** Whole-day interval. 0 means "not on a day-scale interval yet". */
  intervalDays: number
  /** Graduated reviews only — the sub-day learning steps do not increment it. */
  repetitions: number
  /** Count of `q < 3` reviews. Cannot be backfilled; never derive it. */
  lapses: number
  /** Index into `LEARNING_STEPS_MINUTES`, or `null` once graduated. */
  learningStep: number | null
  /** Epoch ms. Due when `nextReview <= Date.now()`. */
  nextReview: number
  lastReviewedAt?: number

  createdAt: number
  updatedAt: number
  deletedAt?: number
}

/**
 * One row per review, forever. Append-only: no `updatedAt`, no `deletedAt`.
 *
 * This is the one record type deliberately outside the `updatedAt` rule, because it is
 * never mutated after it is written. Two consequences:
 *
 * 1. **Workflow S must merge this table UNION-ONLY** — never overwrite, never delete.
 *    A last-write-wins merge on an append-only table is silent history loss.
 * 2. It cannot be reconstructed after the fact. `lapses` is an aggregate; this is the
 *    history the dashboard's weak-topic feature and any future move to FSRS need.
 */
export interface ReviewLog {
  id: string
  cardId: string
  deckId: string
  /** Epoch ms. */
  reviewedAt: number
  grade: Grade
  /**
   * Milliseconds from the card being shown to it being graded.
   * Measured with `performance.now()`, which is monotonic — a clock adjustment
   * mid-review cannot make it negative the way `Date.now()` differences can.
   */
  msSpent: number
}

/**
 * App settings. A single row, id `'app'`.
 *
 * `updatedAt` is here for the same reason it is on Card: this record will sync.
 */
export interface AppSettings {
  /** Always `'app'`. Indexed for the settings table's primary key. */
  id: string
  /**
   * The exam date, stored as epoch ms of **local midnight** on the day she sits it.
   * Drives cram mode and, later, the dashboard countdown and notification tone.
   */
  examDate?: number
  /** Days before the exam at which cram mode starts. Never hardcode 30 at a call site. */
  cramThresholdDays: number
  /**
   * When the five PRC decks were first seeded. Seeding is gated on this marker rather
   * than on "are there any decks", because a deck she deleted must stay deleted.
   */
  seededAt?: number
  /** Decision D12: sync is on by default. Unused until Workflow S lands. */
  cloudSync: boolean
  updatedAt: number
}
