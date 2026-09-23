import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Tag } from '@/components/ui/tag'
import type { CardFormValues, CardFormViewProps } from '../types'

/**
 * Layer 3 — the add/edit card form. No hooks beyond its own field state, no database.
 *
 * The fields live in a child component that is **mounted with a new identity per target** (see
 * `key` on `CardFormFields` below). The Modal keeps its children mounted even while closed, so a
 * form that held its own state at this level would still show the last card's text the next time
 * it opened. Remounting is the fix, and it means there is no "sync props into state" effect —
 * which is where a large share of stale-form bugs come from.
 *
 * Validation is deliberately gentle: a card with a slightly awkward back is still better than a
 * card she could not save, so the only requirement is that both sides have something in them.
 */
export function CardFormView({
  open,
  target,
  progressSummary,
  tagSuggestions,
  onSubmit,
  onClose,
  onResetProgress,
}: CardFormViewProps) {
  const editing = target?.mode === 'edit'

  const identity =
    target?.mode === 'edit'
      ? `edit:${target.card.id}`
      : target?.mode === 'create'
        ? 'create'
        : 'closed'

  const initial: CardFormValues =
    target?.mode === 'edit'
      ? { front: target.card.front, back: target.card.back, tags: [...target.card.tags] }
      : { front: '', back: '', tags: [] }

  return (
    <Modal
      open={open && target !== null}
      onClose={onClose}
      title={editing ? 'Edit this card' : 'Add a card'}
      description={
        editing
          ? 'Editing keeps this card’s progress, so fixing a typo costs you nothing.'
          : 'One side is the prompt, the other is the answer.'
      }
      footer={
        editing && onResetProgress ? (
          <Button variant="ghost" onClick={onResetProgress}>
            Reset progress
          </Button>
        ) : null
      }
    >
      <CardFormFields
        key={identity}
        initial={initial}
        editing={editing}
        progressSummary={progressSummary}
        tagSuggestions={tagSuggestions}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Modal>
  )
}

interface CardFormFieldsProps {
  initial: CardFormValues
  editing: boolean
  progressSummary?: string
  tagSuggestions: readonly string[]
  onSubmit: (values: CardFormValues) => void
  onClose: () => void
}

function CardFormFields({
  initial,
  editing,
  progressSummary,
  tagSuggestions,
  onSubmit,
  onClose,
}: CardFormFieldsProps) {
  const [values, setValues] = useState<CardFormValues>(initial)
  const [error, setError] = useState<string | undefined>(undefined)

  const canSave = values.front.trim().length > 0 && values.back.trim().length > 0

  function handleSubmit() {
    if (!canSave) {
      setError('Both sides need something in them.')
      return
    }
    onSubmit({ front: values.front.trim(), back: values.back.trim(), tags: values.tags })
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Front"
        value={values.front}
        onChange={(event) => {
          setValues((previous) => ({ ...previous, front: event.target.value }))
          setError(undefined)
        }}
        placeholder="What is the first link in the chain of infection?"
      />

      <label className="flex flex-col gap-1.5">
        <span className="font-display text-sm font-semibold text-ink">Back</span>
        <textarea
          value={values.back}
          onChange={(event) => {
            setValues((previous) => ({ ...previous, back: event.target.value }))
            setError(undefined)
          }}
          rows={4}
          placeholder="The infectious agent."
          className="min-h-24 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 py-2.5 text-base leading-relaxed text-ink placeholder:text-ink-faint focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
      </label>

      <TagPicker
        selected={values.tags}
        suggestions={tagSuggestions}
        onChange={(tags) => setValues((previous) => ({ ...previous, tags }))}
      />

      {editing && progressSummary ? (
        <p className="text-xs text-ink-faint">{progressSummary}</p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-semibold text-accent">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!canSave}>
          {editing ? 'Save changes' : 'Add card'}
        </Button>
      </div>
    </div>
  )
}

interface TagPickerProps {
  selected: string[]
  suggestions: readonly string[]
  onChange: (tags: string[]) => void
}

/**
 * Toggles for the integrated knowledge areas, plus her own free-text tags.
 *
 * A tag is stored as plain text on the card rather than as a foreign key, so a tag she invents is
 * never rejected and never needs a migration to exist.
 */
function TagPicker({ selected, suggestions, onChange }: TagPickerProps) {
  const [draft, setDraft] = useState('')
  const custom = selected.filter((tag) => !suggestions.includes(tag))

  function toggle(tag: string) {
    onChange(
      selected.includes(tag) ? selected.filter((value) => value !== tag) : [...selected, tag],
    )
  }

  function addDraft() {
    const tag = draft.trim()
    if (tag.length > 0 && !selected.includes(tag)) onChange([...selected, tag])
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="font-display text-sm font-semibold text-ink">
        Topics <span className="font-normal text-ink-muted">(optional)</span>
      </span>
      <p className="text-xs text-ink-muted">
        These cut across all five parts — pharmacology shows up everywhere.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {[...suggestions, ...custom].map((tag) => {
          const isSelected = selected.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggle(tag)}
              className="rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Tag tone={isSelected ? 'accent' : 'neutral'}>{isSelected ? `✓ ${tag}` : tag}</Tag>
            </button>
          )
        })}
      </div>

      <div className="flex items-end gap-2">
        <Input
          label="Add your own topic"
          hideLabel
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addDraft()
            }
          }}
          placeholder="Add your own topic"
          className="flex-1"
        />
        <Button variant="secondary" onClick={addDraft} disabled={draft.trim().length === 0}>
          Add
        </Button>
      </div>
    </div>
  )
}
