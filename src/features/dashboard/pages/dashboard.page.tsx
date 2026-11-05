import { useNavigate } from 'react-router-dom'

import { DashboardView } from '../components/dashboard-view'
import { useDashboardData } from '../hooks/use-dashboard-data'

/**
 * Layer 1 — thin composition.
 *
 * Only `deckCount` reaches the view, because it is the only number that can be computed honestly
 * today — it is a fact about what is on the device. `reviewedToday` used to be passed as a literal
 * `0` to feed the streak card; the card is gone (see `DashboardView`), so the prop went with it rather
 * than being left behind unread. It returns when Workflow F can derive it from `ReviewLog`.
 */
export default function DashboardPage() {
  const navigate = useNavigate()
  const { deckCount } = useDashboardData()

  return (
    <DashboardView
      deckCount={deckCount}
      onSeeDecks={() => void navigate('/cards')}
      onAddFromNotes={() => void navigate('/cards/ingest')}
    />
  )
}
