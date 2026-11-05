import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * The **rules** suite, kept out of the default `vitest run` on purpose.
 *
 * It needs the Firestore emulator, which needs Java and takes minutes. `docs/SYNC-TRANSPORT.md` is
 * explicit that adding that to the main gate is the wrong trade: a flaky gate is worse than no gate, and
 * the gate has been green for twenty-odd PRs. So this config exists, `npm run test:rules` points at it,
 * and the PR says plainly that the security boundary is verified locally rather than by CI.
 *
 * Run it the way the rules were meant to run:
 *
 *   firebase emulators:exec --only firestore "npm run test:rules"
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['rules/**/*.test.ts'],
    // The emulator round-trip includes a cold start and a network-shaped call; the default 5 s is not
    // enough on this machine and a timeout would look like a rules failure.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // One emulator, one project: parallel files would clear each other's fixtures.
    fileParallelism: false,
  },
})
