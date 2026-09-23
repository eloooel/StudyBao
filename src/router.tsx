import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/app-shell'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Route pages are lazy-loaded so the first paint is the shell, not every screen.
 * Each page is a default export, which is the one place this codebase allows one
 * (see CLAUDE.md).
 *
 * Exported as `AppRoutes` rather than a router so tests can wrap it in whatever
 * router they need.
 */
const DashboardPage = lazy(() => import('@/features/dashboard/pages/dashboard.page'))
const FlashcardsPage = lazy(() => import('@/features/flashcards/pages/flashcards.page'))
const TimerPage = lazy(() => import('@/features/timer/pages/timer.page'))
const TrackerPage = lazy(() => import('@/features/tracker/pages/tracker.page'))
const SettingsPage = lazy(() => import('@/features/settings/pages/settings.page'))

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <span className="text-sm text-ink-muted">Loading…</span>
    </div>
  )
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="cards" element={<FlashcardsPage />} />
          <Route path="timer" element={<TimerPage />} />
          <Route path="lessons" element={<TrackerPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="*"
            element={
              <EmptyState
                title="That page doesn't exist"
                message="The link may be old, or mistyped. Everything lives in the bar at the bottom."
                action={
                  <Button variant="secondary" onClick={() => window.history.back()}>
                    Go back
                  </Button>
                }
              />
            }
          />
        </Route>
      </Routes>
    </Suspense>
  )
}
