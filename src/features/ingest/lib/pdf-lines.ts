/**
 * Turning PDF text items into lines — the pure half of PDF ingest.
 *
 * Kept separate from `extract-pdf.ts` on purpose. That module touches the network and a Web
 * Worker, so nothing in it can be unit-tested; this one is a pure function of a list, so the
 * part that actually decides where the line breaks go is testable. The boundary is drawn
 * where the tests are, per `docs/ai/add-feature.md`.
 *
 * ## Why line breaks matter here more than they look
 *
 * The parser's case 7 exists because OCR and PDF extraction both break mid-sentence, and it
 * joins a continuation back on. That works when the breaks are *plausible*. A PDF text layer
 * usually hands us one item per **word** or per line fragment, in reading order, with a
 * `hasEOL` flag marking where the document itself ended a line. Losing that flag and joining
 * everything into one line would produce a single enormous card; breaking on every item would
 * produce one card per word. So the flag is used when present.
 */

/**
 * The subset of a PDF.js `TextItem` this needs.
 *
 * Structural rather than imported from `pdfjs-dist`: importing the type would drag the whole
 * library's types into a pure module and into its test, for two fields.
 */
export interface PdfTextItemLike {
  str?: string
  hasEOL?: boolean
}

/**
 * Join text items into lines.
 *
 * Items with no `str` are skipped — those are the `TextMarkedContent` entries PDF.js emits
 * for tagged content, which carry no text of their own. A `hasEOL` marks the end of a line.
 * Whatever is left when the items run out is a final line, because a PDF's last line often
 * has no explicit end marker.
 *
 * Whitespace is collapsed per line, and a line that is only whitespace is dropped rather than
 * emitted as an empty string — an empty line would survive `normalize` as nothing at all, so
 * emitting it would only make the provenance indices harder to follow.
 */
export function contentItemsToLines(items: readonly PdfTextItemLike[]): string[] {
  const lines: string[] = []
  let current: string[] = []

  const flush = () => {
    const line = current.join(' ').replace(/\s+/g, ' ').trim()
    if (line.length > 0) lines.push(line)
    current = []
  }

  for (const item of items) {
    const text = item.str
    if (typeof text !== 'string') continue

    current.push(text)
    if (item.hasEOL === true) flush()
  }

  flush()

  return lines
}
