import type { Card, Deck, Grade } from '@/db/types'

/**
 * Every type this feature uses, including component prop types.
 *
 * All user-facing strings are `string` here, not a literal union: the app is for one person
 * with one language, and a translation layer would be speculative generality.
 */

/** A deck row on the deck list, with the numbers the row displays. */
export interface DeckSummary {
  deck: Deck
  totalCards: number
  dueCards: number
  masteredCards: number
}

export interface DeckListViewProps {
  decks: DeckSummary[]
  loading: boolean
  /** Live count of cards due right now, across every deck. */
  totalDue: number
  onOpenDeck: (deckId: string) => void
  onStartReview: () => void
  /** Opens the ingest screen — the input path for the whole product. */
  onAddFromNotes: () => void
}

export interface DeckDetailViewProps {
  deck: Deck
  cards: Card[]
  loading: boolean
  dueCount: number
  onBack: () => void
  onStartReview: (deckId: string) => void
  onAddCard: () => void
  onEditCard: (card: Card) => void
  onDeleteCard: (card: Card) => void
}

/** Which card the form is editing, or `null` when it is closed. */
export type CardFormTarget = { mode: 'create' } | { mode: 'edit'; card: Card } | null

export interface CardFormViewProps {
  open: boolean
  target: CardFormTarget
  /** Shown above the fields when editing. */
  progressSummary?: string
  tagSuggestions: readonly string[]
  onSubmit: (values: { front: string; back: string; tags: string[] }) => void
  onClose: () => void
  onResetProgress?: () => void
}

export interface CardFormValues {
  front: string
  back: string
  tags: string[]
}

export interface ReviewCardViewProps {
  /** The card currently on screen. `null` renders the finished state. */
  card: Card | null
  revealed: boolean
  /** How many cards were in the queue when the session started. */
  startCount: number
  /** How many have been graded this session. */
  gradedCount: number
  /** Cards still waiting, excluding the one on screen. */
  remaining: number
  /**
   * Cards already graded that are scheduled to come back inside this session — a learning step
   * doing its job. While this is non-zero the session is **not** finished, and saying it is would
   * give her the wrong answer about a card she is about to see again in a minute.
   */
  waitingToReturn: number
  /** True only when everything has been served and nothing is coming back. */
  finished: boolean
  deckName: string
  /** Called the instant the answer is revealed, so thinking time can be measured. */
  onReveal: () => void
  onGrade: (grade: Grade) => void
  onEnd: () => void
}

export interface ReviewSessionSummaryViewProps {
  reviewed: number
  onDone: () => void
}

export interface CramStatus {
  active: boolean
  /** Days until the exam, when it is set. */
  daysUntilExam?: number
  thresholdDays: number
}

export interface ReviewPageChromeProps {
  deckName: string
  cram: CramStatus
  onToggleCram: () => void
}
