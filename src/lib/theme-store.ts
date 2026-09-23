import { useCallback, useSyncExternalStore } from 'react'

import {
  applyTheme,
  prefersNight,
  readStoredTheme,
  resolveInitialTheme,
  storeTheme,
  type Theme,
} from './theme'

/**
 * A tiny external store rather than a React context.
 *
 * Why: the theme is read in two unrelated places (the header toggle and Settings)
 * and written from both. A context would need a provider wrapping the whole app
 * for one boolean, and a module-level store keeps the DOM in sync even if two
 * components mount at once. `useSyncExternalStore` makes that correct rather than
 * merely convenient.
 */
let current: Theme = 'light'
let initialised = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): Theme {
  return current
}

/**
 * Apply the stored-or-system theme. Called once from the app root, before render
 * ideally, so there is no flash of the wrong theme.
 */
export function initTheme(): Theme {
  if (initialised) return current
  initialised = true

  current = resolveInitialTheme(readStoredTheme(), prefersNight())
  applyTheme(current)
  return current
}

export function setTheme(theme: Theme): void {
  current = theme
  applyTheme(theme)
  storeTheme(theme)
  emit()
}

export interface UseThemeResult {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

export function useTheme(): UseThemeResult {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const toggle = useCallback(() => {
    setTheme(current === 'night' ? 'light' : 'night')
  }, [])

  return { theme, setTheme, toggle }
}
