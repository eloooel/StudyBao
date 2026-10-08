import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
