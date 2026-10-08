/**
 * Ingest fitness harness — measure the real pipeline against real notes.
 *
 * A **dev tool**, like `scripts/report-precache.mjs` and `scripts/smoke-pdf.mjs`. It is not a
 * test and it is not a fixture: no third-party content is committed, and the PDF paths arrive as
 * arguments. An earlier version of this harness was written, run and deleted, which meant the
 * second run had to rediscover every trap below; committing it is the fix for that.
 *
 * ```
 * node scripts/ingest-fitness.mjs "<path to a handout>.pdf" ["<another>.pdf" ...]
 * node scripts/ingest-fitness.mjs "<path to pasted text>.txt"
 * ```
 *
 * A `.txt`, `.text` or `.md` input skips extraction entirely and is fed straight into
 * `normalize` → `parse`, which is the paste path she actually uses. Each input prints the mode it
 * was read in, and the mode decides which metric rows apply — a text run has no page count or
 * extraction time to report, and printing a `null` for one would be worse than omitting it.
 *
 * ## Why this exists at all
 *
 * The unit suite was green for the entire life of the over-joining defect. It had to be: the
 * provenance invariant counts *coverage*, so a card that swallowed 109 lines and the same 109
 * lines as correct fragments are indistinguishable to it. A measurement on real input is the
 * only thing that can see a wrong join, so it is the acceptance test for that fix.
 *
 * ## The traps, all of which were hit for real
 *
 * - **Import the real modules.** Nothing here reimplements any part of the pipeline, not even
 *   "just the line joining": a harness that reimplements the parser measures the harness.
 * - **`pdfjs-dist` must be its legacy build in Node.** The modern build throws
 *   `TypeError: Promise.try is not a function`. Remapped in `ingest-resolve-hook.mjs`, without
 *   touching `extract-pdf.ts`.
 * - **PDF.js 6 disables the real worker in Node and then treats `workerSrc` as a module path.**
 *   Left as the browser URL it dies with `Setting up fake worker failed: Cannot find module`, so
 *   it is overwritten below with the worker module itself.
 * - **Only `sessionStorage` needs stubbing.** `document`, `window`, `Worker`, `canvas` and
 *   IndexedDB are not needed.
 * - **Do not print extracted text to the console to inspect it.** A UTF-8 string printed to a
 *   console that decodes Latin-1 shows convincing mojibake that is not in the data. This script
 *   therefore prints measurements and short, explicitly-encoded excerpts only.
 */
import { register } from 'node:module'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { basename, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

const repoRoot = resolvePath(fileURLToPath(import.meta.url), '../..')
const require = createRequire(`${repoRoot}/package.json`)

// Registered before the first `src/` import, so the hook is in place for the whole graph.
register('./ingest-resolve-hook.mjs', pathToFileURL(import.meta.filename))

const pdfPaths = process.argv.slice(2)
if (pdfPaths.length === 0) {
  console.error(
    'Usage: node scripts/ingest-fitness.mjs <input> [<input> ...]\n' +
      '  A `.pdf` is extracted with the real PDF pipeline; a `.txt`/`.text`/`.md` is fed\n' +
      '  straight into normalize -> parse with no extraction. Each input reports which mode it used.',
  )
  process.exit(2)
}

/** The one browser API the pipeline touches on the paths measured here. */
globalThis.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

/** Whether an input should skip extraction. Extension only: no content sniffing. */
const isPlainTextPath = (absolute) => /\.(txt|text|md)$/i.test(absolute)
const pdfInputs = pdfPaths.filter((p) => !isPlainTextPath(resolvePath(p)))

const { normalize, normalizeToText } = await import(
  pathToFileURL(`${repoRoot}/src/features/ingest/lib/normalize.ts`).href
)
const { parse } = await import(pathToFileURL(`${repoRoot}/src/features/ingest/lib/parse.ts`).href)
const { saveDraft, DRAFT_SIZE_CEILING_BYTES } = await import(
  pathToFileURL(`${repoRoot}/src/features/ingest/lib/draft-storage.ts`).href
)

/*
 * PDF.js setup, loaded **only when a PDF is actually among the inputs**.
 *
 * A text-only run must not pay for `pdfjs-dist`, and importing `extract-pdf.ts` would drag it in.
 * The import is therefore conditional and dynamic, which is also the shape the app itself uses.
 */
let extractPdfText
let browserWorkerSrc = null
if (pdfInputs.length > 0) {
  ;({ extractPdfText } = await import(
    pathToFileURL(`${repoRoot}/src/features/ingest/lib/extract-pdf.ts`).href
  ))

  /*
   * Point `workerSrc` at a real module **and keep it there**.
   *
   * PDF.js 6 in Node disables the real worker and then treats `workerSrc` as a module path it
   * must import. `extract-pdf.ts` sets it to `/pdfjs/build/pdf.worker.min.mjs?v=…` — correct in
   * a browser, and in Node resolved as `D:\pdfjs\build\pdf.worker.min.mjs`, which dies with
   * `Setting up fake worker failed: Cannot find module`.
   *
   * The assignment cannot simply be redone after the import: `extractPdfText` sets it on every
   * call, and it does so *before* awaiting the document, so any value set here is overwritten
   * first. The accessor below therefore pins the value — the setter accepts the write and keeps
   * the browser URL parked, so a reader of the harness can still see what the app asked for.
   *
   * **This is a finding about coupling, not a harness workaround.** `extractPdfText` is reached
   * from a pure-Node context only through a global that the app also writes. If the pipeline is
   * ever exercised by anything but the browser, the worker URL is the thing that has to become a
   * parameter.
   */
  const pdfjs = await import('pdfjs-dist')
  const nodeWorkerSrc = pathToFileURL(
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ).href
  browserWorkerSrc = pdfjs.GlobalWorkerOptions.workerSrc
  Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', {
    configurable: true,
    get: () => nodeWorkerSrc,
    set: (value) => {
      browserWorkerSrc = value
    },
  })
}

/**
 * A `File`-shaped double. `extractPdfText` only ever calls `arrayBuffer()`, and it must get a
 * **fresh** buffer each time: PDF.js hands the array to its worker by transfer, which detaches
 * it, so a double that re-slices a shared underlying buffer would return nothing on a second
 * read — the real browser `File` does not have that behaviour.
 */
const fileLike = (bytes, fileName) => ({
  name: fileName,
  arrayBuffer: async () => Uint8Array.from(bytes).buffer,
})

const TERMINAL_END = /[.!?…]["'”’)\]]*$/
const lower = (text) => /^[a-z]/.test(text)
const closer = (text) => /^[)\]}"'”’]/.test(text)
const punctuation = (text) => /^[,;:]/.test(text)
const positiveEvidence = (text) => lower(text) || closer(text) || punctuation(text)
const DASH_SEPARATOR = /\s+[-–—]\s+/
const hasSeparatorShape = (text) => text.includes(':') || DASH_SEPARATOR.test(text)

/**
 * The span cap the fix introduced, restated here as a measurement constant.
 *
 * Imported nowhere, on purpose: the same reason `isHeadingLine` is local. This number is what
 * the "truncated definitions" column is measured against, so it has to be a fixed yardstick
 * that both the old and the new parser are judged by — not whatever the parser currently
 * believes. If `parse.ts` and this constant ever disagree, the disagreement is the finding.
 */
const SPAN_CAP = 10

/** Letters only, so punctuation and digits cannot decide whether a line is shouted. */
const lettersOf = (text) => text.replace(/[^\p{L}]/gu, '')

/** `1. VITAMINS` — numbered, with nothing after the marker that suggests a definition. */
const NUMBERED_START = /^(?:\d{1,3}[.):]|\(\d{1,3}\))\s+/
const isNumberedHeading = (text) => {
  const marker = NUMBERED_START.exec(text)
  if (marker === null) return false
  const rest = text.slice(marker[0].length)
  return !rest.includes(':') && !/[a-z]/.test(rest)
}

/**
 * Whether a line is heading-shaped.
 *
 * **Deliberately reimplemented here rather than imported from `parse.ts`.** The harness has to
 * measure the same criterion against both the old and the new parser — and the old module does
 * not export its join rule at all. Borrowing the parser's own predicate would also make the
 * measurement circular: a change to `stopsJoin` would move the metric with it, so a regression
 * in the rule could never show up as a rise in "cards absorbing a heading".
 */
const isHeadingLine = (text) => {
  const letters = lettersOf(text)
  if (letters.length >= 2 && letters === letters.toUpperCase()) return true
  return isNumberedHeading(text)
}

function measureOne(inputPath, rawText, fileName) {
  const normalized = normalize(rawText)
  const lines = normalized.map((line) => line.text)
  const { cards, leftover } = parse(normalized)

  const frontCounts = new Map()
  for (const card of cards) frontCounts.set(card.front, (frontCounts.get(card.front) ?? 0) + 1)
  const sharedFronts = [...frontCounts.values()]
    .filter((count) => count > 1)
    .reduce((total, count) => total + count, 0)

  // "Joins performed" is the number of line breaks the parser absorbed into an entry of any
  // kind — every claimed line except the one each entry started on. Counting only the joins
  // onto *cards* would under-report badly, because the old rule merged far more lines into the
  // leftover queue than into cards, and that merging is exactly what hid the fragmentation.
  const joinedLines = (entry) => entry.sourceLines.length - 1
  const joins = [...cards, ...leftover].reduce((total, entry) => total + joinedLines(entry), 0)
  const cardJoins = cards.reduce((total, card) => total + joinedLines(card), 0)
  const leftoverJoins = leftover.reduce((total, entry) => total + joinedLines(entry), 0)

  // The old fallback's share, measured rather than asserted: the joins that exist only because
  // a missing terminal mark was treated as evidence. A join qualifies when the joining line
  // carries no positive evidence and the line above it does not end a sentence. A line that
  // carries separator punctuation is excluded, because it would have been an *anchor* rather
  // than a join under either rule.
  let fallbackJoins = 0
  for (const entry of [...cards, ...leftover]) {
    for (const lineIndex of entry.sourceLines.slice(1)) {
      const joining = lines[lineIndex] ?? ''
      const above = lines[lineIndex - 1] ?? ''
      if (hasSeparatorShape(joining)) continue
      if (!positiveEvidence(joining) && !TERMINAL_END.test(above)) fallbackJoins += 1
    }
  }

  // A card that "absorbed" a heading is one whose span contains a heading other than its own
  // first line — the "swallowed a section" failure stated directly.
  let absorbedHeadings = 0
  for (const card of cards) {
    const absorbed = card.sourceLines.slice(1).filter((i) => isHeadingLine(lines[i] ?? ''))
    if (absorbed.length > 0) absorbedHeadings += 1
  }

  const spans = cards.map((card) => card.sourceLines.length).sort((a, b) => a - b)
  const longest = spans.length === 0 ? 0 : spans[spans.length - 1]

  // The cap's real cost. A *truncated definition* is a card that ran into the cap and whose
  // next line was itself a definition-shaped line that would otherwise have continued it —
  // i.e. a genuine definition cut in half, not merely a long run of fragments.
  let capHits = 0
  let truncatedDefinitions = 0
  for (const card of cards) {
    if (card.sourceLines.length < SPAN_CAP) continue
    capHits += 1
    const after = lines[(card.sourceLines[card.sourceLines.length - 1] ?? 0) + 1] ?? ''
    if (lower(after) || closer(after)) truncatedDefinitions += 1
  }

  // Provenance, computed from the same `sourceLines` the UI sees rather than from anything
  // internal, so a harness bug cannot flatter the result.
  const claimCount = new Map()
  for (const entry of [...cards, ...leftover]) {
    for (const lineIndex of entry.sourceLines) {
      claimCount.set(lineIndex, (claimCount.get(lineIndex) ?? 0) + 1)
    }
  }
  let doubled = 0
  let unclaimed = 0
  for (let index = 0; index < lines.length; index += 1) {
    const claims = claimCount.get(index) ?? 0
    if (claims === 0) unclaimed += 1
    if (claims > 1) doubled += 1
  }

  const draft = {
    version: 1,
    deckId: 'fitness',
    sourceLabel: fileName,
    sourceText: normalizeToText(rawText),
    cards: cards.map((card, index) => ({
      id: `c${String(index)}`,
      front: card.front,
      back: card.back,
      origin: 'parsed',
      status: 'pending',
      sourceLines: card.sourceLines,
    })),
    leftover,
    convertedLeftoverIds: [],
    startedAt: 0,
  }
  const persist = saveDraft(draft)

  return {
    inputPath,
    fileName,
    pageCount: null,
    lines: lines.length,
    characters: rawText.length,
    joins,
    cardJoins,
    leftoverJoins,
    fallbackJoins,
    cards: cards.length,
    distinctFronts: frontCounts.size,
    sharedFronts,
    absorbedHeadings,
    longest,
    shortFronts: cards.filter((card) => card.front.length <= 3).length,
    capHits,
    truncatedDefinitions,
    leftoverEntries: leftover.length,
    leftoverByReason: leftover.reduce((acc, entry) => {
      acc[entry.reason] = (acc[entry.reason] ?? 0) + 1
      return acc
    }, {}),
    provenance: { claimed: lines.length - unclaimed, total: lines.length, doubled, unclaimed },
    leftoverRateByLine: leftoverRateByLine(lines, cards),
    draftBytes: persist.bytes,
    draftPersisted: persist.persisted,
    ceiling: DRAFT_SIZE_CEILING_BYTES,
  }
}

/**
 * The percentage of input lines that did not become part of a card.
 *
 * Counted in *lines*, not entries: an entry can absorb several lines, so counting entries would
 * flatter a parser that merged a whole page into one leftover blob. Before the join fix that is
 * exactly what happened — 215 leftover entries covering 2,692 lines.
 */
function leftoverRateByLine(lines, cards) {
  if (lines.length === 0) return 0
  const inCards = cards.reduce((total, card) => total + card.sourceLines.length, 0)
  return (lines.length - inCards) / lines.length
}

/** Read one input and measure it. PDFs are extracted; text files go straight to `normalize`. */
async function runOne(inputPath) {
  const absolute = resolvePath(inputPath)
  const fileName = basename(absolute)

  if (isPlainTextPath(absolute)) {
    const raw = await readFile(absolute, 'utf8')
    process.stdout.write(`\nReading ${fileName} as plain text (no extraction) …\n`)
    const metrics = measureOne(absolute, raw, fileName)
    return { ...metrics, fileKind: 'text', extractionMs: null, pageCount: null, looksScanned: null }
  }

  const bytes = new Uint8Array(await readFile(absolute))
  process.stdout.write(`\nReading ${fileName} as a PDF …\n`)
  const started = performance.now()
  const extracted = await extractPdfText(fileLike(bytes, fileName))
  const elapsedMs = performance.now() - started

  const metrics = measureOne(absolute, extracted.text, fileName)
  return {
    ...metrics,
    fileKind: 'pdf',
    pageCount: extracted.pageCount,
    looksScanned: extracted.looksScanned,
    extractionMs: Math.round(elapsedMs),
  }
}

const results = []
for (const inputPath of pdfPaths) {
  results.push(await runOne(inputPath))
}

const rows = [
  // `modes` decides which rows print for which input kind, so a text run does not render a page
  // count of "null". PDF-only rows are exactly the ones extraction produces.
  [
    'Input read as',
    (r) => (r.fileKind === 'pdf' ? 'PDF (extracted)' : 'plain text (no extraction)'),
    ['pdf', 'text'],
  ],
  ['Pages', (r) => r.pageCount, ['pdf']],
  ['Text layer', (r) => (r.looksScanned ? 'NONE (scan)' : 'yes'), ['pdf']],
  ['Extraction wall-clock (ms)', (r) => r.extractionMs, ['pdf']],
  ['Characters after extraction', (r) => r.characters, ['pdf']],
  ['Lines after normalize', (r) => r.lines, ['pdf', 'text']],
  ['Joins performed (into cards and leftovers)', (r) => r.joins, ['pdf', 'text']],
  ['  …into cards', (r) => r.cardJoins, ['pdf', 'text']],
  ['  …into leftover runs', (r) => r.leftoverJoins, ['pdf', 'text']],
  ['Joins a missing terminal mark alone would allow', (r) => r.fallbackJoins, ['pdf', 'text']],
  ['Cards produced', (r) => r.cards, ['pdf', 'text']],
  ['Distinct fronts', (r) => r.distinctFronts, ['pdf', 'text']],
  ['Cards sharing a front', (r) => r.sharedFronts, ['pdf', 'text']],
  ['Cards absorbing a mid-span heading', (r) => r.absorbedHeadings, ['pdf', 'text']],
  ['Longest card (source lines)', (r) => r.longest, ['pdf', 'text']],
  ['Cards with a front <=3 characters', (r) => r.shortFronts, ['pdf', 'text']],
  [`Cards at the span cap (${String(SPAN_CAP)} lines)`, (r) => r.capHits, ['pdf', 'text']],
  ['  …of those, definitions actually truncated', (r) => r.truncatedDefinitions, ['pdf', 'text']],
  ['Leftover entries', (r) => r.leftoverEntries, ['pdf', 'text']],
  ['Leftover rate, by line', (r) => `${(r.leftoverRateByLine * 100).toFixed(2)}%`, ['pdf', 'text']],
  [
    'Draft bytes / ceiling',
    (r) =>
      `${String(r.draftBytes)} / ${String(r.ceiling)}${r.draftPersisted ? '' : ' (not persisted)'}`,
    ['pdf', 'text'],
  ],
  [
    'Provenance',
    (r) =>
      `${String(r.provenance.claimed)}/${String(r.provenance.total)} claimed, ${String(r.provenance.doubled)} double, ${String(r.provenance.unclaimed)} unclaimed`,
    ['pdf', 'text'],
  ],
]

/** The rows that apply to one result, so a text input never renders a PDF-only metric. */
const rowsFor = (result) => rows.filter(([, , modes]) => modes.includes(result.fileKind))

for (const result of results) {
  console.log(`\n=== ${result.fileName} (${result.fileKind}) ===`)
  for (const [name, pick] of rowsFor(result)) {
    console.log(`${name.padEnd(48)} ${String(pick(result))}`)
  }
  console.log(`${'Leftover by reason'.padEnd(48)} ${JSON.stringify(result.leftoverByReason)}`)
}

console.log(
  `\nPer-file metrics are deterministic: the same input yields the same numbers, so a rerun is a check rather than a new baseline.`,
)
if (pdfInputs.length > 0) {
  console.log(`workerSrc the app set (unused in Node): ${browserWorkerSrc}`)
}

// Deliberately shaped as a table so a before/after pair can be pasted side by side.
if (results.length > 0) {
  console.log('\n=== compact (metric | each input) ===')
  const header = ['metric', ...results.map((r) => r.fileName)]
  console.log(header.join(' | '))
  // Only the rows that apply to *every* input kind, so the compact table stays rectangular.
  const commonRows = rows.filter(([, , modes]) => modes.length === 2)
  for (const [name, pick] of commonRows) {
    console.log([name, ...results.map((r) => String(pick(r)))].join(' | '))
  }
}
