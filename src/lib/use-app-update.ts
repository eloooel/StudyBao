import { useRegisterSW } from 'virtual:pwa-register/react'

export interface AppUpdate {
  /** A newer version is installed and waiting. */
  needRefresh: boolean
  /** Activate it and reload. */
  update: () => void
  /** Stop offering it for this session. */
  dismiss: () => void
}

/**
 * The **only** module in the app that touches vite-plugin-pwa's virtual register module.
 *
 * Two reasons it is its own file rather than three lines inside `app-shell.tsx`:
 *
 * 1. `virtual:pwa-register/react` is resolved by the PWA plugin, which is not part of the vitest
 *    graph. Keeping the import here means exactly one module needs the alias in
 *    `vitest.config.ts`, instead of every component that renders the shell.
 * 2. Everything worth testing about the update prompt is the prompt's own behaviour — when it shows,
 *    what it says, what its buttons do — and that lives in `UpdatePrompt`, which takes props and
 *    knows nothing about service workers. A test of *this* file could only assert that a stub I
 *    wrote returns what I told it to.
 *
 * That is also why it is excluded from coverage, on the same footing as `main.tsx` and
 * `pwa.config.ts`: it is integration with the build, not logic.
 */
export function useAppUpdate(): AppUpdate {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  return {
    needRefresh,
    // `true` means "reload the page once the new worker has taken over". Without it the worker
    // activates and the page keeps running the old JavaScript — the bug this whole change fixes.
    update: () => void updateServiceWorker(true),
    dismiss: () => {
      setNeedRefresh(false)
    },
  }
}
