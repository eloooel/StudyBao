import { render as rtlRender, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

export * from '@testing-library/react'

export interface AppRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Where the memory router starts. Use for routing-dependent assertions. */
  initialPath?: string
}

/**
 * The only render entry point for UI tests — import from here, never directly
 * from `@testing-library/react` (CLAUDE.md, Testing).
 *
 * It wraps in a MemoryRouter so route components and `NavLink` work, and
 * re-exports everything else (`screen`, `waitFor`, …).
 */
export function render(ui: ReactElement, options: AppRenderOptions = {}) {
  const { initialPath = '/', ...rest } = options

  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  }

  return rtlRender(ui, { wrapper: Wrapper, ...rest })
}
