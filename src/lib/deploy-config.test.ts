import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The deploy contract, guarded.
 *
 * **Why this test exists, and why it is under `src/`.** Vercel's first deploy failed with
 * *"should NOT have additional property `//`. Please remove it."* — `vercel.json` had been using `//`
 * and `//2` keys as JSON comments, which every local tool ignores and Vercel's schema rejects. Nothing
 * in the repository validated that file, so the problem was unreachable until a real deploy, and it
 * cost a failed deploy days before the reveal. Vitest only collects from `src/**`, which is the only
 * reason a deploy-config test lives here.
 *
 * It cannot validate the whole Vercel schema — that would need the network and a JSON-schema library.
 * It guards the two things that have actually gone wrong: an **unknown top-level key**, and the loss of
 * the header that the photo tab depends on. `findings` are deliberately local; the reasoning for each
 * header is in `docs/HANDOFF.md` §6 and `docs/BUILD_GUIDE.md` §3.
 */

interface VercelConfig {
  rewrites?: { source: string; destination: string }[]
  headers?: { source: string; headers: { key: string; value: string }[] }[]
  [key: string]: unknown
}

/**
 * Read from `process.cwd()` rather than `import.meta.url`: under Vitest's jsdom transform
 * `import.meta.url` is an `http://` URL rather than a `file://` one, and `readFileSync` rejects it with
 * *"The URL must be of scheme file"*. Vitest's cwd is the repository root, locally and in CI.
 */
const config = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as VercelConfig

/**
 * Every key Vercel actually accepts for this project. An unknown key is rejected at deploy time with
 * the one-at-a-time error above, so anything added here must be a deliberate decision rather than a
 * comment that looked harmless.
 */
const ALLOWED_KEYS = ['rewrites', 'headers', 'redirects', 'cleanUrls', 'trailingSlash', 'regions']

function headerFor(source: string) {
  return config.headers?.find((entry) => entry.source === source)
}

describe('vercel.json', () => {
  it('has no top-level key Vercel would reject', () => {
    const unknown = Object.keys(config).filter((key) => !ALLOWED_KEYS.includes(key))

    expect(unknown, `Vercel rejects unknown top-level properties one at a time`).toEqual([])
  })

  it('contains no comment keys, which is the way this file actually broke', () => {
    // JSON has no comments. `$schema` is not a comment but is also not needed at deploy time, and it
    // was removed alongside them rather than risking a second failure for the same class of reason.
    expect(Object.keys(config).filter((key) => key.startsWith('//'))).toEqual([])
    expect(Object.keys(config)).not.toContain('$schema')
  })

  it('serves index.html for every extensionless path, so deep links survive a reload', () => {
    expect(config.rewrites).toEqual([{ source: '/((?!.*\\.).*)', destination: '/index.html' }])
  })

  it('pins Content-Encoding: identity on the OCR language data, which is load-bearing', () => {
    // The file is itself gzip. Served with `Content-Encoding: gzip`, the browser decodes it
    // transparently, tesseract.js receives the inner LZMA payload, and its own gunzip step fails —
    // the photo tab breaks on deploy while every local test passes. See HANDOFF §6.
    const entry = headerFor('/ocr/lang/(.*)')

    expect(entry, 'the /ocr/lang/ header entry is missing entirely').toBeDefined()
    expect(entry?.headers).toContainEqual({ key: 'Content-Encoding', value: 'identity' })
  })

  it('never long-caches the service worker, or an update could not reach her', () => {
    const entry = headerFor('/sw.js')

    expect(entry).toBeDefined()
    expect(entry?.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=0, must-revalidate',
    })
  })

  it('long-caches the vendored decoder assets, which are immutable by name', () => {
    for (const source of ['/pdfjs/wasm/(.*)', '/ocr/(.*)']) {
      const entry = headerFor(source)

      expect(entry, `${source} is missing`).toBeDefined()
      expect(entry?.headers).toContainEqual({
        key: 'Cache-Control',
        value: 'public, max-age=31536000, immutable',
      })
    }
  })
})
