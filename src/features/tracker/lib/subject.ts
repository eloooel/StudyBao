import { PRC_PARTS, prcPartName } from '@/db/schema'
import type { PrcPart } from '@/db/types'

/**
 * The five PRC parts as the lesson form's subject options.
 *
 * Read from `PRC_PARTS` and **never** from the `decks` table. Decks are soft-deletable, so a label
 * resolved through them would leave a lesson's subject unreadable because she deleted an unrelated
 * deck — a display bug triggered by an action on another screen, with nothing she could do about
 * it. `PRC_PARTS` holds the key and the display name together and cannot be deleted.
 *
 * The keys and labels are the same ones the decks are seeded from, which is what makes the tracker,
 * the decks and her own mental model line up (docs/BUILD_GUIDE.md §6).
 */
export interface SubjectOption {
  part: PrcPart
  label: string
}

/** In official exam order, so the picker reads the way the PRC program does. */
export const SUBJECT_OPTIONS: readonly SubjectOption[] = PRC_PARTS.map(({ part, name }) => ({
  part,
  label: name,
}))

/**
 * What the form starts on before she touches the picker.
 *
 * Defaulting to *something* matters for the same reason the ingest deck picker defaults to the
 * first deck: an unset picker makes the form look broken when it is merely unset. It is the first
 * part in official exam order, and `subject.test.ts` asserts that this constant is still the first
 * entry of `SUBJECT_OPTIONS` so the two cannot drift apart.
 */
export const DEFAULT_SUBJECT: PrcPart = 'practice-i'

export function subjectLabel(part: PrcPart): string {
  return prcPartName(part)
}
