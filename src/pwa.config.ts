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
