/**
 * Copy the Tesseract assets that must be served from our own origin.
 *
 * `tesseract.js` fetches three things from a **CDN by default** — its worker, its WebAssembly
 * core, and the language data. That is 20–30 MB of third-party traffic, it breaks offline use
 * completely, and it is the first of the three traps `docs/WORKFLOW-C-PROMPT.md` names. All
 * three are pointed at our own origin instead:
 *
 * - the **worker** → `public/ocr/worker.min.js`
 * - the **core** → `public/ocr/core/`, the whole directory
 * - the **language data** → `public/ocr/lang/eng.traineddata.gz`, committed to git rather than
 *   copied, because it cannot be derived from `node_modules`. See
 *   `scripts/vendor-ocr-lang.mjs` for which model was chosen and why.
 *
 * ## Why the whole core directory, and not the four files the brief lists
 *
 * The C brief (and `BUILD_GUIDE.md` §3) says `corePath` must point at a directory containing
 * four files: `tesseract-core.wasm.js`, `-simd`, `-lstm`, `-simd-lstm`. That was true of
 * `tesseract.js-core` v5. **The installed v7 ships six variants**, adding `relaxedsimd` and
 * `relaxedsimd-lstm`, and each variant is a pair — a `*.wasm.js` loader and the `*.wasm` it
 * fetches. Tesseract picks between them by device capability, so copying a subset, or pointing
 * `corePath` at one file, is the documented way to break SIMD devices or lose performance.
 *
 * So this copies the directory and then **verifies all twelve expected files are present**,
 * which is what turns "we copied a directory" into "the thing Tesseract needs is there". If a
 * future version changes the set, this script says so instead of shipping a broken photo tab.
 *
 * Idempotent and offline: it copies from `node_modules` and downloads nothing. Run by
 * `predev`/`prebuild`, so a fresh clone needs no extra step.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modules = join(root, 'node_modules')
const destination = join(root, 'public', 'ocr')

const WORKER = { from: join(modules, 'tesseract.js', 'dist', 'worker.min.js'), to: 'worker.min.js' }

/**
 * The core, as an explicit list rather than a directory copy.
 *
 * An allowlist for the same reason the PDF script uses one: a file appearing in a dependency
 * should not start shipping because we happened to copy a directory.
 */
const CORE_VARIANTS = ['', '-lstm', '-simd', '-simd-lstm', '-relaxedsimd', '-relaxedsimd-lstm']
const CORE_FILES = CORE_VARIANTS.flatMap((variant) => [
  `tesseract-core${variant}.wasm.js`,
  `tesseract-core${variant}.wasm`,
])

const LANG = join(destination, 'lang', 'eng.traineddata.gz')

if (!existsSync(modules)) {
  console.error('copy-ocr-assets: node_modules is missing. Run `npm install` first.')
  process.exit(1)
}

const missingSources = [
  WORKER.from,
  ...CORE_FILES.map((name) => join(modules, 'tesseract.js-core', name)),
].filter((path) => !existsSync(path))

if (missingSources.length > 0) {
  console.error(
    `copy-ocr-assets: missing from node_modules:\n  ${missingSources.join('\n  ')}\n` +
      'tesseract.js or tesseract.js-core changed layout. Update this script and the paths in\n' +
      'src/features/ingest/lib/ocr.ts together.',
  )
  process.exit(1)
}

if (!existsSync(LANG)) {
  console.error(
    `copy-ocr-assets: ${LANG} is missing. It is committed to the repository, so this usually\n` +
      'means it was deleted or never checked out. Recreate it with:\n' +
      '  node scripts/vendor-ocr-lang.mjs --force',
  )
  process.exit(1)
}

/*
 * The language file has to arrive at tesseract.js as an actual gzip stream.
 *
 * tesseract.js gunzips it itself, so anything that makes the bytes arrive already decoded breaks
 * the photo tab at runtime with a confusing error, and *no local test catches it* because the
 * breakage happens in transport. There are two ways it happens:
 *
 * 1. the file is not gzip at all — a plain `.traineddata`, or a truncated checkout;
 * 2. a host serves it with `Content-Encoding: gzip`, which the browser then decodes
 *    transparently. That one was real here: `vite preview` and Vercel both gzip a `.gz`, and the
 *    fix is `Content-Encoding: identity` in `vercel.json`. This check is what makes the file half
 *    of that contract provable.
 */
const LANG_MAGIC = readFileSync(LANG).subarray(0, 2)
if (LANG_MAGIC[0] !== 0x1f || LANG_MAGIC[1] !== 0x8b) {
  const found = `${String(LANG_MAGIC[0]?.toString(16))} ${String(LANG_MAGIC[1]?.toString(16))}`
  console.error(
    `copy-ocr-assets: ${LANG} is not a gzip file (first bytes ${found}, expected 1f 8b).\n` +
      'tesseract.js gunzips the language data itself, so anything else breaks the photo tab at\n' +
      'runtime. Recreate it with: node scripts/vendor-ocr-lang.mjs --force',
  )
  process.exit(1)
}

mkdirSync(join(destination, 'core'), { recursive: true })
copyFileSync(WORKER.from, join(destination, WORKER.to))

let coreBytes = 0
for (const name of CORE_FILES) {
  const target = join(destination, 'core', name)
  copyFileSync(join(modules, 'tesseract.js-core', name), target)
  coreBytes += statSync(target).size
}

const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

console.log(
  `copy-ocr-assets: worker + ${String(CORE_FILES.length)} core files (${String(CORE_VARIANTS.length)} capability variants, ${mb(coreBytes)}) ready in public/ocr.`,
)
console.log(
  `copy-ocr-assets: language data ${mb(statSync(LANG).size)} already present (committed, not fetched).`,
)
