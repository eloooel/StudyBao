import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/App'
import { initTheme } from '@/lib/theme-store'
import { startCloudSync } from '@/sync'
import '@/styles/theme.css'

// Apply the stored-or-system theme before the first paint, so there is no flash of
// the wrong theme on a slow iPad.
initTheme()

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element #root is missing from index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/*
 * Cloud sync, fire-and-forget. **With the flag off — the shipped value — this returns before it imports
 * anything**, so no Firestore code is requested and the study loop is untouched. Do not await it: a
 * network-shaped feature must never stand between her and the first card. Milestone 2b owns what happens
 * once it reports `ready`.
 */
void startCloudSync()
