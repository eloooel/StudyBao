import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Variants are named by role, not by colour, so the palette can move without
 * touching call sites.
 *
 * Contrast is the reason for `text-on-primary` / `text-on-strong` rather than a
 * literal colour: white on the rose primary is 1.87:1 and fails WCAG AA, while
 * plum on rose is 6.49:1. In the night theme those two tokens flip to dark, so a
 * hardcoded text colour here would break one of the two themes.
 * See docs/BUILD_GUIDE.md §5.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'strong'

export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner and refuses interaction. Also sets aria-busy. */
  loading?: boolean
  fullWidth?: boolean
  /** Rendered before the label. Decorative — label the button, not the icon. */
  leadingIcon?: ReactNode
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-surface text-ink border border-line hover:bg-canvas',
  ghost: 'bg-transparent text-ink-muted hover:bg-canvas hover:text-ink',
  // For destructive or high-urgency actions, where white text is wanted (4.77:1).
  strong: 'bg-primary-strong text-on-strong hover:bg-accent',
}

// Every size clears the 44px touch target minimum: she uses this on an iPad,
// often one-handed and often in the dark.
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3.5 text-sm',
  md: 'min-h-12 px-5 text-base',
  lg: 'min-h-14 px-7 text-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leadingIcon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled === true || loading

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-display font-semibold',
        'transition-colors duration-150',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent',
        // A disabled control must not look merely faint — she needs to know it is
        // unavailable, not wonder whether the tap registered.
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : leadingIcon}
      {children}
    </button>
  )
})

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
