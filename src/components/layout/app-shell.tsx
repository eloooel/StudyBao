import { NavLink, Outlet } from 'react-router-dom'

import {
  BowIcon,
  CalendarIcon,
  CardsIcon,
  ClockIcon,
  HomeIcon,
  SettingsIcon,
} from '@/components/icons'
import { useTheme } from '@/lib/theme-store'
import { cn } from '@/lib/cn'

interface NavItem {
  to: string
  label: string
  Icon: typeof HomeIcon
  /** `end` keeps the index route from matching every child path. */
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Today', Icon: HomeIcon, end: true },
  { to: '/cards', label: 'Cards', Icon: CardsIcon },
  { to: '/timer', label: 'Timer', Icon: ClockIcon },
  { to: '/lessons', label: 'Lessons', Icon: CalendarIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
]

export function AppShell() {
  const { theme, toggle } = useTheme()

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <BowIcon className="size-6 text-primary" />
            <span className="font-display text-lg font-bold text-ink">StudyBao</span>
          </div>

          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'night' ? 'Switch to light theme' : 'Switch to night theme'}
            className="flex size-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            {theme === 'night' ? (
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2.5v2M12 19.5v2M3.5 12h2M18.5 12h2M5.9 5.9l1.4 1.4M16.7 16.7l1.4 1.4M5.9 18.1l1.4-1.4M16.7 7.3l1.4-1.4" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="sticky bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
      >
        <ul className="mx-auto flex w-full max-w-3xl items-stretch justify-between px-2">
          {NAV_ITEMS.map(({ to, label, Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-1 py-2 text-xs font-semibold transition-colors',
                    isActive ? 'text-ink' : 'text-ink-muted hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={cn('size-6', isActive ? 'text-accent' : 'text-ink-faint')} />
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
