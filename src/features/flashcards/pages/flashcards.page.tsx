import { useNavigate } from 'react-router-dom'

import { DeckListView } from '../components/deck-list-view'
import { useDecksData } from '../hooks/use-decks-data'

/**
 * Layer 1 — thin route component.
 *
 * Cram mode is read from the URL rather than from a store, so "review everything due" and
 * "cram" are two different links she can bookmark and refresh into.
 */
export default function FlashcardsPage() {
  const navigate = useNavigate()
  const { decks, totalDue, loading } = useDecksData()

  return (
    <DeckListView
      decks={decks}
      loading={loading}
      totalDue={totalDue}
      onOpenDeck={(deckId) => void navigate(`/cards/${deckId}`)}
      onStartReview={() => void navigate('/cards/review')}
    />
  )
}
