import { BrowserRouter } from 'react-router-dom'

import { ToastProvider } from '@/components/ui/toast'
import { AppRoutes } from '@/router'

/**
 * Providers are ordered outermost-first: toasts wrap the router so a toast can be
 * raised from any route, including one that fails to load.
 */
export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ToastProvider>
  )
}
