import { useCallback, useState } from 'react'

import { createCard, updateCardText } from '@/db/repositories/cards'
import { INTEGRATED_KNOWLEDGE_AREAS } from '@/db/schema'
import { notifyDataChanged } from '@/lib/use-database-value'
import type { CardFormValues } from '../types'

/**
 * Writes for the card form. Layer 2 — the only place these views touch the database.
 *
 * Every successful write notifies the shared data signal, so the deck list and the review queue
 * update without a reload. A failed write surfaces as an error string for the form to show
 * rather than throwing into the void: she cannot read a stack trace, and a save that silently
 * does nothing is the worst possible outcome for a card she just typed.
 */
export interface CardActions {
  saving: boolean
  error?: string
  saveNewCard: (deckId: string, values: CardFormValues) => Promise<boolean>
  saveCardText: (cardId: string, values: CardFormValues) => Promise<boolean>
  clearError: () => void
}

export function useCardActions(): CardActions {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const saveNewCard = useCallback(async (deckId: string, values: CardFormValues) => {
    setSaving(true)
    setError(undefined)
    try {
      await createCard({
        deckId,
        front: values.front,
        back: values.back,
        tags: values.tags,
      })
      notifyDataChanged()
      return true
    } catch {
      setError(
        "That card didn't save. Try again — if it keeps happening, your device may be out of space.",
      )
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const saveCardText = useCallback(async (cardId: string, values: CardFormValues) => {
    setSaving(true)
    setError(undefined)
    try {
      await updateCardText(cardId, values)
      notifyDataChanged()
      return true
    } catch {
      setError("That change didn't save. Try again — your card is still there as it was.")
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const clearError = useCallback(() => setError(undefined), [])

  return { saving, error, saveNewCard, saveCardText, clearError }
}

/** The tag vocabulary offered on the form. Read from src/db so features never import seed data. */
export function useTagSuggestions(): readonly string[] {
  return INTEGRATED_KNOWLEDGE_AREAS
}
