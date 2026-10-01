/**
 * One-time vendoring of the English language data into `public/ocr/lang/`.
 *
 * **This is not a build step and must not become one.** A build that needs the network to
 * produce an offline-capable app is a contradiction, and a fresh clone that cannot build is a
 * trap — so the `.gz` this produces is committed to the repository. This script exists so the
 * choice is reproducible and its provenance is recorded, not so it can run in CI.
 *
 * ## What it downloads, and why this variant
 *
 * `tessdata_fast`'s `eng.traineddata` (**4,113,088 bytes**), not the default
 * `tessdata`/`tessdata_best` model that `tessdata.projectnaptha.com` serves as
 * `eng.traineddata.gz` (**10,923,060 bytes** gzipped). The instruction was to prefer the
 * smaller/faster variant unless accuracy testing says otherwise; §3 of the build guide already
 * labels photo OCR best-effort and points at her phone's Live Text for anything hard, so the
 * ~6.8 MB saving is the better trade for a feature she may use rarely. If accuracy ever looks
 * poor on her real notes, swapping to the full model is this one file.
 *
 * The container is gzip because tesseract.js computes the language URL as
 * `langPath + langCode + '.traineddata.gz'` — the extension is not optional.
 *
 * Usage: node scripts/vendor-ocr-lang.mjs [--force]
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const destination = join(root, 'public', 'ocr', 'lang', 'eng.traineddata.gz')

/**
 * Pinned to a commit, not a branch.
 *
 * A branch would make this script produce a different file next year with no diff to show for
 * it, and the whole point of committing the output is that it does not drift. This is
 * `tessdata_fast` main as of 2024-08-01, the most recent commit to that repository.
 */
const SOURCE =
  'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/eng.traineddata'

/** Recorded so the vendored file can be re-verified without trusting this script's URL. */
const EXPECTED_SHA256 = 'b130d16b69e3888bc099133991a50a5b50e1da0e3ff6ca31a5496fab0fb386c3'

const force = process.argv.includes('--force')

if (existsSync(destination) && !force) {
  console.log(
    `vendor-ocr-lang: ${destination} already exists. Pass --force to replace it. Nothing written.`,
  )
  process.exit(0)
}

console.log(`vendor-ocr-lang: fetching ${SOURCE}`)

const response = await fetch(SOURCE)
if (!response.ok) {
  console.error(`vendor-ocr-lang: HTTP ${String(response.status)} from ${SOURCE}`)
  process.exit(1)
}

const raw = new Uint8Array(await response.arrayBuffer())
const gzipped = gzipSync(raw, { level: 9 })

mkdirSync(dirname(destination), { recursive: true })
writeFileSync(destination, gzipped)

const sha256 = createHash('sha256').update(gzipped).digest('hex')
const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`

console.log(`vendor-ocr-lang: raw ${mb(raw.length)} → gzipped ${mb(gzipped.length)}`)
console.log(`vendor-ocr-lang: sha256 ${sha256}`)

if (EXPECTED_SHA256 !== 'PENDING' && sha256 !== EXPECTED_SHA256) {
  console.error(
    `vendor-ocr-lang: sha256 mismatch. Expected ${EXPECTED_SHA256}, got ${sha256}. The pinned source changed; do not commit this file until you have looked at why.`,
  )
  process.exit(1)
}

console.log(`vendor-ocr-lang: wrote ${destination}`)
