import { useId } from 'react'

import { cn } from '@/lib/cn'
import type { CardDraftFields } from '../types'

/**
 * The paste field.
 *
 * Feature-local rather than in `src/components/ui/`: only this feature needs a multi-line
 * field, and the repo's rule is that a primitive is promoted once **three or more** features
 * use it. Moving it to `ui/` now would be the speculative abstraction `CLAUDE.md` bans.
 *
 * Same reasoning as `Input` for the id wiring: the hint is announced via `aria-describedby`
 * rather than merely shown, because a hint a screen reader skips is a hint never delivered.
 */
export interface PasteTextAreaProps {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

export function PasteTextArea({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 12,
}: PasteTextAreaProps) {
  const id = useId()
  const hintId = `${id}-hint`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-display text-sm font-semibold text-ink">
        {label}
      </label>

      <textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        aria-describedby={hint !== undefined ? hintId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'rounded-[var(--radius-control)] border border-line bg-surface px-3.5 py-3 text-base leading-relaxed text-ink placeholder:text-ink-faint',
          'transition-colors duration-150',
          'focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent',
        )}
      />

      {hint !== undefined ? (
        <p id={hintId} className="text-sm leading-relaxed text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The front/back pair, used by both the edit dialog and the leftover converter.
 *
 * One component for both on purpose: her job is the same in each case — turn text into a
 * question and an answer — and two near-identical forms would drift.
 */
export interface CardFieldsEditorProps {
  values: CardDraftFields
  onChange: (values: CardDraftFields) => void
  /** Labels differ between "edit this card" and "make a card from this". */
  frontLabel?: string
  backLabel?: string
}

export function CardFieldsEditor({
  values,
  onChange,
  frontLabel = 'Front — the question',
  backLabel = 'Back — the answer',
}: CardFieldsEditorProps) {
  return (
    <div className="flex flex-col gap-3">
      <PasteTextArea
        label={frontLabel}
        value={values.front}
        rows={3}
        onChange={(front) => onChange({ ...values, front })}
      />
      <PasteTextArea
        label={backLabel}
        value={values.back}
        rows={4}
        onChange={(back) => onChange({ ...values, back })}
      />
    </div>
  )
}
