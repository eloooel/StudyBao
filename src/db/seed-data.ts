import type { PrcPart } from './types'

export interface PrcPartSeed {
  part: PrcPart
  /** Display name — the part number only, as the PRC program writes it. */
  name: string
  /** The official scope, verbatim. Do not paraphrase or abbreviate. */
  scope: string
}

/**
 * The five decks, seeded verbatim from the official PRC program.
 *
 * Source: docs/reference/pnle-scope.md, transcribed from _Program of the Nurses
 * Licensure Examination on Feb. 26-27, 2026_ (PRC / PRB of Nursing, approved
 * 2025-12-01). PRC reuses the document template between sittings and the five-part
 * structure has been stable, but **re-verify around December 2026** — the checklist is
 * in that reference file. Do not reword these strings to make them read better: the app
 * mirrors the document she will sit, and a paraphrase is a taxonomy she cannot check.
 *
 * The integrated knowledge areas (Anatomy and Physiology, Nutrition and Diet Therapy,
 * Pathophysiology, Parasitology and Microbiology, Pharmacology and Therapeutics) are
 * deliberately **not** decks — they are tags on cards, so they can cut across all five
 * parts without duplicating a card into two decks.
 */
export const PRC_PARTS: readonly PrcPartSeed[] = [
  {
    part: 'practice-i',
    name: 'Nursing Practice I',
    scope:
      'Care of Individuals, Families, Population Groups and Community (Community Health Nursing)',
  },
  {
    part: 'practice-ii',
    name: 'Nursing Practice II',
    scope:
      'Part 1: Care of Mother, Adolescent (Well Clients), At Risk or With Problems (Acute & Chronic); Part 2: Human Growth and Development',
  },
  {
    part: 'practice-iii',
    name: 'Nursing Practice III',
    scope:
      'Care of Clients with Problems in Surgery, Oxygenation, Fluid and Electrolytes, Infectious, Inflammatory and Immunologic Response, Cellular Aberrations (Acute and Chronic)',
  },
  {
    part: 'practice-iv',
    name: 'Nursing Practice IV',
    scope:
      'Care of Client with Problems in Nutrition, and Gastro-Intestinal, Metabolism and Endocrine. Perception and Coordination (Acute and Chronic)',
  },
  {
    part: 'practice-v',
    name: 'Nursing Practice V',
    scope:
      'Care of Clients with Maladaptive Patterns of Behavior (Acute and Chronic); Care of Clients with Life-Threatening Condition, Acutely Ill/Multi-Organ Problems, High Acuity and Emergency Situation',
  },
]

/**
 * The integrated knowledge areas, verbatim. These are the tag vocabulary offered on the
 * card form. Stored on cards as free text rather than a foreign key, so a tag she adds
 * herself is never rejected.
 */
export const INTEGRATED_KNOWLEDGE_AREAS: readonly string[] = [
  'Anatomy and Physiology',
  'Nutrition and Diet Therapy',
  'Pathophysiology',
  'Parasitology and Microbiology',
  'Pharmacology and Therapeutics',
]

/** Stable deck id for a PRC part. Derived, so it is identical on both her devices. */
export function deckIdForPart(part: PrcPart): string {
  return `deck-${part}`
}

const PART_ORDER: readonly PrcPart[] = PRC_PARTS.map((entry) => entry.part)

/** Sort index for a PRC part, so every list in the app is in official exam order. */
export function prcPartOrder(part: PrcPart): number {
  return PART_ORDER.indexOf(part)
}

const PART_NAMES = new Map(PRC_PARTS.map((entry) => [entry.part, entry.name]))

/**
 * Display label for a PRC part, for anything that stores the key rather than the name — the
 * lesson tracker's `subject`, which is a `PrcPart` exactly as `Deck.subject` is.
 *
 * **This is deliberately not resolved through the `decks` table.** A deck is soft-deletable, so a
 * lesson whose subject label came from a deleted deck would be unreadable because of an unrelated
 * action on another screen, with nothing she could do about it. `PRC_PARTS` holds the key and the
 * name together, and it cannot be deleted.
 *
 * Falls back to the key itself. That is unreachable through the typed API — it exists because a
 * stored row could always have come from somewhere else: a hand-edited database, or a later
 * version's sixth part arriving through sync.
 */
export function prcPartName(part: PrcPart): string {
  return PART_NAMES.get(part) ?? part
}
