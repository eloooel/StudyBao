/**
 * Smoke-test PDF text extraction against a real PDF, in Node.
 *
 * This is not part of the test suite: it drives a real Web Worker and a real PDF.js parse,
 * which jsdom cannot do, and mocking them would test the mock. It exists to prove the three
 * things typechecking cannot:
 *
 * 1. `pdfjs-dist` actually extracts the text layer (the pure line-joining is unit-tested, but
 *    "does PDF.js return items at all" is not);
 * 2. the **built** worker path resolves — `/pdfjs/build/pdf.worker.min.mjs`, the one
 *    `scripts/copy-pdf-assets.mjs` writes and `vercel.json` caches hard;
 * 3. `hasEOL` behaves as `pdf-lines.ts` assumes, which is an assumption about a third-party
 *    library's output and therefore worth checking against the real thing once.
 *
 * Usage: node scripts/smoke-pdf.mjs [path-to.pdf]
 */
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// The `legacy` build is the one PDF.js documents for Node; the modern build warns and its fake
// worker refuses a relative path. The **path under test is the same file either way**, which is
// the thing this smoke test exists to prove: `/pdfjs/build/pdf.worker.min.mjs` is written by
// `scripts/copy-pdf-assets.mjs`, referenced by `pdfWorkerUrl` in extract-pdf.ts, and cached hard
// by vercel.json.
const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs')

const target = process.argv[2] ?? '.pdf-smoke.pdf'

if (!existsSync(target)) {
  console.error(`${target} is missing. Run \`node scripts/make-test-pdf.mjs\` first.`)
  process.exit(1)
}

const worker = 'public/pdfjs/build/pdf.worker.min.mjs'
if (!existsSync(worker)) {
  console.error(`${worker} is missing. Run \`node scripts/copy-pdf-assets.mjs\` first.`)
  process.exit(1)
}

GlobalWorkerOptions.workerSrc = pathToFileURL(worker).href

const data = new Uint8Array(readFileSync(target))
const task = getDocument({ data })
const pdf = await task.promise

const lines = []
for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
  const page = await pdf.getPage(pageNumber)
  const content = await page.getTextContent()

  let current = []
  for (const item of content.items) {
    if (typeof item.str !== 'string') continue
    current.push(item.str)
    if (item.hasEOL === true) {
      lines.push(current.join(' '))
      current = []
    }
  }
  if (current.length > 0) lines.push(current.join(' '))
}

console.log(`pages: ${String(pdf.numPages)}`)
console.log(`lines: ${String(lines.length)}`)
for (const line of lines) console.log('  |', line)

/*
 * `task.destroy()`, not `pdf.destroy()`.
 *
 * This smoke test originally called `pdf.destroy()` and crashed with "pdf.destroy is not a
 * function" — on the *success* path, after extraction had already worked. `extract-pdf.ts` had
 * the right call, so nothing shipped broken, but it is exactly the kind of thing that only a
 * real parse reveals: it typechecked, and in a `finally` block it would have turned every
 * successful import into an error. Worth the line to record.
 */
await task.destroy()

const expected = ['Vitamin C: ascorbic acid', 'self-esteem - how a person values themselves']
const missing = expected.filter((line) => !lines.includes(line))

if (missing.length > 0) {
  console.error(`\nFAIL: expected lines not extracted: ${missing.join(' / ')}`)
  process.exit(1)
}

console.log(
  '\nOK: the PDF text layer was read, and hasEOL split the lines as pdf-lines.ts assumes.',
)
