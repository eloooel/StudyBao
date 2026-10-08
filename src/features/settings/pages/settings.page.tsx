import { useState } from 'react'

import { daysUntilExam } from '@/db/repositories/settings'
import { useSettings } from '@/features/flashcards/hooks/use-settings'
import { updateSettings } from '@/db/repositories/settings'
import { useTimerSettings } from '@/features/timer/hooks/use-timer-settings'
import { dateInputFromStudyDayMs, studyDayMsFromDateInput } from '@/lib/study-day'
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
  // Reading and writing the timer lengths goes through the timer's own hook, so this screen and
  // the timer can never disagree about which values are in force or how they are guarded.
  const timer = useTimerSettings()
  const [storageNoticeDismissed, setStorageNoticeDismissed] = useState(false)
  const [draftDate, setDraftDate] = useState<string | undefined>(undefined)

  const examDateInput = draftDate ?? dateInputFromStudyDayMs(settings.examDate)

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
        const parsed = studyDayMsFromDateInput(value)
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
      timerDurations={timer.durations}
      onTimerDurationsChange={(patch) => void timer.updateDurations(patch)}
    />
  )
}
