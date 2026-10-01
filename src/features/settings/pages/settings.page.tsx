import { useState } from 'react'

import {
  daysUntilExam,
  epochMsToExamDateInput,
  examDateToEpochMs,
} from '@/db/repositories/settings'
import { useSettings } from '@/features/flashcards/hooks/use-settings'
import { updateSettings } from '@/db/repositories/settings'
import { notifyDataChanged } from '@/lib/use-database-value'
import { useTheme } from '@/lib/theme-store'
import { SettingsView } from '../components/settings-view'

/**
 * Layer 1 — thin route component. Theme comes from the theme store; the exam date lives in Dexie
 * because it is real data that must survive a reload and, later, sync.
 *
 * The date input is held in local state as the raw string while she types, and only written to the
 * database once it parses to a real calendar day. Writing on every keystroke would persist
 * `"2027-02-0"` on the way to a valid date, and a half-typed date is not a date.
 */
export default function SettingsPage() {
  const { theme, toggle } = useTheme()
  const { settings, setExamDate } = useSettings()
  const [storageNoticeDismissed, setStorageNoticeDismissed] = useState(false)
  const [draftDate, setDraftDate] = useState<string | undefined>(undefined)

  const examDateInput = draftDate ?? epochMsToExamDateInput(settings.examDate)

  return (
    <SettingsView
      theme={theme}
      onToggleTheme={toggle}
      storageNoticeDismissed={storageNoticeDismissed}
      onDismissStorageNotice={() => setStorageNoticeDismissed(true)}
      examDateInput={examDateInput}
      onExamDateChange={(value) => {
        setDraftDate(value)
        if (value.trim() === '') {
          void setExamDate(undefined)
          return
        }
        const parsed = examDateToEpochMs(value)
        if (parsed !== undefined) void setExamDate(parsed)
      }}
      daysUntilExam={daysUntilExam(settings.examDate)}
      cramThresholdDays={settings.cramThresholdDays}
      onCramThresholdChange={(days) => {
        void (async () => {
          await updateSettings({ cramThresholdDays: days })
          notifyDataChanged()
        })()
      }}
    />
  )
}
