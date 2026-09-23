import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/App'
import { initTheme } from '@/lib/theme-store'
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
