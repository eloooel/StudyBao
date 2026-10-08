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
 * Which kind of block a timer session was.
 *
 * Deliberately the same words as `TimerPhase` in `features/timer/lib/timer.ts` — `'working'`, not
 * `'work'`. Two vocabularies for one concept is how a filter silently matches nothing, and the
 * mismatch showed up immediately as a type error at the one place a phase becomes a row.
 */
export type SessionType = 'working' | 'break' | 'longBreak'

/**
 * One Pomodoro block, recorded from Workflow D.
 *
 * Why `updatedAt` **and** `deletedAt` are both here, unlike `ReviewLog`: this record is
 * written twice by design. A row is created the moment she presses Start — so a session
 * interrupted by a closed tab is still a row rather than nothing — and updated when it
 * actually ends. That makes it a **mutable** record, so it follows the normal rule:
 * `updatedAt` on every write, `deletedAt` for a tombstone rather than a hard delete.
 *
 * `endedAt` therefore means two things depending on `completed`: at creation it is
 * `startedAt + plannedMs`, the expected end, and it is corrected to the real end when the
 * block finishes. A row whose expected end has passed while `completed` is still false is a
 * block she abandoned — which is a fact worth keeping, not an error to clean up, and is
 * exactly what Workflow F's streak must not count as a completed session.
 */
export interface Session {
  id: string
  type: SessionType
  /** Epoch ms the block began. */
  startedAt: number
  /**
   * Epoch ms the block ended. Before completion this is the **planned** end
   * (`startedAt + plannedMs`), which is what lets an abandoned row be recognised.
   */
  endedAt: number
  /** The configured length when the block started. Stored, not derived: settings can change. */
  plannedMs: number
  /** The real elapsed time. Set at completion; until then it is the planned length. */
  actualMs: number
  /**
   * False until the block finishes properly. A row can sit false forever — the tab was
   * closed, the device slept, she walked away — and Workflow F counts only completed work.
   */
  completed: boolean
  /**
   * How many times the page went hidden during the block.
   *
   * Recorded because it is the only signal distinguishing "she focused for 25 minutes" from
   * "the tab was in the background for 25 minutes", and that difference is the point of a
   * focus timer. Cheap to record, impossible to reconstruct afterwards.
   */
  tabHiddenCount: number
  updatedAt: number
  deletedAt?: number
}

/**
 * The three states a lesson can be in (docs/BUILD_GUIDE.md §4 Workflow E).
 *
 * **Stored as these stable keys, never as the display labels.** That is the whole reason the
 * filter cannot silently match nothing: comparing a stored `'reviewing'` to a typed `'reviewing'`
 * is exact, whereas comparing labels breaks the day either side's wording or letter case drifts —
 * and a copy change ("Reviewing" → "In review") would then need a migration on a device with no
 * undo. Labels live in `features/tracker/lib/status.ts`; this union is what the database holds.
 */
export type LessonStatus = 'not-started' | 'reviewing' | 'mastered'

/**
 * One topic from her study plan — the app's first representation of *what she is supposed to be
 * studying next*. Added by Workflow E as Dexie version 3.
 *
 * `deadline` is **optional**, amended in docs/BUILD_GUIDE.md §6 on 2026-10-07. A required date
 * forces her to invent one for every topic she has not planned yet, and an invented deadline is a
 * *wrong* number: it sorts into "overdue" and shows for a date she never meant. Undated lessons
 * gather in an explicit "No date yet" section instead. When it is present it is the **04:00
 * study-day start** of the day she means, exactly like `examDate`, so a lesson due "today" cannot
 * flip to overdue at midnight while she is still studying.
 *
 * `subject` is the stable `PrcPart` key, exactly as on `Deck`, so the tracker, the dashboard and
 * her own mental model line up. Its label resolves from `PRC_PARTS` in `src/db/seed-data.ts` and
 * **never** from the `decks` table: decks are soft-deletable, so resolving through them would make
 * a lesson's subject unreadable because of an unrelated action on another screen, with no way for
 * her to fix it.
 */
export interface Lesson {
  id: string
  /** The PRC part this topic belongs to. Ordering across the app comes from `prcPartOrder`. */
  subject: PrcPart
  /** What she is studying, in her words. */
  topic: string
  /** Epoch ms at the 04:00 study-day start of the day she means, or absent for "no date yet". */
  deadline?: number
  status: LessonStatus
  /** Anything she wants to remember about this one. Absent means none, never an empty string. */
  notes?: string
  updatedAt: number
  deletedAt?: number
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
  /**
   * Timer lengths in minutes, added by Workflow D.
   *
   * Optional, so a settings row written by Workflow B reads back unchanged. An absent field
   * means "use the default", never "zero minutes" — `sanitizeDurations` in
   * `features/timer/lib/timer.ts` is what guards the value at every entry point, including a
   * stale or hand-edited row.
   */
  workMin?: number
  breakMin?: number
  longBreakMin?: number
  /** Work blocks before a long break instead of a short one. */
  cyclesBeforeLongBreak?: number
  updatedAt: number
}
