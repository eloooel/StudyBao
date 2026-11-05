import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { pwaOptions } from './src/pwa.config'

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // Fail loudly rather than shipping a bundle that silently breaks the
    // offline shell on a slow connection.
    chunkSizeWarningLimit: 700,

    rollupOptions: {
      output: {
        /*
         * The sync chunks get their own directory, and the whole Firebase SDK goes into one chunk.
         *
         * Two reasons, both about her 3 GB iPad:
         *
         * 1. `globIgnores` in `src/pwa.config.ts` works on paths. A dedicated `assets/sync/` is a
         *    pattern that cannot accidentally match an app chunk later, which a `sync-*.js` name could.
         * 2. Without `manualChunks`, Firebase emits four separate `index.esm-*.js` chunks whose names
         *    say nothing. One chunk means one ignore and one number to report.
         *
         * This groups modules; it does not make anything eager. The only import edge into this directory
         * is the dynamic `import()` behind the flag in `src/sync/index.ts`.
         */
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](firebase|@firebase)[\\/]/.test(id)) return 'sync-firebase'
        },

        // Entry files use `entryFileNames`; this only renames lazy chunks. Anything reached from
        // `src/sync/` lands in `assets/sync/`, which is what the PWA config ignores.
        chunkFileNames(chunk) {
          const facade = chunk.facadeModuleId ?? ''
          const isSync = facade.includes('/src/sync/') || chunk.name === 'sync-firebase'
          return isSync ? 'assets/sync/[name]-[hash].js' : 'assets/[name]-[hash].js'
        },
      },
    },
  },
})
