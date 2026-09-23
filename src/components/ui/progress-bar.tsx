import { cn } from '@/lib/cn'

export type ProgressTone = 'primary' | 'success'

export interface ProgressBarProps {
  value: number
  max?: number
  label: string
  /** Renders the percentage beside the label. */
  showValue?: boolean
  tone?: ProgressTone
  className?: string
}

const TONES: Record<ProgressTone, string> = {
  primary: 'bg-primary',
  success: 'bg-sage',
}

/**
 * The label is always rendered, and the bar carries a real `progressbar` role with
 * aria-valuenow/min/max. Progress that is conveyed only by a width is invisible to
 * a screen reader, and this is the component the streak and mastery numbers hang
 * off — the part of the app that is meant to be motivating.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = true,
  tone = 'primary',
  className,
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1
  const clamped = Math.min(Math.max(value, 0), safeMax)
  const percent = Math.round((clamped / safeMax) * 100)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-ink-muted">{label}</span>
        {showValue ? <span className="text-sm font-bold text-ink">{percent}%</span> : null}
      </div>

      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuetext={`${percent}%`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', TONES[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
