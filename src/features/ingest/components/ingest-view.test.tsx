import { describe, expect, it } from 'vitest'

import { render } from '@/test/render'
import type { Deck } from '@/db/types'
import type { IngestTabStatus, IngestViewProps, PdfStatus, PhotoStatus } from '../types'
import { IngestView } from './ingest-view'

/**
 * The copy rule this screen has to obey: **name the tool on the device she is holding, never a
 * second device.**
 *
 * She has an iPad and a Windows laptop, so advice to "open it on your phone" is wrong twice — on
 * the iPad it adds a step she does not need, and on the laptop it names a device that has no part
 * in the fix. That advice was in three separate states, which is why one assertion per state is
 * the wrong shape: it was three assertions that could each be reworded independently, and it took
 * a code reading to notice all three.
 *
 * So the rule is asserted as a **property over the rendered copy** rather than against the string
 * literals: render every state the view can produce and reject the forbidden device/tool names in
 * the text that actually lands in the DOM. A rewrite cannot quietly reintroduce it, and the check
 * does not have to be kept in step with the wording.
 *
 * The anchors are the other half, and they are not decoration. A property that only forbids words
 * is satisfied by deleting the advice, which is a worse defect than the one this replaces — the
 * scanned-PDF state exists to tell her what to do next. Each state must therefore still say what
 * it said, so the property can only pass by saying it without a phone.
 */

/** A device she owns is not one, and neither is a tool for a platform she does not own. */
const FORBIDDEN = /phone|iPhone|Android|Google Lens/i

const TABS: readonly IngestTabStatus[] = [
  { id: 'paste', label: 'Paste text', enabled: true },
  { id: 'pdf', label: 'Upload PDF', enabled: true },
  { id: 'photo', label: 'Upload photo', enabled: true },
]

/**
 * Every renderable state, with the copy each one is required to still carry.
 *
 * `mustSay` is a list of regular expressions rather than one, because a state that says two things
 * should have to keep saying both: the scanned state has to admit there is no text **and** name
 * the local tool, or it has quietly become a dead end.
 */
const STATES: readonly {
  name: string
  tab: 'paste' | 'pdf' | 'photo'
  /** Overrides the default line count, which is what the paste tab's status line reports. */
  lineCount?: number
  pdfStatus?: PdfStatus
  photoStatus?: PhotoStatus
  mustSay: readonly RegExp[]
}[] = [
  // --- Paste: the default tab, and the one the failure states send her to. ---
  { name: 'paste — empty', tab: 'paste', lineCount: 0, mustSay: [/Nothing to read yet/] },
  {
    name: 'paste — notes typed',
    tab: 'paste',
    mustSay: [/1 line ready/],
  },

  // --- PDF ---
  { name: 'pdf — idle', tab: 'pdf', pdfStatus: { state: 'idle' }, mustSay: [] },
  {
    name: 'pdf — opening',
    tab: 'pdf',
    pdfStatus: { state: 'reading', fileName: 'notes.pdf', done: 0, total: 0 },
    mustSay: [/Opening notes\.pdf/],
  },
  {
    name: 'pdf — reading a page',
    tab: 'pdf',
    pdfStatus: { state: 'reading', fileName: 'notes.pdf', done: 3, total: 40 },
    mustSay: [/page 3 of 40/],
  },
  {
    name: 'pdf — read',
    tab: 'pdf',
    pdfStatus: { state: 'ready', fileName: 'notes.pdf', pageCount: 4 },
    mustSay: [/Read 4 pages from notes\.pdf/],
  },
  {
    // The state the defect was reported from, and the one with two obligations.
    name: 'pdf — scanned, the state with no text layer',
    tab: 'pdf',
    pdfStatus: { state: 'scanned', fileName: 'handout.pdf', pageCount: 12 },
    mustSay: [/no text in it/, /Live Text/, /first tab/],
  },
  {
    name: 'pdf — locked',
    tab: 'pdf',
    pdfStatus: {
      state: 'failed',
      fileName: 'locked.pdf',
      message: 'This PDF is locked with a password.',
    },
    mustSay: [/locked with a password/],
  },

  // --- Photo ---
  { name: 'photo — idle', tab: 'photo', photoStatus: { state: 'idle' }, mustSay: [] },
  {
    // The advice is rendered above the status, so it belongs to every photo state; asserted on
    // this one because it is the plainest.
    name: 'photo — the standing advice',
    tab: 'photo',
    photoStatus: { state: 'idle' },
    mustSay: [/Printed text works best/, /Live Text/, /first tab/],
  },
  {
    name: 'photo — getting ready',
    tab: 'photo',
    photoStatus: { state: 'preparing', fileName: 'page.jpg' },
    mustSay: [/Getting page\.jpg ready/],
  },
  {
    name: 'photo — recognizing',
    tab: 'photo',
    photoStatus: {
      state: 'reading',
      fileName: 'page.jpg',
      stage: 'recognizing text',
      progress: 0.62,
    },
    mustSay: [/recognizing text, 62%/],
  },
  {
    name: 'photo — read',
    tab: 'photo',
    photoStatus: { state: 'ready', fileName: 'page.jpg' },
    mustSay: [/Read page\.jpg/],
  },
  {
    name: 'photo — no words found, the handwriting case',
    tab: 'photo',
    photoStatus: { state: 'empty', fileName: 'page.jpg' },
    mustSay: [/handwriting/, /Live Text/, /first tab/],
  },
  {
    name: 'photo — failed',
    tab: 'photo',
    photoStatus: {
      state: 'failed',
      fileName: 'page.heic',
      message: "We couldn't read that photo.",
    },
    mustSay: [/couldn't read that photo/],
  },
]

/**
 * The deck the picker offers. Written out rather than seeded from the database, because this test
 * renders Layer 3 directly and must not open IndexedDB to assert a sentence.
 */
const DECK: Deck = {
  id: 'deck-practice-i',
  subject: 'practice-i',
  name: 'Practice I',
  scope: 'Nursing Practice I',
  updatedAt: 1_700_000_000_000,
}

/** Everything the view needs, with the state under test layered over it. */
function propsFor(state: (typeof STATES)[number]): IngestViewProps {
  return {
    tab: state.tab,
    tabs: TABS,
    onSelectTab: () => {},
    decks: [DECK],
    deckId: DECK.id,
    onSelectDeck: () => {},
    text: 'Vitamin C: ascorbic acid',
    onChangeText: () => {},
    onSubmit: () => {},
    lineCount: state.lineCount ?? 1,
    pdfStatus: state.pdfStatus ?? { state: 'idle' },
    onPickPdfFile: () => {},
    photoStatus: state.photoStatus ?? { state: 'idle' },
    onPickPhotoFile: () => {},
  }
}

describe('the ingest screen copy', () => {
  it.each(STATES)('$name says what it has to say', (state) => {
    const { container } = render(<IngestView {...propsFor(state)} />)

    // Anchored first, deliberately: read as "does the state render at all". Without it a state
    // whose props are wrong would trivially satisfy the property below by rendering nothing.
    for (const expected of state.mustSay) {
      expect(container.textContent).toMatch(expected)
    }
  })

  it.each(STATES)('$name never sends her to a device she is not holding', (state) => {
    const { container } = render(<IngestView {...propsFor(state)} />)

    expect(container.textContent).not.toMatch(FORBIDDEN)
  })
})
