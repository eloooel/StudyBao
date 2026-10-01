import { describe, expect, it } from 'vitest'

import { contentItemsToLines } from './pdf-lines'

/**
 * PDF text-item → lines.
 *
 * The cases here are the ones that change what she ends up reviewing: a PDF text layer hands
 * back one item per word, and whether the line breaks land in the right place is the
 * difference between thirty cards and one card containing the whole page.
 */
describe('contentItemsToLines', () => {
  it('joins the words of one line back into a single line', () => {
    // A very common shape: one item per word, `hasEOL` false except at the end of a line.
    const items = [
      { str: 'Vitamin' },
      { str: 'C:' },
      { str: 'ascorbic' },
      { str: 'acid', hasEOL: true },
      { str: 'Iron:', hasEOL: true },
    ]

    expect(contentItemsToLines(items)).toEqual(['Vitamin C: ascorbic acid', 'Iron:'])
  })

  it('emits the trailing line even when the PDF never marks its end', () => {
    // Real files routinely end without a final `hasEOL`; dropping it would lose the last
    // definition on the page, which is exactly the silent data loss this feature refuses.
    expect(contentItemsToLines([{ str: 'Iron:' }, { str: 'ferrous sulfate' }])).toEqual([
      'Iron: ferrous sulfate',
    ])
  })

  it('skips marked-content items that carry no text', () => {
    const items = [{ str: 'Calcium:' }, {}, { str: 'bone health', hasEOL: true }]

    expect(contentItemsToLines(items)).toEqual(['Calcium: bone health'])
  })

  it('drops lines that are only whitespace rather than emitting blank lines', () => {
    // A blank line would survive `normalize` as nothing, so emitting it would only make the
    // provenance indices harder to follow.
    const items = [
      { str: '   ', hasEOL: true },
      { str: 'Real:', hasEOL: true },
    ]

    expect(contentItemsToLines(items)).toEqual(['Real:'])
  })

  it('collapses runs of whitespace inside a line', () => {
    const items = [{ str: 'Vitamin   C:' }, { str: '   ascorbic' }, { str: 'acid', hasEOL: true }]

    expect(contentItemsToLines(items)).toEqual(['Vitamin C: ascorbic acid'])
  })

  it('returns nothing for no items, rather than one empty line', () => {
    expect(contentItemsToLines([])).toEqual([])
    expect(contentItemsToLines([{ hasEOL: true }])).toEqual([])
  })

  it('keeps the document order, so a Q/A pair survives extraction', () => {
    const items = [
      { str: 'Q1.', hasEOL: false },
      { str: 'What', hasEOL: false },
      { str: 'is', hasEOL: false },
      { str: 'the', hasEOL: false },
      { str: 'antidote?', hasEOL: true },
      { str: 'A1.', hasEOL: false },
      { str: 'N-acetylcysteine', hasEOL: true },
    ]

    expect(contentItemsToLines(items)).toEqual([
      'Q1. What is the antidote?',
      'A1. N-acetylcysteine',
    ])
  })
})
