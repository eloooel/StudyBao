/**
 * Node ESM resolve hook for reading the ingest pipeline's real modules.
 *
 * Registered by `scripts/ingest-fitness.mjs` before it imports anything from `src/`. Two
 * remaps, and both are forced by the fact that this pipeline is written for a bundler:
 *
 *   1. **Extensionless relative imports** (`./normalize`). Vite resolves those; Node does not.
 *   2. **`pdfjs-dist` → its legacy build.** The modern build throws
 *      `TypeError: Promise.try is not a function` on Node 22.
 *
 * The second remap is deliberately done here rather than in `extract-pdf.ts`. Editing a source
 * file so a measurement script can import it would mean the harness measures something other
 * than what ships, and the coupling it exposes is a finding in its own right — see the note in
 * `docs/INGEST-JOIN-FIX.md`.
 *
 * `@/` is intentionally not mapped: nothing in the ingest `lib/` chain reaches across it except
 * type-only imports, which type-stripping erases before resolution. If that ever stops being
 * true, this hook is the one place that needs the alias.
 *
 * A `.ts` file must be returned with `format: 'module-typescript'`. Without it Node treats the
 * source as plain ESM and dies on the first `import type`, which is a confusing failure because
 * it looks like a syntax error in the project rather than in the hook.
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'

const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(`${repoRoot}/package.json`)

const PDFJS_LEGACY = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href

/** A relative specifier Node cannot find, but a bundler could. */
function resolveWithExtensions(base) {
  for (const suffix of ['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx']) {
    const candidate = base + suffix
    if (!existsSync(candidate)) continue
    return {
      url: pathToFileURL(candidate).href,
      format: suffix === '.ts' || suffix === '.tsx' ? 'module-typescript' : 'module',
    }
  }
  return undefined
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'pdfjs-dist') {
    return { url: PDFJS_LEGACY, format: 'module', shortCircuit: true }
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentPath =
      context.parentURL === undefined ? repoRoot : dirname(fileURLToPath(context.parentURL))
    const resolved = resolveWithExtensions(resolvePath(parentPath, specifier))
    if (resolved !== undefined) return { ...resolved, shortCircuit: true }
  }

  return nextResolve(specifier, context)
}
