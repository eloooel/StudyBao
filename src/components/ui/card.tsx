import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Lifts the card off the canvas. Use for the one thing on screen that matters. */
  elevated?: boolean
}

export function Card({ elevated = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface',
        elevated ? 'shadow-[var(--shadow-soft)]' : 'shadow-none',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

// `title` is omitted from the HTML attributes so it can be a ReactNode here
// rather than the native tooltip string.
export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode
  description?: ReactNode
  /** Right-aligned slot for a tag, a button, or a streak counter. */
  action?: ReactNode
}

export function CardHeader({ title, description, action, className, ...rest }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 p-5 pb-0', className)} {...rest}>
      <div className="min-w-0">
        <h3 className="text-lg text-ink">{title}</h3>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function CardContent({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-5', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-wrap gap-2 border-t border-line p-5', className)} {...rest}>
      {children}
    </div>
  )
}
