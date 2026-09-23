import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Mauve and sage are used as FILLS with ink text, never as text colours:
 * as text on white they measure 2.08:1 and 1.57:1; as fills under plum text they
 * measure 5.83:1 and 7.71:1. This is the whole reason the tag component takes a
 * tone rather than a colour.
 */
export type TagTone = 'neutral' | 'success' | 'attention' | 'accent'

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone
  /** Adds a leading dot, for status that must read without relying on colour. */
  dot?: boolean
  children: ReactNode
}

const TONES: Record<TagTone, string> = {
  neutral: 'bg-mauve',
  success: 'bg-sage',
  attention: 'bg-line',
  accent: 'bg-accent text-on-strong',
}

export function Tag({ tone = 'neutral', dot = false, className, children, ...rest }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-xs font-semibold text-ink',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {dot ? (
        <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      ) : null}
      {children}
    </span>
  )
}
