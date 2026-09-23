import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  /** Guidance shown when there is no error. Replaced by `error` when there is one. */
  hint?: ReactNode
  error?: string
  /** Hides the label visually but keeps it for screen readers. */
  hideLabel?: boolean
}

/**
 * Wires label, hint and error together with generated ids and `aria-describedby`,
 * so the error is announced rather than merely coloured. That is not optional
 * polish: a validation message a screen reader skips is a message that was never
 * delivered.
 */
export function Input({ label, hint, error, hideLabel = false, className, ...rest }: InputProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const hasError = typeof error === 'string' && error.length > 0

  const describedBy = hasError ? errorId : hint ? hintId : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className={cn('font-display text-sm font-semibold text-ink', hideLabel && 'sr-only')}
      >
        {label}
      </label>

      <input
        id={id}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-12 rounded-[var(--radius-control)] border bg-surface px-3.5 text-base text-ink placeholder:text-ink-faint',
          'transition-colors duration-150',
          'focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent',
          'disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-faint',
          hasError ? 'border-accent' : 'border-line',
        )}
        {...rest}
      />

      {hasError ? (
        <p id={errorId} role="alert" className="text-sm font-semibold text-accent">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
