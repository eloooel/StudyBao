import { describe, expect, it } from 'vitest'

import type { NormalizedLine, ParseResult } from '../types'
import { normalize } from './normalize'
import { assertProvenance, MAX_SOURCE_LINES_PER_ENTRY, parse, parseText, stopsJoin } from './parse'

/**
 * Parser tests.
 *
 * The cases in `docs/ai/write-tests.md` are numbered in the describe blocks below. The two
 * that matter most are 6 and 7: provenance coverage, and the joining rule. Case 6 is also
 * enforced at runtime by `assertProvenance` inside `parse`, so a regression there does not
 * merely fail a test — it throws.
 *
 * Every regression test here was checked against the reintroduced bug before being
 * trusted. See `docs/ai/write-tests.md`: a green test that cannot go red reads as coverage
 * and is worse than no test.
 *
 * ## Why coverage is computed from the *output*, not from the parser's claims
 *
 * `parse` does not return its internal claim list, and a test that quietly reconstructed
 * coverage from `cards.join(leftover)` would keep passing if `parse` stopped checking
 * anything at all. So coverage here is built from the same provenance the UI sees — every
 * card's and every leftover's `sourceLines` — which means the test reads exactly the data
 * that justification rests on. `assertProvenance` itself is unit-tested below for the
 * dropped, double-claimed and out-of-range cases it exists to catch.
 */

/** How many cards or leftover entries claim each source line, built from the output. */
function coverageOf(result: ParseResult): Map<number, number> {
  const counts = new Map<number, number>()

  for (const entry of [...result.cards, ...result.leftover]) {
    for (const line of entry.sourceLines) {
      counts.set(line, (counts.get(line) ?? 0) + 1)
    }
  }

  return counts
}

/** Assert exact coverage for every normalized line, naming the input when it fails. */
function expectExactCoverage(result: ParseResult, lineCount: number, context: string): void {
  const counts = coverageOf(result)

  for (let index = 0; index < lineCount; index += 1) {
    expect(counts.get(index), `${context} — line ${String(index)}`).toBe(1)
  }
}

// ── Join quality ───────────────────────────────────────────────────────────────────
//
// The invariant in case 6 counts *coverage*, which makes it join-agnostic: a card that
// swallowed 109 lines and the same 109 lines as correct fragments are indistinguishable to
// it. That is exactly why the suite stayed green for the whole life of the over-joining
// defect, so case 7 asserts properties of the *join* itself. These helpers build them from
// the same provenance the UI sees.

/** Assert no entry's span ran past the cap, and no card contains a heading that is not its own front. */
function expectJoinQuality(
  result: ParseResult,
  lines: readonly NormalizedLine[],
  context: string,
): void {
  for (const entry of [...result.cards, ...result.leftover]) {
    expect(
      entry.sourceLines.length,
      `${context} — an entry spans ${String(entry.sourceLines.length)} lines, over the cap`,
    ).toBeLessThanOrEqual(MAX_SOURCE_LINES_PER_ENTRY)
  }

  for (const card of result.cards) {
    // Every line after the first was absorbed by the join rule, so none of them may be a
    // boundary. A heading on the front is fine — that is the card starting at its heading.
    for (const line of card.sourceLines.slice(1)) {
      const text = lines[line]?.text ?? ''
      expect(
        stopsJoin(text),
        `${context} — a card absorbed the heading at line ${String(line)} ("${text}")`,
      ).toBe(false)
    }
  }
}

/** Parse what a test expects to be independently meaningful lines, with the text it saw. */
function parseJoin(lines: readonly string[]): { result: ParseResult; lines: NormalizedLine[] } {
  const normalized = normalize(lines.join('\n'))
  return { result: parse(normalized), lines: normalized }
}

/**
 * The join-quality vocabulary.
 *
 * Shared with case 6's generator, and deliberately containing shapes the first version lacked:
 * an ALL-CAPS heading, a numbered heading, and a run of short lowercase lines long enough to
 * reach the span cap. A vocabulary with no heading in it cannot reach either guard, so a
 * generator built from one would leave both new rules asserted by fixtures alone.
 */
const JOIN_VOCABULARY = [
  'Vitamin C: ascorbic acid',
  'self-esteem',
  'post-operative - after surgery',
  'Q1. What is the antidote?',
  'A1. N-acetylcysteine',
  'The patient was admitted with a fever and a productive cough that had lasted four days',
  'Note: she reported: pain',
  '- Iron - ferrous sulfate',
  '• Calcium: bone health',
  'and he reported dizziness on standing',
  'that supports immune function',
  ') a closing bracket opening',
  '160/90: elevated',
  'See https://prc.gov.ph: the official site',
  '1. Vitamin C: ascorbic acid',
  // The shapes the first vocabulary could not build.
  'NEXT SECTION HEADING',
  'CARDIAC DISORDERS',
  '1. VITAMINS',
  'Shock:',
  'a life-threatening condition',
  'in which the body',
  'does not get enough',
  'blood flow,',
]

describe('normalize', () => {
  it('drops blank lines and renumbers what is left, so a line index means a visible line', () => {
    const lines = normalize('First\n\n   \nSecond\n')

    expect(lines).toEqual([
      { index: 0, text: 'First' },
      { index: 1, text: 'Second' },
    ])
  })

  it('strips OCR noise characters and collapses whitespace runs', () => {
    expect(normalize('  Vitamin   C ~~~  :  ascorbic   acid  ')).toEqual([
      { index: 0, text: 'Vitamin C : ascorbic acid' },
    ])
  })

  it('removes a stray pipe without eating the separator, so a definition still parses', () => {
    const { result } = parseText('Vitamin C | : ascorbic acid')

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.front).toBe('Vitamin C')
  })

  it('accepts CRLF from pasted Windows text without leaving a stray character', () => {
    expect(normalize('Term: Definition\r\nNext: One\r\n').map((line) => line.text)).toEqual([
      'Term: Definition',
      'Next: One',
    ])
  })

  it('folds the math minus sign so a spaced dash separator still matches', () => {
    expect(normalize('Term − Definition')[0]?.text).toBe('Term - Definition')
  })

  it('keeps a bullet and an en dash, which the card patterns depend on', () => {
    expect(normalize('• Term – Definition')[0]?.text).toBe('• Term – Definition')
  })
})

describe('parse — case 1: Term: Definition becomes one card', () => {
  it('splits a colon definition into the front and the back', () => {
    const { result } = parseText('Vitamin C: ascorbic acid')

    expect(result.cards).toEqual([{ front: 'Vitamin C', back: 'ascorbic acid', sourceLines: [0] }])
    expect(result.leftover).toEqual([])
  })

  it('strips a list marker so the front reads as the term, not as "1. Term"', () => {
    const { result } = parseText('1. Vitamin C: ascorbic acid')

    expect(result.cards[0]?.front).toBe('Vitamin C')
    expect(result.cards[0]?.back).toBe('ascorbic acid')
  })

  it('strips wrapping quotes from the term', () => {
    const { result } = parseText('- "Vitamin C": ascorbic acid')

    expect(result.cards[0]?.front).toBe('Vitamin C')
  })

  it('parses a spaced dash as a separator when there is no colon', () => {
    const { result } = parseText('Vitamin C - ascorbic acid')

    expect(result.cards[0]).toMatchObject({ front: 'Vitamin C', back: 'ascorbic acid' })
  })

  it('parses an en dash as a separator too, because PDF extraction emits them', () => {
    const { result } = parseText('Vitamin C – ascorbic acid')

    expect(result.cards[0]).toMatchObject({ front: 'Vitamin C', back: 'ascorbic acid' })
  })
})

describe('parse — case 2: a hyphen inside a word is never a separator', () => {
  it('does not split self-esteem as Term - Definition', () => {
    const { result } = parseText('self-esteem: how a person values themselves')

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.front).toBe('self-esteem')
    expect(result.cards[0]?.back).toBe('how a person values themselves')
  })

  it('does not split post-operative, and still finds the spaced dash after it', () => {
    const { result } = parseText('post-operative - after surgery')

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.front).toBe('post-operative')
    expect(result.cards[0]?.back).toBe('after surgery')
  })

  it('leaves a hyphenated word alone when there is no separator at all', () => {
    const { result } = parseText('self-esteem')

    expect(result.cards).toEqual([])
    expect(result.leftover[0]?.text).toBe('self-esteem')
  })
})

describe('parse — case 3: prose containing a colon is not a card', () => {
  it('does not turn a long sentence with a colon into a card', () => {
    const { result } = parseText(
      'The nurse should always check the patient blood pressure before giving the dose: it matters',
    )

    expect(result.cards).toEqual([])
    expect(result.leftover[0]?.text).toContain('blood pressure')
  })

  it('does not let a prose line with a colon be absorbed into the card above it', () => {
    // Both halves are fixtures for the same defect: a line whose separator the term rules
    // rejected is a *line*, not the tail of the previous answer. Before the fix, the whole of
    // `"Note: she reported: pain"` landed on the back of the Vitamin C card and the leftover
    // queue was empty — a card that says something her notes do not say, which is the worst
    // outcome available here.
    const prose = parseText(['Vitamin C: ascorbic acid', 'Note: she reported: pain'].join('\n'))
    expect(prose.result.cards).toHaveLength(1)
    expect(prose.result.cards[0]?.back).toBe('ascorbic acid')
    expect(prose.result.leftover).toHaveLength(1)
    expect(prose.result.leftover[0]?.text).toBe('Note: she reported: pain')

    // The same shape, rejected for length rather than for a filler word.
    const sentence = parseText(
      [
        'Vitamin C: ascorbic acid',
        'The nurse should always check the patient blood pressure before giving the dose: it matters',
      ].join('\n'),
    )
    expect(sentence.result.cards[0]?.back).toBe('ascorbic acid')
    expect(sentence.result.leftover).toHaveLength(1)
  })

  it('rejects a left-hand side that ends in a period', () => {
    const { result } = parseText('See chapter 4.: read it again')

    expect(result.cards).toEqual([])
  })

  it('rejects a filler word, which is the "Note: she reported: pain" case', () => {
    const { result } = parseText('Note: she reported: pain')

    expect(result.cards).toEqual([])
    expect(result.leftover[0]?.text).toBe('Note: she reported: pain')
  })

  it('rejects a left-hand side longer than the term ceiling', () => {
    const { result } = parseText(`${'A'.repeat(61)}: definition`)

    expect(result.cards).toEqual([])
  })

  it('accepts a left-hand side exactly at the ceiling, so the boundary is pinned', () => {
    const { result } = parseText(`${'A'.repeat(60)}: definition`)

    expect(result.cards).toHaveLength(1)
  })

  it('rejects a left-hand side with no word in it', () => {
    const { result } = parseText('160/90: elevated')

    expect(result.cards).toEqual([])
  })

  it('rejects a URL rather than reading it as term and definition', () => {
    const { result } = parseText('See https://prc.gov.ph: the official site')

    expect(result.cards).toEqual([])
  })
})

describe('parse — case 4: numbered Q1./A1. blocks pair correctly, in order', () => {
  it('pairs a question with the answer beneath it and keeps the order', () => {
    const { result } = parseText(
      [
        'Q1. What is the antidote?',
        'A1. N-acetylcysteine',
        'Q2. What is the route?',
        'A2. Oral',
      ].join('\n'),
    )

    expect(result.cards).toEqual([
      { front: 'What is the antidote?', back: 'N-acetylcysteine', sourceLines: [0, 1] },
      { front: 'What is the route?', back: 'Oral', sourceLines: [2, 3] },
    ])
    expect(result.leftover).toEqual([])
  })

  it('does not turn a question with no answer into a card', () => {
    const { result } = parseText('Q1. What is the antidote?')

    expect(result.cards).toEqual([])
    expect(result.leftover[0]?.text).toBe('Q1. What is the antidote?')
  })

  it('keeps a lone answer with no question anywhere as a leftover', () => {
    const { result } = parseText('A1. This answer has lost its question')

    expect(result.cards).toEqual([])
    expect(result.leftover).toHaveLength(1)
    expect(result.leftover[0]?.reason).toBe('unpaired-answer')
  })

  // These two fixtures are parameterised rather than written twice, because after the join
  // fix they are the *same* assertion and the reason they were once different is gone.
  //
  // The first fixture used to join: `"Vitamin C: ascorbic acid"` does not end a sentence, so
  // the deleted `!endsASentence` fallback treated the orphan answer as its continuation. The
  // second used to stand alone, because the previous line did end one. Sentence-ending no
  // longer distinguishes them — the orphan answer is now an anchor in both cases, and the
  // anchor is the whole point: nothing may be absorbed into the card above it.
  it.each([
    { label: 'a previous line that does not end a sentence', above: 'Vitamin C: ascorbic acid' },
    { label: 'a previous line that ends a sentence', above: 'Vitamin C: ascorbic acid.' },
  ])('keeps an orphaned answer beside $label in the leftover queue', ({ above }) => {
    const { result } = parseText([above, 'A1. This answer has lost its question'].join('\n'))

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.sourceLines).toEqual([0])
    expect(result.leftover).toHaveLength(1)
    expect(result.leftover[0]?.reason).toBe('unpaired-answer')
  })

  it('keeps the pairing in order when the questions arrive out of order', () => {
    const { result } = parseText(
      ['Q2. Second question?', 'A2. Second answer', 'Q1. First question?', 'A1. First answer'].join(
        '\n',
      ),
    )

    expect(result.cards.map((card) => card.front)).toEqual(['Second question?', 'First question?'])
  })
})

describe('parse — case 5: bulleted definitions become cards', () => {
  it('turns a bulleted colon definition into a card', () => {
    const { result } = parseText('• Vitamin C: ascorbic acid')

    expect(result.cards[0]).toMatchObject({ front: 'Vitamin C', back: 'ascorbic acid' })
  })

  it('turns a bulleted dash definition into a card', () => {
    const { result } = parseText('- Vitamin C - ascorbic acid')

    expect(result.cards[0]).toMatchObject({ front: 'Vitamin C', back: 'ascorbic acid' })
  })

  it('parses several bullets in order', () => {
    const { result } = parseText(
      ['- Vitamin C: ascorbic acid', '* Iron: ferrous sulfate', '• Calcium: bone health'].join(
        '\n',
      ),
    )

    expect(result.cards.map((card) => card.front)).toEqual(['Vitamin C', 'Iron', 'Calcium'])
  })

  it('routes a bullet with no separator to the leftover queue, keeping its text', () => {
    const { result } = parseText('• Just a note about vitamins')

    expect(result.cards).toEqual([])
    expect(result.leftover[0]?.text).toBe('• Just a note about vitamins')
  })
})

describe('parse — case 6: provenance is exact, so nothing is lost or double-claimed', () => {
  it('accounts for every normalized line of a mixed input exactly once', () => {
    const lines = normalize(
      [
        'Vitamin C: ascorbic acid',
        'Q1. What is the antidote?',
        'A1. N-acetylcysteine',
        'This is an ordinary sentence that runs on and on, with no separator at all',
        '- Iron - ferrous sulfate',
      ].join('\n'),
    )

    const result = parse(lines)

    expect(lines).toHaveLength(5)
    expectExactCoverage(result, lines.length, 'mixed input')
  })

  it('gives a joined card the provenance of every line it was assembled from', () => {
    const { result } = parseText(
      ['Vitamin C:', 'a water-soluble vitamin', 'that supports immune function'].join('\n'),
    )

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.sourceLines).toEqual([0, 1, 2])
  })

  it('holds over several hundred generated line sequences', () => {
    // What this test does and does not prove.
    //
    // It proves the accounting is exact: no line is claimed twice, and none is left
    // unclaimed. It was confirmed to fail when `assertProvenance`'s missing-line check was
    // disabled, so it can go red.
    //
    // It does **not** prove that a line became a *card*. Planting a bug that made
    // `findCardStart` refuse to recognise a line left this test green, because such a line
    // still falls through to the leftover queue and stays accounted for. That is the
    // invariant working as designed, and it is also why the fixtures above matter: only a
    // named case can assert that a particular input produced a particular card.
    //
    // It also asserts join *quality* per round now, not only coverage, because coverage alone
    // cannot see an over-join — see `expectJoinQuality`. The vocabulary carries heading shapes
    // and a long lowercase run for that reason.
    const next = seededRandom(20_260_101)

    for (let round = 0; round < 400; round += 1) {
      const length = 1 + Math.floor(next() * 6)
      const chosen: string[] = []
      for (let i = 0; i < length; i += 1) {
        chosen.push(JOIN_VOCABULARY[Math.floor(next() * JOIN_VOCABULARY.length)] ?? '')
      }

      const lines = normalize(chosen.join('\n'))
      if (lines.length === 0) continue

      // `parse` throws here if its own invariant fails; this asserts the same property
      // from the outside, so a broken claim list cannot hide inside the parser.
      const result = parse(lines)
      expectExactCoverage(result, lines.length, JSON.stringify(chosen))
      expectJoinQuality(result, lines, JSON.stringify(chosen))
    }
  })

  it('throws when a line is claimed by nobody, which is how content silently vanishes', () => {
    expect(() =>
      assertProvenance(3, [
        { card: 0, line: 0 },
        { card: 0, line: 2 },
      ]),
    ).toThrow(/claimed by nothing: \[1\]/)
  })

  it('throws when a line is claimed twice, which a plain line count cannot detect', () => {
    expect(() =>
      assertProvenance(2, [
        { card: 0, line: 0 },
        { card: 1, line: 0 },
        { card: 'leftover', line: 1 },
      ]),
    ).toThrow(/claimed by 0 and by 1/)
  })

  it('throws when a claim points outside the input, which is a parser bug not bad notes', () => {
    expect(() => assertProvenance(1, [{ card: 'leftover', line: 7 }])).toThrow(
      /outside the normalized input/,
    )
  })
})

describe('parse — case 7: a wrapped line joins the line above it, conservatively', () => {
  it('assembles a definition wrapped across ten lines into one card', () => {
    const { result } = parseText(
      [
        'Shock:',
        'a life-threatening condition',
        'in which the body',
        'does not get enough',
        'blood flow,',
        'which means',
        'the organs',
        'and the tissues',
        'do not receive',
        'enough oxygen',
      ].join('\n'),
    )

    expect(result.cards).toHaveLength(1)
    expect(result.leftover).toEqual([])
    expect(result.cards[0]?.sourceLines).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(result.cards[0]?.back).toContain('enough oxygen')
  })

  it('still starts its own card for a lowercase line that genuinely begins term: definition', () => {
    const { result } = parseText(
      ['Shock:', 'a life-threatening condition', 'hypoxia: low oxygen'].join('\n'),
    )

    expect(result.cards).toHaveLength(2)
    expect(result.cards[0]?.sourceLines).toEqual([0, 1])
    expect(result.cards[1]).toEqual({ front: 'hypoxia', back: 'low oxygen', sourceLines: [2] })
  })

  it('joins a continuation that begins with a closing bracket', () => {
    const { result } = parseText(['Term:', 'a definition (see also', 'the appendix)'].join('\n'))

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.sourceLines).toEqual([0, 1, 2])
  })

  it('treats a line beginning with a capital after a completed card as its own entry', () => {
    // This replaces a fixture whose name asserted a rule that no longer exists. The old name
    // was "does not join a line that begins a new sentence after a completed one", which was
    // vacuous once the fallback went: nothing joins without positive evidence now, so
    // passing the test proved nothing about the sentence-end check. What it actually pins is
    // the rule that survives — a capitalised line that is not a card start receives the
    // leftover queue rather than the card above it.
    const { result } = parseText(
      ['Vitamin C: ascorbic acid.', 'This is a separate thought about nutrition.'].join('\n'),
    )

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.sourceLines).toEqual([0])
    expect(result.leftover).toHaveLength(1)
    expect(result.leftover[0]?.text).toBe('This is a separate thought about nutrition.')
  })

  it('has no abbreviation exception any more, so a wrapped sentence broken after "Dr." splits', () => {
    // A real behaviour change, recorded rather than hidden. `"explained by Dr."` was joined
    // only because the deleted fallback consulted `TRAILING_ABBREVIATION`: the period made it
    // fail `SENTENCE_END`, so "the previous line does not end a sentence" was true and the
    // line was appended. With the fallback gone, `"Reyes in the handout"` begins with a
    // capital and has no other evidence — so it becomes a leftover fragment she can see and
    // fix in one tap, which is the trade this fix deliberately makes.
    const { result } = parseText(
      ['Vitamin C:', 'explained by Dr.', 'Reyes in the handout'].join('\n'),
    )

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.sourceLines).toEqual([0, 1])
    expect(result.cards[0]?.back).toBe('explained by Dr.')
    expect(result.leftover).toHaveLength(1)
    expect(result.leftover[0]?.text).toBe('Reyes in the handout')
  })

  it('joins a continuation onto the leftover queue when there is no card above it', () => {
    const { result } = parseText(
      ['This line has no separator at all', 'and it continues here'].join('\n'),
    )

    expect(result.cards).toEqual([])
    expect(result.leftover).toHaveLength(1)
    expect(result.leftover[0]?.sourceLines).toEqual([0, 1])
    expect(result.leftover[0]?.text).toBe('This line has no separator at all and it continues here')
  })

  it('collapses the whitespace a join creates', () => {
    const { result } = parseText(['Term:', 'definition', 'continued'].join('\n'))

    expect(result.cards[0]?.back).toBe('definition continued')
  })

  it('rejoins a word hyphenated across a line break into one card', () => {
    // This is the one case where a card-start line *is* joined: the hyphen is evidence the
    // word was split, and without joining, the continuation rule would produce a card
    // front of "esteem" and a severed leftover "self-".
    const { result } = parseText(['self-', 'esteem: a sense of worth'].join('\n'))

    expect(result.leftover).toEqual([])
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.front).toBe('self- esteem')
    expect(result.cards[0]?.back).toBe('a sense of worth')
    expect(result.cards[0]?.sourceLines).toEqual([0, 1])
  })

  it('keeps a term and a following ALL-CAPS heading as two entries', () => {
    // **The canonical repro from the fitness test, and it did not exist before this change.**
    // The fixture named for the lowercase-`term:` case is a different scenario: it exercises
    // the lowercase start, which is positive evidence and joins correctly both before and
    // after. This is the smallest input that reproduces the real failure — a heading with no
    // period above it was appended to the card because the previous line did not end a
    // sentence.
    const { result, lines } = parseJoin(['Term: definition one', 'NEXT SECTION HEADING'])

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.back).toBe('definition one')
    expect(result.leftover).toHaveLength(1)
    expect(result.leftover[0]?.text).toBe('NEXT SECTION HEADING')
    expectExactCoverage(result, lines.length, 'heading repro')
    expectJoinQuality(result, lines, 'heading repro')
  })

  it('stops the join at an ALL-CAPS heading, so the heading keeps its own entry', () => {
    const { result, lines } = parseJoin([
      'Shock:',
      'a life-threatening condition',
      'NEXT SECTION HEADING',
    ])

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.sourceLines).toEqual([0, 1])
    expect(result.leftover).toHaveLength(1)
    expect(result.leftover[0]?.text).toBe('NEXT SECTION HEADING')
    expectExactCoverage(result, lines.length, 'ALL-CAPS heading')
    expectJoinQuality(result, lines, 'ALL-CAPS heading')
  })

  it('stops the join at a numbered heading too, not only a shouted one', () => {
    const { result, lines } = parseJoin([
      'Shock:',
      'a life-threatening condition',
      '1. VITAMINS AND MINERALS',
    ])

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.sourceLines).toEqual([0, 1])
    expect(result.leftover).toHaveLength(1)
    expect(result.leftover[0]?.text).toBe('1. VITAMINS AND MINERALS')
    expectExactCoverage(result, lines.length, 'numbered heading')
    expectJoinQuality(result, lines, 'numbered heading')
  })

  it('does not let a line below a heading join past it into the card above', () => {
    // The boundary is a boundary in both directions. The heading ends the join, so the lowercase
    // line below it cannot reach the card above for two independent reasons: the heading is not a
    // join target, and the card is no longer the entry directly above. What the line must *not*
    // do is travel up to `Term` — that is the failure this asserts against.
    const { result, lines } = parseJoin([
      'Term: definition one',
      'NEXT SECTION HEADING',
      'a lowercase line under the heading',
    ])

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.sourceLines).toEqual([0])
    expect(result.leftover.map((entry) => entry.sourceLines)).toEqual([[1], [2]])
    expectExactCoverage(result, lines.length, 'below a heading')
    expectJoinQuality(result, lines, 'below a heading')
  })

  it('caps an entry at the span limit, and does not off-by-one past it', () => {
    // The legitimate ten-line definition sits exactly at the cap, so on its own it cannot tell
    // "the cap is ten" from "the cap is nine or eleven". Eleven lines splits, and the split
    // point is asserted, which pins the boundary from both sides.
    const run = [
      'Shock:',
      'a life-threatening condition',
      'in which the body',
      'does not get enough',
      'blood flow,',
      'which means',
      'the organs',
      'and the tissues',
      'do not receive',
      'enough oxygen',
      'and the tissues fail',
    ]
    const { result, lines } = parseJoin(run)

    expect(lines).toHaveLength(11)
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.sourceLines).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(result.leftover).toHaveLength(1)
    expect(result.leftover[0]?.sourceLines).toEqual([10])
    expectExactCoverage(result, lines.length, 'span cap')
    expectJoinQuality(result, lines, 'span cap')
  })

  it('caps a run that is not a card too, so an unparsed blob cannot grow without bound', () => {
    const run = Array.from({ length: 13 }, () => 'a fragment with no separator at all')
    const { result, lines } = parseJoin(run)

    expect(result.cards).toEqual([])
    // Thirteen identical continuation lines split into a capped run plus a new one.
    expect(result.leftover.map((entry) => entry.sourceLines.length)).toEqual([
      MAX_SOURCE_LINES_PER_ENTRY,
      3,
    ])
    expectExactCoverage(result, lines.length, 'leftover cap')
    expectJoinQuality(result, lines, 'leftover cap')
  })

  it('holds the join-quality assertions over generated sequences, not only fixtures', () => {
    const next = seededRandom(20_260_102)

    for (let round = 0; round < 400; round += 1) {
      const length = 1 + Math.floor(next() * 14)
      const chosen: string[] = []
      for (let i = 0; i < length; i += 1) {
        chosen.push(JOIN_VOCABULARY[Math.floor(next() * JOIN_VOCABULARY.length)] ?? '')
      }

      const lines = normalize(chosen.join('\n'))
      if (lines.length === 0) continue

      const result = parse(lines)
      expectExactCoverage(result, lines.length, JSON.stringify(chosen))
      expectJoinQuality(result, lines, JSON.stringify(chosen))
    }
  })
})

describe('parse — empty and degenerate input', () => {
  it('returns nothing for an empty string', () => {
    const { result } = parseText('')

    expect(result.cards).toEqual([])
    expect(result.leftover).toEqual([])
  })

  it('returns nothing for whitespace only', () => {
    const { result } = parseText('   \n\n \t \n')

    expect(result.cards).toEqual([])
    expect(result.leftover).toEqual([])
  })

  it('does not throw the invariant for a single stray character', () => {
    expect(() => parseText('~')).not.toThrow()
    expect(() => parseText('|')).not.toThrow()
  })
})

/**
 * A deterministic PRNG, because `Math.random()` would make a failure unreproducible and
 * the whole point of the generated test is that a dropped line is caught at all.
 *
 * Mulberry32 — small, seeded, and good enough to shuffle a twenty-two-item vocabulary.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
