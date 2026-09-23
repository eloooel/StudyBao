import { beforeEach, describe, expect, it } from 'vitest'

import { THEME_STORAGE_KEY } from './theme'
import { initTheme, setTheme, useTheme } from './theme-store'

// initTheme guards on a module-level flag, so each test starts from a known DOM
// state rather than relying on ordering.
beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  window.localStorage.clear()
})

describe('theme store', () => {
  it('exposes a hook that reads the current theme', () => {
    expect(typeof useTheme).toBe('function')
  })

  it('applies the resolved theme to the document element', () => {
    initTheme()

    expect(['light', 'night']).toContain(document.documentElement.dataset['theme'])
  })

  it('retints the whole app by setting data-theme, and persists the choice', () => {
    setTheme('night')

    expect(document.documentElement.dataset['theme']).toBe('night')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('night')

    setTheme('light')

    expect(document.documentElement.dataset['theme']).toBe('light')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('survives storage being unavailable, because iPad storage can be cleared', () => {
    const setItem = window.localStorage.setItem
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError')
    }

    expect(() => setTheme('night')).not.toThrow()
    // The theme still applies for this session even though it could not persist.
    expect(document.documentElement.dataset['theme']).toBe('night')

    window.localStorage.setItem = setItem
  })
})
