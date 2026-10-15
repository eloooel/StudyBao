import { useState } from 'react'

/**
 * Stand-in for `virtual:pwa-register/react`, aliased in `vitest.config.ts`.
 *
 * The real module is resolved by the PWA plugin, which is deliberately absent from the test config —
 * `vitest.config.ts` uses only `@vitejs/plugin-react`. Any test that renders `AppShell` therefore
 * imports the update hook, and without this alias that import cannot resolve.
 *
 * It is a **no-op, not a fake**: it reports "nothing to update" and does nothing when asked, so it
 * cannot make a test pass that would otherwise fail. `UpdatePrompt` is tested directly with props,
 * and `use-app-update.ts` is excluded from coverage because a test against this file would only
 * prove that this file works.
 */
export function useRegisterSW(): {
  needRefresh: [boolean, (value: boolean) => void]
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>
} {
  const [needRefresh, setNeedRefresh] = useState(false)

  return {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker: () => Promise.resolve(),
  }
}
