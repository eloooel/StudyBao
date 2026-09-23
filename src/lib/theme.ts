/**
 * Theme selection. Kept pure and separate from the DOM so the fallback rules are
 * testable without a browser.
 *
 * The stored preference is only a preference: it lives in localStorage, which on
 * iPad can be deleted along with the rest of the script-writable storage. Losing
 * it must never be worse than reverting to the system setting, which is why
 * `resolveInitialTheme` falls back rather than throwing.
 */
export type Theme = 'light' | 'night'

export const THEME_STORAGE_KEY = 'studybao.theme'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'night'
}

/**
 * Decide which theme to start in.
 *
 * Preference order:
 *   1. An explicit stored choice — she asked for this.
 *   2. The OS setting — a student studying at 2am has usually already told her
 *      device she wants dark.
 *   3. Light, the designed default.
 */
export function resolveInitialTheme(stored: unknown, prefersNight: boolean): Theme {
  if (isTheme(stored)) return stored
  return prefersNight ? 'night' : 'light'
}

export function themeAttribute(theme: Theme): string {
  return theme
}

/** Read the stored preference, tolerating a browser that blocks storage entirely. */
export function readStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(raw) ? raw : null
  } catch {
    return null
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage unavailable or full. The theme still applies for this session.
  }
}

export function prefersNight(): boolean {
  // The `?.matches` guard matters: `matchMedia?.(…)` alone still throws if the
  // call returns undefined, which is exactly the shape a partial implementation
  // or a test double can have.
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false
}

/** Apply the theme by setting `data-theme` on <html>, which retints every token. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset['theme'] = themeAttribute(theme)
}
