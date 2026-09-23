import { describe, expect, it, vi } from 'vitest'

import {
  isTheme,
  prefersNight,
  readStoredTheme,
  resolveInitialTheme,
  storeTheme,
  themeAttribute,
  THEME_STORAGE_KEY,
} from './theme'

describe('isTheme', () => {
  it('accepts only the two known themes', () => {
    expect(isTheme('light')).toBe(true)
    expect(isTheme('night')).toBe(true)
    expect(isTheme('dark')).toBe(false)
    expect(isTheme(null)).toBe(false)
    expect(isTheme(undefined)).toBe(false)
    expect(isTheme(1)).toBe(false)
  })
})

describe('resolveInitialTheme', () => {
  it('prefers her explicit choice over the system setting', () => {
    expect(resolveInitialTheme('light', true)).toBe('light')
    expect(resolveInitialTheme('night', false)).toBe('night')
  })

  it('falls back to the system setting when nothing is stored', () => {
    expect(resolveInitialTheme(null, true)).toBe('night')
    expect(resolveInitialTheme(null, false)).toBe('light')
  })

  it('falls back rather than throwing on junk, because storage may be cleared', () => {
    // iPad storage can be deleted wholesale, so a corrupt or partial value must
    // never be worse than reverting to the system setting.
    expect(resolveInitialTheme('SEPIA', true)).toBe('night')
    expect(resolveInitialTheme('{}', false)).toBe('light')
    expect(resolveInitialTheme(42, false)).toBe('light')
  })
})

describe('themeAttribute', () => {
  it('maps each theme to the data-theme value used in CSS', () => {
    expect(themeAttribute('light')).toBe('light')
    expect(themeAttribute('night')).toBe('night')
  })
})

describe('storage access', () => {
  it('reads back what it stored', () => {
    storeTheme('night')

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('night')
    expect(readStoredTheme()).toBe('night')
  })

  it('returns null instead of throwing when storage is empty', () => {
    window.localStorage.clear()

    expect(readStoredTheme()).toBeNull()
  })

  it('returns null instead of throwing when storage is blocked', () => {
    // Safari can deny storage entirely, and a throw here would take the app down
    // before it rendered. The theme must degrade to the system setting instead.
    const original = window.localStorage.getItem
    window.localStorage.getItem = () => {
      throw new Error('SecurityError')
    }

    expect(readStoredTheme()).toBeNull()

    window.localStorage.getItem = original
  })

  it('does not throw when writing is blocked', () => {
    const original = window.localStorage.setItem
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError')
    }

    expect(() => storeTheme('night')).not.toThrow()

    window.localStorage.setItem = original
  })

  it('falls back to light when matchMedia is unavailable or partial', () => {
    const original = window.matchMedia
    // A partial implementation returns undefined rather than a MediaQueryList.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => undefined,
    })
    const matchMediaSpy = vi.spyOn(window, 'matchMedia')

    expect(prefersNight()).toBe(false)
    expect(matchMediaSpy).toHaveBeenCalled()

    Object.defineProperty(window, 'matchMedia', { writable: true, value: original })
  })
})
