import type { NormalizedLine } from '../types'

/**
 * Normalization: turn raw pasted, extracted or OCR'd text into indexed, clean lines.
 *
 * This runs **before** any parse rule, deliberately. `docs/BUILD_GUIDE.md` §3 lists
 * "strip OCR noise characters and collapse whitespace" as its own precondition to
 * parsing, because a rule that has to defend itself against stray pipes and unicode
 * spaces is a rule that gets it wrong in one branch and right in another.
 *
 * What it does **not** do is reflow. Lines survive as lines here, carrying their index,
 * because the index is the unit the provenance invariant in lib/parse.ts counts. Joining
 * is a parse decision (test case 7), not a normalization one, so it can be tested and
 * reasoned about on its own.
 */

/**
 * Characters that are near-certainly OCR debris or invisibles in this context.
 *
 * Deliberately a small, explicit allowlist-shaped denylist rather than a Unicode category
 * sweep: `\p{So}` would also delete the bullet and the en dash, which the card patterns
 * depend on, and it would take the emoji the voice guide actually uses. `\p{C}` (control
 * and format characters) is the one category rule that is safe for pasted text — a
 * zero-width space at the start of a line is exactly the kind of thing that makes a
 * pattern silently not match.
 *
 * Note what is *kept*: `°`, `×`, `±`, `µ`, `§` and `→` all appear in real nursing notes,
 * and the ASCII punctuation the rules key on (`. , : ; ( ) [ ] / ? ! ' " -`) is untouched.
 */
const OCR_NOISE = /[|~^`_¦‗¨´‵″‶]/g
const CONTROL_CHARS = /\p{C}/gu

/** Any run of whitespace, including the non-breaking and typographic kinds OCR emits. */
const WHITESPACE_RUN = /[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g

/**
 * Strip noise and collapse whitespace — one line's worth.
 *
 * Also folds the math minus sign to an ASCII hyphen: it arrives from PDF extraction and
 * would otherwise quietly stop `Term − Definition` from matching the dash rule. Same for
 * the figure dash. It does **not** touch the en dash, which is the one that legitimately
 * separates a term from its definition.
 */
function cleanLine(text: string): string {
  return text
    .replace(CONTROL_CHARS, '')
    .replace(OCR_NOISE, '')
    .replace(/[\u2212\u2012]/g, '-')
    .replace(WHITESPACE_RUN, ' ')
    .trim()
}

/**
 * Split raw text into indexed, non-empty, cleaned lines.
 *
 * The returned `index` is the line's position in the **normalized** output, not in the
 * raw input, because blank and whitespace-only lines are dropped here. That is the
 * definition the invariant uses, and it is why a card's `sourceLines` can be read as
 * "the 3rd and 4th things she can see in the text box".
 *
 * CRLF, CR and LF are all accepted: pasted text from Windows carries CRLF, and a lone CR
 * would otherwise leave an invisible trailing character on every line.
 */
export function normalize(text: string): NormalizedLine[] {
  const lines: NormalizedLine[] = []

  for (const raw of text.split(/\r\n|\r|\n/)) {
    const cleaned = cleanLine(raw)
    if (cleaned.length === 0) continue
    lines.push({ index: lines.length, text: cleaned })
  }

  return lines
}

/**
 * Normalize for display back to her — the whole text, one line per line.
 *
 * The review screen shows the source next to the proposed cards, and it must show the
 * same text the parser actually saw, not the raw paste. Showing the raw text would make a
 * correct parse look wrong.
 */
export function normalizeToText(text: string): string {
  return normalize(text)
    .map((line) => line.text)
    .join('\n')
}
