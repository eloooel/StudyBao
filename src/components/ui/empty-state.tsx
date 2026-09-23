import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface EmptyStateProps {
  /** Decorative illustration or icon. */
  icon?: ReactNode
  title: string
  message: string
  /** A real next action, or nothing. Never render a button that cannot work. */
  action?: ReactNode
  className?: string
}

/**
 * A blank screen is a defect. Every screen in this app has a real empty state,
 * written in the voice from docs/BUILD_GUIDE.md §5 — warm and specific, never
 * "No data available".
 */
export function EmptyState({ icon, title, message, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-[var(--radius-card)] border border-line bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-line text-ink">
          {icon}
        </div>
      ) : null}

      <h2 className="text-lg text-ink">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{message}</p>

      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
