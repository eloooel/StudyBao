import { useState } from 'react'

import { useTheme } from '@/lib/theme-store'
import { SettingsView } from '../components/settings-view'

/**
 * Layer 1 — thin route component. Holds only view state (whether the storage
 * notice has been dismissed); real settings persistence will need a store.
 */
export default function SettingsPage() {
  const { theme, toggle } = useTheme()
  const [storageNoticeDismissed, setStorageNoticeDismissed] = useState(false)

  return (
    <SettingsView
      theme={theme}
      onToggleTheme={toggle}
      storageNoticeDismissed={storageNoticeDismissed}
      onDismissStorageNotice={() => setStorageNoticeDismissed(true)}
    />
  )
}
