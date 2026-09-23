import { DashboardView } from '../components/dashboard-view'

/**
 * Layer 1 — the route component, deliberately thin.
 *
 * The zeroes are placeholders for Workflow F. There is no data layer yet, so
 * there is no Layer 2 hook to call; when the dashboard aggregate lands, this file
 * gains `useDashboardData()` and `DashboardView` stays unchanged.
 */
export default function DashboardPage() {
  return <DashboardView deckCount={0} reviewedToday={0} />
}
