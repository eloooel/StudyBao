/**
 * Copy the PDF.js assets that must be served from our own origin.
 *
 * `pdfjs-dist` ships two things the library fetches **at runtime**, and both default to a
 * remote URL if left alone. This app has to work with the network off, so both are pointed at
 * our own origin:
 *
 * - the **worker** (`pdf.worker.min.mjs`), which PDF.js runs in a Web Worker. Its path is
 *   resolved by Vite in `src/features/ingest/lib/extract-pdf.ts`, so only the wasm halves are
 *   copied here.
 * - the **wasm image decoders**, used only for PDFs with JBIG2, JPEG-2000 or an ICC colour
 *   profile. Ordinary text PDFs never touch them, which is why they are copied but fetched
 *   only on demand.
 *
 * ## What is deliberately not copied
 *
 * - `quickjs-eval.wasm` / `quickjs-eval.js` — PDF.js uses these to run JavaScript embedded in
 *   a PDF. Copying them would **enable** that in this app, which means executing code out of a
 *   document she was sent, on a device holding her study history. Without the files, PDF.js
 *   simply does not run document script. This is a security decision, not a size one, and the
 *   allowlist below is what enforces it.
 * - `cmaps/` (169 files, ~1.4 MB) and the standard-font data. Both matter for CJK text and for
 *   PDFs relying on the 14 standard fonts; her notes are English. If a PDF ever reads as boxes,
 *   copy those directories too — lazily, not into the precache.
 *
 * Idempotent and offline: it copies from `node_modules`, downloads nothing, and re-running it
 * is a no-op. Run by `prebuild`/`predev`, so a fresh clone needs no extra step.
 *
 * Same reasoning as `scripts/generate-icons.mjs`: a build that needs the network to produce an
 * offline-capable app is a contradiction, and a fresh clone that cannot build is a trap.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', 'pdfjs-dist')
const destination = join(root, 'public', 'pdfjs')

/**
 * The worker, plus the wasm image decoders. An allowlist, so a file added to pdfjs-dist cannot
 * start shipping without a decision here.
 *
 * The worker is vendored rather than left to Vite's `?url` because `extract-pdf.ts` imports
 * PDF.js **dynamically**, so that the ~350 KB library is not in the eagerly-loaded ingest
 * chunk, and Vite cannot combine `?url` with a dynamic import. Vendoring it keeps the lazy
 * load possible; `?v=` in `pdfWorkerUrl` is what keeps it from being stale.
 */
const ASSETS = [
  'build/pdf.worker.min.mjs',
  'wasm/jbig2.wasm',
  'wasm/jbig2_nowasm_fallback.js',
  'wasm/openjpeg.wasm',
  'wasm/openjpeg_nowasm_fallback.js',
  'wasm/qcms_bg.wasm',
]

if (!existsSync(source)) {
  console.error(
    `copy-pdf-assets: ${source} is missing. Run \`npm install\` first — pdfjs-dist is a dependency.`,
  )
  process.exit(1)
}

const missing = ASSETS.filter((name) => !existsSync(join(source, name)))

if (missing.length > 0) {
  console.error(
    `copy-pdf-assets: expected ${missing.join(', ')} in ${source}. pdfjs-dist's layout changed; update this script and pdfWorkerUrl in extract-pdf.ts together.`,
  )
  process.exit(1)
}

let totalBytes = 0
for (const name of ASSETS) {
  const target = join(destination, name)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join(source, name), target)
  totalBytes += statSync(target).size
}

console.log(
  `copy-pdf-assets: worker + ${String(ASSETS.length - 1)} decoder files ready in public/pdfjs (${String(Math.round(totalBytes / 1024))} KB; PDF document script deliberately excluded).`,
)
