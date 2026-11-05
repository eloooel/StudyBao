import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Flag-off inertness, asserted against the built output rather than against intent.
 *
 * Two properties, both of which would otherwise be claims in a comment:
 *
 *   1. The **entry chunk contains no Firestore SDK**. With `VITE_ENABLE_CLOUD_SYNC` off, nothing on the
 *      boot path may pull the SDK in — not statically, and not into a chunk the browser fetches eagerly.
 *   2. Any chunk that *does* contain the SDK is **not in the precache manifest**. Her device is a 3 GB
 *      iPad and this is an offline app: a lazy chunk that gets precached is downloaded on first load and
 *      kept forever, which defeats the laziness entirely. `src/pwa.config.ts` ignores `assets/sync/**`;
 *      this checks that the ignore is real, because an ignore list is a claim until the manifest is read.
 *
 * The marker is a set of strings that exist inside the SDK and nowhere in this repository's own code.
 * An earlier version matched the bare word "firebase" and failed the build because the entry chunk
 * contains the identifier `createFirebaseClient` — a false positive that says nothing about the SDK.
 * A check that cries wolf gets deleted, so the marker is narrow on purpose.
 *
 * Run by `postbuild`, so a build that leaks the SDK fails instead of shipping.
 */

const DIST = 'dist'
const ASSETS = join(DIST, 'assets')
const SDK_MARKER = /@firebase\/|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com/

function fail(message) {
  console.error(`check-sync-inert: ${message}`)
  process.exit(1)
}

/** Paths as the precache manifest and URLs spell them: forward slashes, no leading slash. */
function toUrlPath(path) {
  return relative(DIST, path).split(sep).join('/')
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

const indexPath = join(DIST, 'index.html')
const swPath = join(DIST, 'sw.js')

if (!existsSync(indexPath) || !existsSync(swPath) || !existsSync(ASSETS)) {
  fail(`no built output found in ${DIST}/. Run \`npm run build\` first.`)
}

const html = readFileSync(indexPath, 'utf8')
const entrySources = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map((match) =>
  match[1].replace(/^\//, ''),
)

if (entrySources.length === 0) {
  fail('could not find the entry script in dist/index.html — this check would assert nothing.')
}

for (const source of entrySources) {
  const path = join(DIST, source)
  if (!existsSync(path)) fail(`the entry script ${source} named by index.html does not exist.`)

  if (SDK_MARKER.test(readFileSync(path, 'utf8'))) {
    fail(
      `the entry chunk ${source} contains the Firestore SDK. With VITE_ENABLE_CLOUD_SYNC off, the ` +
        'SDK must not be reachable from the boot path: every firebase import belongs behind the flag ' +
        'in src/sync/index.ts.',
    )
  }
}

const precached = new Set(
  [...readFileSync(swPath, 'utf8').matchAll(/url:"([^"]+)"/g)].map((match) =>
    match[1].replace(/^\//, ''),
  ),
)

const carriers = walk(ASSETS)
  .filter((path) => path.endsWith('.js'))
  .map((path) => ({
    path,
    url: toUrlPath(path),
    bytes: statSync(path).size,
    hasSdk: SDK_MARKER.test(readFileSync(path, 'utf8')),
  }))
  .filter((entry) => entry.hasSdk)

let leaked = false

for (const carrier of carriers) {
  const inPrecache = precached.has(carrier.url)
  leaked ||= inPrecache

  console.log(
    `${inPrecache ? 'PRECACHED' : 'lazy     '} ${carrier.url} — ${String(
      Math.round(carrier.bytes / 1024),
    )} KiB`,
  )
}

if (leaked) {
  fail(
    'a Firestore-carrying chunk is in the precache manifest. Add it to `globIgnores` in ' +
      'src/pwa.config.ts: precaching a lazy chunk is what makes every user pay for it on first load.',
  )
}

console.log(
  carriers.length === 0
    ? 'check-sync-inert: ok — no Firestore-carrying chunk is emitted with the flag off.'
    : `check-sync-inert: ok — ${String(carriers.length)} Firestore chunk(s), none precached, none in the entry.`,
)
