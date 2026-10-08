import { useNavigate } from 'react-router-dom'

import { DashboardView } from '../components/dashboard-view'
import { useDashboardData } from '../hooks/use-dashboard-data'

/**
 * Layer 1 — thin composition.
 *
 * `reviewedToday` is still a placeholder for Workflow F; `deckCount` is real. The view explains why
 * that distinction matters, and the commit that introduced it names the bug it fixed: a hardcoded
 * zero made this screen show the wrong empty state on every fresh install.
 */
export default function DashboardPage() {
  const navigate = useNavigate()
  const { deckCount } = useDashboardData()

  return (
    <DashboardView
      deckCount={deckCount}
      reviewedToday={0}
      onSeeDecks={() => void navigate('/cards')}
      onAddFromNotes={() => void navigate('/cards/ingest')}
    />
  )
}
