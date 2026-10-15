import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /**
       * `virtual:pwa-register/react` is resolved by the PWA plugin, and this config deliberately
       * uses only `@vitejs/plugin-react`. Tests that render `AppShell` pull in
       * `src/lib/use-app-update.ts`, which imports it, so without this alias that import cannot
       * resolve and those tests fail to collect.
       *
       * The stub is a no-op rather than a fake: it reports "nothing to update" and does nothing when
       * asked, so it cannot make a test pass that would otherwise fail. The behaviour worth asserting
       * lives in `UpdatePrompt`, which takes props and knows nothing about service workers.
       */
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/test/pwa-register-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    /**
     * Deliberately above the per-wait budget the integration tests use.
     *
     * A wait's own `timeout` must be **strictly less** than the test's, or the wait
     * can never report its own failure: vitest kills the test first and the report
     * says only "Test timed out in Nms", naming no element. Four test files used
     * `WAIT = { timeout: 5000 }` against vitest's 5000ms default, so a missing
     * element was indistinguishable from a slow one — and under coverage contention
     * `tracker.test.tsx` actually failed on this machine, which would have made CI
     * red and the gate worthless.
     *
     * The invariant: **test timeout > wait budget**. Both are raised here rather
     * than lowering the waits, because the headroom was the real problem — a
     * database seed plus a first render legitimately costs seconds under load.
     */
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/pwa.config.ts',
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
        /*
         * The one module that imports `virtual:pwa-register/react`. Excluded for the same reason
         * `main.tsx` and `pwa.config.ts` are: it is integration with the build rather than logic.
         * Its eight lines pass the plugin's values through, and a test could only assert that the
         * stub aliased above returns what that stub was written to return — which would raise the
         * number without testing anything. The behaviour worth pinning is in `UpdatePrompt`, which
         * takes props, and is covered.
         */
        'src/lib/use-app-update.ts',
      ],
      // The floor, not the goal. It tracks the actual enforced value — do not
      // restate this number in prose anywhere; see docs/adr and CLAUDE.md.
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
})
