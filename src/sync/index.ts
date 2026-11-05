import type { FirebaseClient } from './firestore/client'

/**
 * The sync entry point, and the **only** place the flag is read.
 *
 * With `VITE_ENABLE_CLOUD_SYNC` off — which is the default and the shipped value — this module's one
 * exported starter returns before it imports anything. No Firestore SDK, no connection, no constructor,
 * no log line. The dynamic import below is the single door to the sync chunk, and it is behind the flag.
 *
 * Milestone 2b owns everything that uses the client once it exists: Google sign-in, the first sync, and
 * the "not saved since…" surface. This module deliberately does neither — it is the switch 2b flips, not
 * a second implementation of the feature.
 *
 * ## Why the flag check lives in a function
 *
 * `import.meta.env.VITE_ENABLE_CLOUD_SYNC` is statically replaced at build time. Written inline, a
 * production build with no `.env` would see `undefined === 'true'`, fold it to `false`, and drop the
 * import entirely — which makes the "the sync chunk never leaks into the entry bundle" check vacuous,
 * because there would be no chunk to leak. The function keeps the decision a runtime one, so the chunk
 * exists, is excluded from the precache, and is never requested. `scripts/check-sync-inert.mjs` proves
 * the entry chunk is clean either way.
 */

export type CloudSyncStartup =
  | { status: 'disabled' }
  | { status: 'not-configured' }
  | { status: 'ready'; client: FirebaseClient }
  | { status: 'failed'; reason: string }

export function isCloudSyncEnabled(
  flag: string | undefined = import.meta.env.VITE_ENABLE_CLOUD_SYNC,
): boolean {
  return flag === 'true'
}

/**
 * Load the sync client when — and only when — the flag says so.
 *
 * Never rejects: it is called fire-and-forget from the entry, and a rejected promise there would be an
 * unhandled rejection on her device for a feature that is off. The caller gets a status instead.
 */
export async function startCloudSync(
  flag: string | undefined = import.meta.env.VITE_ENABLE_CLOUD_SYNC,
): Promise<CloudSyncStartup> {
  if (!isCloudSyncEnabled(flag)) return { status: 'disabled' }

  try {
    // The one dynamic import of the sync module. Everything Firestore lives below it.
    const { createFirebaseClient } = await import('./firestore/client')
    const client = await createFirebaseClient()

    return client === null ? { status: 'not-configured' } : { status: 'ready', client }
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'unknown error',
    }
  }
}
