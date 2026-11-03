import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { PRC_PARTS } from '@/db/seed-data'
import type { PrcPart } from '@/db/types'

export interface DeckFormValues {
  name: string
  subject: PrcPart
  scope: string
}

export interface DeckFormViewProps {
  open: boolean
  onClose: () => void
  onSubmit: (values: DeckFormValues) => void
}

/**
 * Layer 3 — the "new deck" form. Pure JSX over local state; it does not touch the database.
 *
 * ## Why a part is required
 *
 * A deck belongs to exactly one Nursing Practice part (`Deck.subject`), and that is still what
 * orders every list in the app in exam order (ADR 0010). What ADR 0010 changed is that a part may now
 * hold **more than one** deck — so this asks *which part*, not *which part is missing a deck*.
 *
 * ## Why the name is the only required field, and scope is not
 *
 * The five seeded decks carry the PRC program's scope text **verbatim**, because the app mirrors the
 * document she sits. A deck she makes is not quoting anything, so it must not be made to look as if it
 * is: scope is a line for her own benefit, and an empty one is normal.
 *
 * ## Reset on open
 *
 * The form is a modal that stays mounted, so opening it twice would otherwise show the first attempt's
 * text. It resets whenever it becomes visible, which also means a cancelled draft is gone — deliberate,
 * because a half-typed deck name reappearing later reads as a bug.
 */
export function DeckFormView({ open, onClose, onSubmit }: DeckFormViewProps) {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState<PrcPart>(PRC_PARTS[0]?.part ?? 'practice-i')
  const [scope, setScope] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const partId = useId()
  const partHintId = `${partId}-hint`

  /**
   * Reset **while rendering**, not in an effect.
   *
   * This is React's documented "adjusting state when a prop changes" pattern. An effect would render
   * the previous draft for one frame and then clear it — a cascading render, which is exactly what
   * `react-hooks/set-state-in-effect` rejects. Comparing against the previous `open` is what makes
   * this run on the transition into open rather than on every render.
   */
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName('')
      setSubject(PRC_PARTS[0]?.part ?? 'practice-i')
      setScope('')
      setError(undefined)
    }
  }

  function submit(): void {
    const trimmed = name.trim()

    if (trimmed === '') {
      setError('Give the deck a name so you can find it later.')
      return
    }

    onSubmit({ name: trimmed, subject, scope: scope.trim() })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New deck"
      description="A deck holds cards for one topic. You can make as many as you like inside a part."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Make the deck</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Deck name"
          value={name}
          placeholder="Fluid and electrolytes"
          onChange={(event) => {
            setName(event.target.value)
            setError(undefined)
          }}
        />

        <div className="flex flex-col gap-1.5">
          {/*
            The hint is a **sibling** of the label, tied by `aria-describedby`, and not a child of it.
            A hint inside a wrapping `<label>` becomes part of the control's accessible name — "Which
            part is it for?This is what keeps your decks in exam order…" — which breaks voice control
            and makes `getByLabelText` fail the moment the hint exists. Same bug that was found and
            fixed in the settings number fields; it is easy to reintroduce, which is why the test
            queries by label.
          */}
          <label htmlFor={partId} className="font-display text-sm font-semibold text-ink">
            Which part is it for?
          </label>
          <select
            id={partId}
            aria-describedby={partHintId}
            value={subject}
            onChange={(event) => {
              const chosen = PRC_PARTS.find((part) => part.part === event.target.value)
              if (chosen === undefined) return
              setSubject(chosen.part)
            }}
            className="min-h-12 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base text-ink focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            {PRC_PARTS.map((part) => (
              <option key={part.part} value={part.part}>
                {part.name}
              </option>
            ))}
          </select>
          <span id={partHintId} className="text-xs text-ink-muted">
            This is what keeps your decks in exam order. A part can have more than one.
          </span>
        </div>

        <Input
          label="What’s in it?"
          value={scope}
          placeholder="Sodium, potassium, and the ones that go wrong at night"
          hint="Optional — a line to remind you what you meant to put in here."
          onChange={(event) => {
            setScope(event.target.value)
          }}
        />

        {error === undefined ? null : (
          <span role="alert" className="text-xs font-semibold text-accent">
            {error}
          </span>
        )}
      </div>
    </Modal>
  )
}
