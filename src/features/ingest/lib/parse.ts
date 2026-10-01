import type {
  LeftoverQueueEntry,
  LeftoverReason,
  NormalizedLine,
  ParsedCard,
  ParseResult,
} from '../types'
import { normalize } from './normalize'

/**
 * The deterministic parser. Pure: no I/O, no clock, no DOM, no model call anywhere near it.
 *
 * ADR 0004 is the reason this file exists in this shape. Card generation is OCR plus
 * pattern matching, and the alternative — asking a model for question/answer pairs — was
 * rejected because a model that invents a plausible drug interaction produces a flashcard
 * she memorises, and a wrong flashcard is worse than a missing one on a licensure exam.
 *
 * ## The one hard rule
 *
 * **For any input, every normalized line belongs to exactly one card's `sourceLines` span
 * or to the leftover queue — never two, never none.** `assertProvenance` enforces it in
 * code, so a future rule that drops or double-claims a line throws here rather than
 * quietly returning a plausible array. That is the whole point: a dropped line is a card
 * she never reviews and has no way to notice is missing. See docs/ai/write-tests.md 6 and
 * 7, and docs/WORKFLOW-C-PROMPT.md.
 *
 * An earlier draft of the brief stated the invariant as a line count
 * (`cards.length + leftover.length === lines.length`), which was wrong twice over: it
 * forbade joining a wrapped line, and it passed if one line was dropped and another
 * counted twice. Provenance fixes both. The count is a *consequence* of coverage here,
 * never the check itself.
 *
 * ## Order of operations, which is load-bearing
 *
 * 1. Normalize (separate module).
 * 2. **Card-start patterns.** A line that matches one is never joined to the line above,
 *    even when it begins lowercase — see the lowercase-`term: definition` test.
 * 3. **Joining**, for lines that matched nothing: append to the previous entry when the
 *    line looks like a continuation.
 *
 * Running 3 before 2 is the bug this ordering exists to prevent: it would swallow every
 * lowercase-starting definition into the card above it.
 */

// ── Pattern definitions ────────────────────────────────────────────────────────────

/**
 * `Q1.` … an *explicit* question marker, marker split off from the rest.
 *
 * A bare leading number is deliberately **not** a question marker here. `"1. Vitamin C:
 * ascorbic acid"` is a numbered definition, and treating its `1.` as a question marker
 * swallowed the card — the fixture caught exactly that. A numbered line only becomes a
 * question when an `A`-marked line sits under it; see `findCardStart`.
 */
const QUESTION_PREFIX = String.raw`[Qq]\s*\d{1,3}\s*[.):\-–—]\s*`
/** The same for answers. `A1.` is only ever an answer marker, never a bare number. */
const ANSWER_PREFIX = String.raw`[Aa]\s*\d{1,3}\s*[.):\-–—]\s*`

const QUESTION_LINE = new RegExp(`^${QUESTION_PREFIX}(.+)$`)
const ANSWER_LINE = new RegExp(`^${ANSWER_PREFIX}(.+)$`)

/** `1. Term: definition`, `1) Term - definition`, `(2) Term: definition`. */
const NUMBERED_START = /^(?:\d{1,3}[.):]|\(\d{1,3}\))\s+/

/** `- Term: definition`, `• Term - definition`, `* Term: definition`. */
const BULLET_START = /^[-–—•*·+]\s+/

/**
 * A dash used as a separator: whitespace, one dash, whitespace.
 *
 * The whitespace is the entire point. `self-esteem` and `post-operative` have no spaces
 * around the hyphen, so they cannot match here and will not be split as
 * `Term - Definition`. That is test case 2, and it is a real bug in a naive
 * implementation that splits on `-`.
 */
const DASH_SEPARATOR = /\s+[-–—]\s+/

/**
 * Left-hand terms that mean the colon belongs to prose, sorted longest-first so an
 * alternation cannot stop at the shorter prefix.
 *
 * `"Note: she reported: pain"` is the case `docs/BUILD_GUIDE.md` §3 names, and the first
 * colon there looks exactly like a definition separator. The structural rules below
 * already reject most prose (`"His blood pressure was 160/90: elevated"` has a 33-character
 * fragment on the left, which is not a term), but the filler set is what catches the
 * genuinely ambiguous sentences, where both sides are short and noun-shaped.
 *
 * This is a heuristic and is declared as one. The honest failure mode is a *missed* card,
 * which lands in the leftover queue and is one edit away — never a lost line.
 */
const LEADING_FILLER = [
  'note that',
  'notes',
  'note',
  'nb',
  'remember',
  'caution',
  'warning',
  'important',
  'eg',
  'ie',
  'etc',
  'vs',
  'versus',
  'see also',
  'see',
  'cf',
  'hint',
  'tip',
  'tip:',
  'example',
  'examples',
  'because',
  'therefore',
  'however',
  'although',
  'while',
  'when',
  'if',
  'unless',
  'she said',
  'he said',
  'the patient said',
  'pt said',
  'said',
  'reported',
  'says',
  'saying',
].sort((a, b) => b.length - a.length)

/** Phrases whose presence on the left of a separator means it is prose, not a term. */
const LEFT_SIDE_KEYWORDS = /\b(patient|client|she|he|they|we|i|you|it|was|were|is|are)\b/i

/**
 * A term shorter than this and not ending in a period is a definition; anything longer is
 * a sentence that happens to contain a colon. `docs/BUILD_GUIDE.md` §3 says "short
 * (< ~60 chars) and not end in a period"; the ceiling is measured in characters.
 */
export const MAX_TERM_LENGTH = 60

/**
 * Sentence terminators, used by the joining rule.
 *
 * The closing set is included because quoted and parenthetical sentences end with the
 * punctuation inside: `"…he said."` and `"…(see above.)"` both end a sentence.
 */
const SENTENCE_END = /[.!?…]["'”’)\]]*$/

/**
 * Abbreviations that end in a period but do **not** end a sentence.
 *
 * Necessary because PDF and OCR extraction breaks lines at page and column bounds, not at
 * sentences, so `"…explained by Dr."` / `"Reyes."` is a real continuation that a bare
 * period check would split into two leftovers. The list is short because a false positive
 * costs little (a missed join, which stays in the leftover queue as visible text) while a
 * long speculative list would silently glue unrelated content together.
 */
const TRAILING_ABBREVIATION =
  /\b(?:dr|mr|mrs|ms|prof|fig|no|approx|admin|prep|rx|dx|tx|pt|hr|min|sec|temp|bp|rr|hr|wt|ht|eg|ie|vs|etc|cf|ca|al|mg|kg|ml|cc|iv|im|sc|po|prn|qid|tid|bid|od|qhs)\.$/i

// ── Term recognition ───────────────────────────────────────────────────────────────

interface SeparatorSplit {
  term: string
  definition: string
}

/**
 * Is the left-hand side of a separator a term, or is this prose that contains punctuation?
 *
 * Every rule here is one of the edge cases `docs/BUILD_GUIDE.md` §3 enumerates, and each
 * one is a real bug in a naive implementation:
 *
 * - a *word* must be present, so `"160/90: elevated"` is not a card;
 * - it must not contain `/`, which rejects URLs, file paths and the slash form of prose;
 * - it must not end in a period, which is what stops a sentence ending in a colon-shaped
 *   clause from becoming a term (`"Vitamin C is ascorbic acid."` cannot reach here, but
 *   `"See chapter 4.: read it"` can, and is rejected);
 * - it must be short, which is what stops a full sentence with a colon in the middle;
 * - it must not be a filler word, which is the `"Note: she reported: pain"` case.
 */
function isPlausibleTerm(term: string): boolean {
  const candidate = term
    .replace(/^["'“”‘’(\[]+/, '')
    .replace(/["'“”‘’)\]]+$/, '')
    .trim()

  if (candidate.length === 0) return false
  if (candidate.length > MAX_TERM_LENGTH) return false
  if (!/\p{L}/u.test(candidate)) return false
  if (/[/\\]/.test(candidate)) return false
  if (/[.!?;]$/.test(candidate)) return false
  if (LEFT_SIDE_KEYWORDS.test(candidate)) return false

  const lowered = candidate
    .toLowerCase()
    .replace(/[:;,]+$/, '')
    .trim()
  if (LEADING_FILLER.includes(lowered)) return false

  return true
}

/**
 * Split a line into a term and a definition, or return `undefined` if it is not one.
 *
 * Colon first, then the spaced dash. The colon is preferred because it is unambiguous
 * when it matches at all; the dash is the fallback for the `Term - Definition` shape.
 *
 * **An empty definition is allowed.** `"Shock:"` is a real shape in real notes — the
 * heading of a definition whose text is on the following lines — and joining (case 7)
 * is what fills it in. Requiring text after the colon made every wrapped definition fail
 * to start a card at all, so the body it was supposed to collect spilled into the
 * leftover queue instead. `docs/ai/write-tests.md` case 7 forbids joining to the line
 * above without this.
 */
function splitTermAndDefinition(text: string): SeparatorSplit | undefined {
  const colonAt = text.indexOf(':')
  if (colonAt > 0) {
    const term = text.slice(0, colonAt).trim()
    const definition = text.slice(colonAt + 1).trim()
    // `://` is the colon of a URL scheme, not a definition separator. Without this,
    // `"See https://prc.gov.ph: the official site"` parsed as the card `See https` — the
    // slash rejection inside `isPlausibleTerm` never ran, because the split happens at the
    // scheme's own colon, before the slashes are in the left-hand side.
    if (!definition.startsWith('//') && isPlausibleTerm(term)) {
      return { term: stripDecoration(term), definition }
    }
  }

  const dashMatch = DASH_SEPARATOR.exec(text)
  if (dashMatch !== null) {
    const term = text.slice(0, dashMatch.index).trim()
    const definition = text.slice(dashMatch.index + dashMatch[0].length).trim()
    if (!definition.startsWith('//') && isPlausibleTerm(term)) {
      return { term: stripDecoration(term), definition }
    }
  }

  return undefined
}

/** Remove list markers and wrapping quotes from a term, so the card front reads clean. */
function stripDecoration(term: string, options: { stripNumber?: boolean } = {}): string {
  let result = term.trim()
  if (options.stripNumber === true) result = result.replace(NUMBERED_START, '')
  result = result.replace(BULLET_START, '')
  result = result
    .replace(/^["'“”‘’(\[]+/, '')
    .replace(/["'“”‘’)\]]+$/, '')
    .trim()
  return result
}

// ── Line classification (pass 1: patterns) ─────────────────────────────────────────

/**
 * What a single line is, decided in one pass and in one place.
 *
 * - `pair` — a question with its answer on the very next line, together claiming two lines.
 * - `card` — this line alone starts a card.
 * - `leftover` — an anchored line that is deliberately *not* a card and must not be joined:
 *   an unpaired `Q1.` or `A1.`. The anchor is what stops the text being absorbed into the
 *   card above it.
 * - `standalone` — matched no anchor at all, so it may join the line above it (case 7).
 */
type LineClassification =
  | { kind: 'pair'; question: NormalizedLine; answer: NormalizedLine }
  | { kind: 'card'; lines: NormalizedLine[]; front: string; back: string }
  | { kind: 'leftover'; line: NormalizedLine; reason: LeftoverReason }
  | { kind: 'standalone'; line: NormalizedLine; reason: LeftoverReason }

/** Whether the line contains something that *looks* like a separator, right or wrong. */
function hasSeparatorCharacter(text: string): boolean {
  return text.includes(':') || DASH_SEPARATOR.test(text)
}

/**
 * Find the card-start pattern on this line, if any.
 *
 * Numbered and bulleted lines get their marker stripped and are then tested for a
 * `term: definition` body, so `"1. Vitamin C: ascorbic acid"` becomes a card with the
 * front `"Vitamin C"` rather than `"1. Vitamin C"`.
 *
 * **This is the single place that answers "does this line start a card?".** Keeping that
 * answer in one function is not tidiness — it is the ordering rule of case 7 made
 * structural. An earlier version handled bare `term: definition` lines in a fall-through
 * *after* the join check, so they had no anchor and were glued onto the line above them:
 * `"a life-threatening condition"` + `"hypoxia: low oxygen"` merged into one card and the
 * term `hypoxia` was swallowed into the definition. The fixture caught it.
 */
function findCardStart(
  lines: readonly NormalizedLine[],
  index: number,
): LineClassification | undefined {
  const line = lines[index]
  if (line === undefined) return undefined

  const text = line.text

  // An explicit `Q1.` marker. Checked first, so a question never reaches the term rules
  // and never gets joined into the card above it.
  if (QUESTION_LINE.test(text)) {
    const content = QUESTION_LINE.exec(text)?.[1]
    const next = lines[index + 1]
    const paired =
      content !== undefined && next !== undefined ? pairWithAnswer(line, content, next) : undefined
    return paired ?? { kind: 'leftover', line, reason: 'unpaired-question' }
  }

  // A bare number is only a question marker when its answer sits directly beneath it.
  // Otherwise it falls through to the definition rules below — that fall-through is what
  // makes `"1. Vitamin C: ascorbic acid"` a card instead of a lost question. The fixture
  // caught exactly that: reading `1.` as a question marker ate the card.
  if (NUMBERED_START.test(text)) {
    const next = lines[index + 1]
    if (next !== undefined && ANSWER_LINE.test(next.text)) {
      const content = stripDecoration(text, { stripNumber: true })
      const answerText = ANSWER_LINE.exec(next.text)?.[1]
      if (answerText !== undefined) {
        return {
          kind: 'pair',
          question: { ...line, text: content.trim() },
          answer: { ...next, text: answerText.trim() },
        }
      }
    }
  }

  // A bare answer marker with no question above it. **Not** an anchor: nothing in the file
  // ever anchors to an `A1.`, so marking it one had no effect except to skip the join check
  // and append it as a second leftover entry when it should have merged into the block
  // above. The reason string is what carries "this is an answer that lost its question".
  if (ANSWER_LINE.test(text) && hasNoQuestionAbove(lines, index)) {
    return { kind: 'standalone', line, reason: 'unpaired-answer' }
  }
  if (NUMBERED_START.test(text) || BULLET_START.test(text)) {
    const split = splitTermAndDefinition(stripDecoration(text, { stripNumber: true }))
    if (split !== undefined) {
      return { kind: 'card', lines: [line], front: split.term, back: split.definition }
    }
    // A list item with no separator: not a definition, so it is not a card. The caller
    // routes it to the leftover queue with a reason that says so.
    return { kind: 'standalone', line, reason: 'no-separator' }
  }

  // A plain `term: definition` or `term - definition`, with no marker at all.
  //
  // This branch is the reason `findCardStart` is the *only* detector. An earlier version
  // handled bare lines in a fall-through after the join check, which meant a bare
  // `term: definition` had no anchor to stop joining — so `"a life-threatening condition"`
  // followed by `"hypoxia: low oxygen"` merged into one card and the term was lost into
  // the definition. The fixture caught it; the lesson is that "which line starts a card"
  // must be answered in exactly one place, before anything else looks at the line.
  const split = splitTermAndDefinition(text)
  if (split !== undefined) {
    return { kind: 'card', lines: [line], front: split.term, back: split.definition }
  }

  // A separator that the term rules *rejected* is evidence of a line that stands on its own:
  // `"Note: she reported: pain"` looks like a definition to her and is prose to the parser, and
  // it must not be swept into the card above it. Classified as `leftover` (an anchor that is
  // deliberately not a card) rather than `standalone`, which is what stops the join. Found by a
  // fixture: without this the whole line became the tail of the previous card's answer.
  if (hasSeparatorCharacter(text)) {
    return { kind: 'leftover', line, reason: 'prose' }
  }

  return {
    kind: 'standalone',
    line,
    reason: 'no-separator',
  }
}
/** Build the question/answer pair when the line below really is its answer. */
function pairWithAnswer(
  line: NormalizedLine,
  content: string,
  next: NormalizedLine,
): LineClassification | undefined {
  const answerText = ANSWER_LINE.exec(next.text)?.[1]
  if (answerText === undefined) return undefined

  return {
    kind: 'pair',
    question: { ...line, text: content.trim() },
    answer: { ...next, text: answerText.trim() },
  }
}

/**
 * An answer marker is "unpaired" when the line above is not a question.
 *
 * Both question forms count: an explicit `Q1.`, and a bare `1.` whose answer is this very
 * line. Missing the second form would label every `A`-numbered answer as unpaired and,
 * worse, leave it eligible for joining into the card above it.
 */
function hasNoQuestionAbove(lines: readonly NormalizedLine[], index: number): boolean {
  const previous = lines[index - 1]
  if (previous === undefined) return true
  if (QUESTION_LINE.test(previous.text)) return false

  // A bare `1.` is a question precisely when an answer marker follows it. `previous` is
  // the line above, so the following line is the answer being tested.
  return !(NUMBERED_START.test(previous.text) && ANSWER_LINE.test(lines[index]?.text ?? ''))
}

// ── Joining (pass 2) ───────────────────────────────────────────────────────────────

/**
 * Does `line` continue the line above it?
 *
 * The rule from `docs/ai/write-tests.md` case 7, in its stated priority order: a lowercase
 * start, a closing bracket or punctuation start, or a previous line that does not end a
 * sentence. It is applied **only** to lines that matched no card-start pattern, which is
 * what lets a lowercase `term: definition` stay its own card.
 */
function isContinuation(previous: NormalizedLine, line: NormalizedLine): boolean {
  const text = line.text

  if (/^[a-z]/.test(text)) return true
  if (/^[)\]}"'”’]/.test(text)) return true
  if (/^[,;:]/.test(text)) return true

  return !endsASentence(previous.text)
}

/**
 * Whether a line ends on a hyphen, which is the evidence that a word was split across a
 * line break rather than that the line simply ended.
 *
 * Kept as its own named predicate because it is the whole justification for the one
 * place a card-start line is allowed to be joined.
 */
function endsWithHyphen(text: string): boolean {
  return /[A-Za-z]-$/.test(text)
}

/**
 * Whether a line ends a sentence, with abbreviations excepted.
 *
 * See `TRAILING_ABBREVIATION` for why the exception exists. An abbreviation that is not on
 * that list reads as a sentence end, so the following line stays separate — a missed join,
 * which is visible in the leftover queue, rather than two unrelated statements glued into
 * one card.
 */
function endsASentence(text: string): boolean {
  if (!SENTENCE_END.test(text)) return false
  return !TRAILING_ABBREVIATION.test(text)
}

// ── Provenance, enforced ───────────────────────────────────────────────────────────

export type ProvenanceClaim = { card: number | 'leftover'; line: number }

/**
 * Assert that coverage is exact: every normalized line claimed by exactly one output.
 *
 * Exported and called by `parse` itself, so this is a runtime guarantee rather than a
 * property that only holds while someone remembers to test it. It throws on the two ways
 * content can vanish: a line claimed by nobody (dropped), and a line claimed twice (one
 * copy shown, another silently overwritten).
 *
 * Throwing is the correct response in both cases. A card is only ever written on explicit
 * acceptance in the review screen, so a throw here costs a screen and a support message,
 * never data — whereas returning a plausible array with a hole in it costs a card she
 * never reviews.
 */
export function assertProvenance(lineCount: number, claims: readonly ProvenanceClaim[]): void {
  const owner = new Map<number, number | 'leftover'>()

  for (const claim of claims) {
    if (claim.line < 0 || claim.line >= lineCount) {
      throw new Error(
        `Parser provenance: line ${claim.line} is outside the normalized input (0..${lineCount - 1}). This is a parser bug, not bad input.`,
      )
    }
    const existing = owner.get(claim.line)
    if (existing !== undefined) {
      throw new Error(
        `Parser provenance: line ${claim.line} is claimed by ${String(existing)} and by ${String(claim.card)}. A line must belong to exactly one card or the leftover queue.`,
      )
    }
    owner.set(claim.line, claim.card)
  }

  if (owner.size !== lineCount) {
    const missing = Array.from({ length: lineCount }, (_, i) => i).filter((i) => !owner.has(i))
    throw new Error(
      `Parser provenance: ${String(missing.length)} normalized line(s) claimed by nothing: [${missing.join(', ')}]. Every line must become part of a card or the leftover queue — a dropped line is a card she never reviews.`,
    )
  }
}

// ── Entry point ────────────────────────────────────────────────────────────────────

/**
 * Parse normalized lines into proposed cards plus the leftover queue.
 *
 * A single linear pass. `findCardStart` answers "does this line start a card?" before
 * anything else looks at the line — see its doc comment for why that has to be one place.
 *
 * ## The pending line
 *
 * One line is held back at a time, and only when it ends on a hyphen. Such a line may be
 * the first half of a word split across a break (`"self-"` / `"esteem: a sense of worth"`),
 * and whether it is cannot be known until the next line is read. Emitting it immediately
 * would claim it, and the next line's attempt to join would then claim it a second time —
 * which is precisely what `assertProvenance` throws on, and it threw here during
 * development. Holding it keeps the invariant true by construction rather than by a
 * special case somewhere else.
 */
export function parse(lines: readonly NormalizedLine[]): ParseResult {
  const cards: ParsedCard[] = []
  const leftover: LeftoverQueueEntry[] = []
  const claims: ProvenanceClaim[] = []
  /** Indices already absorbed by a question/answer pair, or by a hyphenated join. */
  const consumed = new Set<number>()
  /** The one hyphen-ending line not yet claimed, or `null`. See the doc comment above. */
  let pending: Extract<LineClassification, { kind: 'standalone' }> | null = null

  for (let index = 0; index < lines.length; index += 1) {
    if (consumed.has(index)) continue

    const line = lines[index]
    if (line === undefined) continue

    const previous = lines[index - 1]
    const start = findCardStart(lines, index)

    // A hyphen-ending line only becomes a card once the next line supplies the rest of it.
    if (pending !== null) {
      if (start?.kind === 'card') {
        // Taken from `pending.line`, not from `start.front`: the term's first half is the
        // previous line, and `start.front` is only its second half.
        const cardIndex = bridgeHyphenatedLine(cards, leftover, claims, pending, start)
        claims.push({ card: cardIndex, line: line.index })
        consumed.add(index)
        pending = null
        continue
      }

      // Anything else, and the held-back line was not the first half of a split word after
      // all — so it is emitted, and this line is then handled normally below.
      emitLeftover(leftover, claims, pending)
      pending = null
    }

    if (start?.kind === 'pair') {
      cards.push({
        front: start.question.text,
        back: start.answer.text,
        sourceLines: [start.question.index, start.answer.index],
      })
      claims.push({ card: cards.length - 1, line: start.question.index })
      claims.push({ card: cards.length - 1, line: start.answer.index })
      consumed.add(index)
      consumed.add(index + 1)
      continue
    }

    if (start?.kind === 'card') {
      cards.push({
        front: start.front,
        back: start.back,
        sourceLines: start.lines.map((l) => l.index),
      })
      claims.push({ card: cards.length - 1, line: line.index })
      consumed.add(index)
      continue
    }

    // Not a card start. Now — and only now — consider joining it upward.
    //
    // `findCardStart` above has already established that this line begins no card, so a
    // continuation can never displace one. That ordering is the whole of case 7: joining
    // first would swallow every lowercase-starting `term: definition`.
    //
    // A line ending on a hyphen is **held back** rather than emitted, because the next line
    // is what proves whether it was the first half of a split word. Emitting it here would
    // claim it, and the join would then claim it again.
    if (endsWithHyphen(line.text) && start?.kind !== 'leftover') {
      pending =
        start?.kind === 'standalone' ? start : { kind: 'standalone', line, reason: 'no-separator' }
      consumed.add(index)
      continue
    }

    // An *anchored* line — an unpaired `Q1.` or `A1.`, which is what `leftover` means here —
    // never joins at all. The anchor exists so the text cannot be absorbed into the card
    // above it, and joining it would defeat exactly that. It stands alone with its own reason.
    if (start?.kind !== 'leftover' && previous !== undefined && isContinuation(previous, line)) {
      const claimedBy = appendToLastCard(cards, line, 'back')

      if (claimedBy !== undefined) {
        claims.push({ card: claimedBy, line: line.index })
        consumed.add(index)
        continue
      }

      const toLeftover = appendToLastLeftover(leftover, line)
      if (toLeftover !== undefined) {
        claims.push({ card: toLeftover, line: line.index })
        consumed.add(index)
        continue
      }
    }

    // Nothing to join it to: it stands alone. For an anchored line that is not a card —
    // an unpaired `Q1.` or `A1.` — the anchor's own reason is used, so the review screen
    // can say "this is waiting for its pair" rather than "no separator found".
    leftover.push({
      text: line.text,
      sourceLines: [line.index],
      // An anchored line carries its own reason; everything else gets the one
      // `findCardStart` derived from what it saw.
      reason:
        start?.kind === 'leftover'
          ? start.reason
          : start?.kind === 'standalone'
            ? start.reason
            : 'no-separator',
    })
    claims.push({ card: 'leftover', line: line.index })
    consumed.add(index)
  }

  // A trailing hyphen-ending line with nothing after it to complete the word.
  if (pending !== null) emitLeftover(leftover, claims, pending)

  assertProvenance(lines.length, claims)

  return { cards, leftover }
}

/**
 * Push a held-back line into the leftover queue and claim it.
 *
 * Uses the anchor's own reason when there is one, so an unpaired `Q1.` reads as "waiting for
 * its answer" rather than "no separator found".
 */
function emitLeftover(
  leftover: LeftoverQueueEntry[],
  claims: ProvenanceClaim[],
  pending: Extract<LineClassification, { kind: 'standalone' }>,
): void {
  leftover.push({
    text: pending.line.text,
    sourceLines: [pending.line.index],
    reason: pending.reason,
  })
  claims.push({ card: 'leftover', line: pending.line.index })
}

/**
 * Join a word hyphenated across a line break onto the card the next line started, and
 * record the previous half as claimed by that same card.
 *
 * Replaces a leftover entry when that is where the first half was sitting, rather than
 * adding a second claim for the same line — pushing a new card instead is what made
 * `assertProvenance` throw here, correctly.
 *
 * Returns the index of the card the pending half now belongs to.
 */
function bridgeHyphenatedLine(
  cards: ParsedCard[],
  leftover: LeftoverQueueEntry[],
  claims: ProvenanceClaim[],
  pending: Extract<LineClassification, { kind: 'standalone' }>,
  start: Extract<LineClassification, { kind: 'card' }>,
): number {
  const lastLeftover = leftover[leftover.length - 1]
  const firstHalf = lastLeftover?.text ?? pending.line.text
  const firstHalfLines = lastLeftover?.sourceLines ?? [pending.line.index]

  cards.push({
    front: `${firstHalf} ${start.front}`,
    back: start.back,
    sourceLines: [...firstHalfLines, ...start.lines.map((l) => l.index)],
  })
  if (lastLeftover !== undefined) leftover.pop()

  claims.push({ card: cards.length - 1, line: pending.line.index })
  return cards.length - 1
}

/**
 * Append a line to the last card, and say which card it landed on.
 *
 * `field` is explicit because a hyphenated `front` can only be completed by appending to
 * the **front** — appending to the back would read `"ascorbic acid self-"`, which is worse
 * than not joining at all. Returns the card's index rather than a boolean because card `0`
 * is a real card, and a truthiness check on it would send the continuation to the wrong
 * place. Returns `undefined` when there is no card yet.
 */
function appendToLastCard(
  cards: ParsedCard[],
  line: NormalizedLine,
  field: 'front' | 'back',
): number | undefined {
  const last = cards[cards.length - 1]
  if (last === undefined) return undefined

  const joined = joinText(last[field], line.text)
  if (field === 'front') last.front = joined
  else last.back = joined

  last.sourceLines.push(line.index)
  return cards.length - 1
}

/** Append a continuation line to the leftover block above, if there is one. */
function appendToLastLeftover(
  leftover: LeftoverQueueEntry[],
  line: NormalizedLine,
): 'leftover' | undefined {
  const last = leftover[leftover.length - 1]
  if (last === undefined) return undefined

  last.text = joinText(last.text, line.text)
  last.sourceLines.push(line.index)
  return 'leftover'
}

/**
 * Join a wrapped line onto the text above it.
 *
 * A single space, then collapse any run. `normalize` guarantees each line is already
 * collapsed and trimmed, so the only runs possible are the ones this join creates. An
 * empty tail is handled rather than special-cased: `joinText('', 'a definition')` is
 * `'a definition'`, which is what a definition line under an empty `"Term:"` produces.
 */
function joinText(previous: string, next: string): string {
  return `${previous} ${next}`.replace(/\s+/g, ' ').trim()
}

/** Normalize then parse — the entry point the UI and the tests both use. */
export function parseText(raw: string): { lines: NormalizedLine[]; result: ParseResult } {
  const lines = normalize(raw)
  return { lines, result: parse(lines) }
}
