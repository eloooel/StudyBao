/**
 * PWA configuration, kept in `src/` rather than inline in `vite.config.ts` so the
 * manifest can be type-checked against the same tokens the app uses.
 *
 * Strategy is `generateSW` (the default). That is deliberate and recorded in
 * docs/adr/0006-in-app-notifications-only.md: there is no push handler to add,
 * so the generated Workbox worker does the one job left — offline caching.
 * If notifications ever need a hand-written worker, this must switch to
 * `injectManifest` and the critique's note in docs/CRITIQUE.md (B3) applies again.
 */
import type { VitePWAOptions } from 'vite-plugin-pwa'

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  injectRegister: 'auto',
  includeAssets: ['favicon.svg', 'apple-touch-icon.png'],

  manifest: {
    name: 'StudyBao',
    short_name: 'StudyBao',
    description:
      'A study companion for PNLE review: flashcards, a Pomodoro timer, and a lesson tracker.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    lang: 'en',
    dir: 'ltr',
    // Matches --color-primary / --color-canvas in src/styles/theme.css
    theme_color: '#F5A9B8',
    background_color: '#FFF9FA',
    categories: ['education', 'productivity'],
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },

  workbox: {
    // The whole shell must work offline. Fonts are self-hosted, so they belong here.
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],

    /*
     * ─────────────────────────────────────────────────────────────────────────────
     * `globPatterns` above is an ALLOWLIST, and that is not enough on its own.
     *
     * It is a list of *extensions*, and an excluded asset therefore only stays out of
     * the precache by an accident of its file extension. `docs/WORKFLOW-C-PROMPT.md`
     * names the hazard: a 20 MB precache would slow the **first load** of the app for
     * every user forever, for a feature she may rarely use. Adding `gz` or `wasm` to
     * that list later — a one-word change that looks harmless — would do exactly that.
     *
     * So the heavy, on-demand ingest assets are named here instead, and the ignore is
     * deliberate rather than incidental:
     *
     * - `pdfjs/**` — the PDF.js worker and image decoders. Fetched only when a PDF is
     *   opened. Note this **did** catch two `*_nowasm_fallback.js` files (~600 KB)
     *   before this ignore existed, purely because they end in `.js`: precisely the
     *   accident described above, found by reading the generated manifest rather than
     *   by trusting the extension list. Budget before/after: 88 entries / 2143 KiB →
     *   86 entries / 1128 KiB.
     * - `assets/pdf-*.js` — PDF.js itself. It is imported dynamically from
     *   `extract-pdf.ts` so the library is not in the ingest chunk (436 KB → 10 KB, measured),
     *   but Vite still emits it as a `.js` chunk, so the allowlist would precache it right
     *   back. **Precaching a lazy chunk defeats the laziness entirely**: she would pay its
     *   full weight on first load for a tab she may never open. Excluded here and fetched on
     *   demand instead.
     * - `ocr/**` — the Tesseract worker, its WebAssembly core, and the language data.
     *   Fetched only when the photo tab is opened.
     *
     * Verified with `node scripts/report-precache.mjs`, which reads the generated manifest
     * rather than trusting this list. Re-run it after touching the PWA config.
     *
     * Everything ignored here is covered instead by runtime caching (`runtimeCaching` below),
     * so it becomes offline-capable **after** first use. That is the honest trade: her first
     * photo or PDF import needs the network, and every one after it does not.
     * ─────────────────────────────────────────────────────────────────────────────
     */
    globIgnores: ['**/pdfjs/**', '**/ocr/**', '**/assets/pdf-*.js'],

    /*
     * Runtime caching for the same assets, so a deliberate ignore does not mean "never
     * available offline". `CacheFirst` because these files are content-addressed by name and
     * never rewritten in place, so a cached copy is never stale. The entry counts and the
     * 30-day expiry are there so a future re-vendor cannot grow this cache unbounded.
     */
    runtimeCaching: [
      {
        urlPattern: /\/pdfjs\/.*\.(?:wasm|js)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'studybao-pdfjs',
          expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        urlPattern: /\/ocr\/.*\.(?:wasm|js|gz|traineddata)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'studybao-ocr',
          expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 60 },
        },
      },
    ],

    cleanupOutdatedCaches: true,
    clientsClaim: true,
    // Deep links are handled by the app router, so a navigation fallback is safe.
    navigateFallback: 'index.html',
  },

  devOptions: {
    // The service worker is not exercised in dev; verify with build + preview.
    enabled: false,
  },
}
