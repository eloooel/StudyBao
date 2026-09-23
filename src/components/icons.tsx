import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

/**
 * Icons are inline SVG rather than an icon package: five glyphs do not justify a
 * dependency, and inlining keeps them in the precache manifest for free.
 *
 * All are decorative — every one is `aria-hidden`. The accessible name must come
 * from the control's own text or `aria-label`, so that a screen reader announces
 * "Timer, current page" rather than "clock svg".
 *
 * Callers may override appearance (e.g. `fill="currentColor" strokeWidth="0"` for
 * the solid glyphs) because the spread comes last.
 */
function Svg({ className, children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  )
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </Svg>
  )
}

export function CardsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="13" height="15" rx="2.5" />
      <path d="M7.5 3.5h10A3.5 3.5 0 0 1 21 7v10.5" />
    </Svg>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12.5" r="8.5" />
      <path d="M12 8v4.8l3 1.8" />
      <path d="M9 2.5h6" />
    </Svg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14h3" />
    </Svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.5 7.5l2.1 1.2M17.4 15.3l2.1 1.2M4.5 16.5l2.1-1.2M17.4 8.7l2.1-1.2" />
    </Svg>
  )
}

/**
 * The bow. Reserved for streak and achievement moments only — on every element it
 * stops feeling special (docs/BUILD_GUIDE.md §5).
 */
export function BowIcon(props: IconProps) {
  return (
    <Svg fill="currentColor" strokeWidth="0" {...props}>
      <path d="M11.2 12C11.2 9.2 8.9 7 6.2 7 3.4 7 1.4 9.2 1.4 12s2 5 4.8 5c2.7 0 5-2.2 5-5Z" />
      <path d="M12.8 12c0-2.8 2.3-5 5-5 2.8 0 4.8 2.2 4.8 5s-2 5-4.8 5c-2.7 0-5-2.2-5-5Z" />
      <circle cx="12" cy="12" r="2" />
    </Svg>
  )
}

export function SparkleIcon(props: IconProps) {
  return (
    <Svg fill="currentColor" strokeWidth="0" {...props}>
      <path d="M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9L12 2.5Z" />
    </Svg>
  )
}
