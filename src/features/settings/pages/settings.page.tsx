import { useState } from 'react'

import { daysUntilExam } from '@/db/repositories/settings'
import { useHomeScreenSetup } from '@/features/first-run/hooks/use-home-screen-setup'
import { useSettings } from '@/features/flashcards/hooks/use-settings'
import { updateSettings } from '@/db/repositories/settings'
import { useTimerSettings } from '@/features/timer/hooks/use-timer-settings'
import { dateInputFromStudyDayMs, studyDayMsFromDateInput } from '@/lib/study-day'
import { notifyDataChanged } from '@/lib/use-database-value'
import { useTheme } from '@/lib/theme-store'
import { useBackup } from '../hooks/use-backup'
import { SettingsView } from '../components/settings-view'

/**
 * Layer 1 — thin route component. Theme comes from the theme store; the exam date lives in Dexie
 * because it is real data that must survive a reload and, later, sync.
 *
 * The date input is held in local state as the raw string while she types, and only written to the
 * database once it parses to a real calendar day. Writing on every keystroke would persist
 * `"2027-02-0"` on the way to a valid date, and a half-typed date is not a date.
 *
 * The Home Screen card's state comes from `useHomeScreenSetup`, the same hook the first-run prompt
 * reads. That is the point: this screen must never disagree with the prompt about whether she has
 * already added the icon.
 *
 * Backup goes through `useBackup`, which owns the file input, the "reading" flag and the chosen-but-
 * unconfirmed file. This component only connects props to it.
 */
export default function SettingsPage() {
  const { theme, toggle } = useTheme()
  const { settings, setExamDate } = useSettings()
  // Reading and writing the timer lengths goes through the timer's own hook, so this screen and
  // the timer can never disagree about which values are in force or how they are guarded.
  const timer = useTimerSettings()
  const homeScreen = useHomeScreenSetup()
  const backup = useBackup()
  const [homeScreenHelpOpen, setHomeScreenHelpOpen] = useState(false)
  const [draftDate, setDraftDate] = useState<string | undefined>(undefined)

  const examDateInput = draftDate ?? dateInputFromStudyDayMs(settings.examDate)

  return (
    <SettingsView
      theme={theme}
      onToggleTheme={toggle}
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
      homeScreenState={homeScreen.state}
      homeScreenHelpOpen={homeScreenHelpOpen}
      onOpenHomeScreenHelp={() => {
        setHomeScreenHelpOpen(true)
        // Opening the explanation is the prompt's outcome by another route, so it stamps the same
        // field. Without this, someone who skipped the first-run prompt and then read the card would
        // still meet the modal on the next launch — which is the repeated wall, arrived at sideways.
        homeScreen.markSeen()
      }}
      onCloseHomeScreenHelp={() => setHomeScreenHelpOpen(false)}
      backup={{
        fileInputRef: backup.fileInputRef,
        onOpenFilePicker: backup.openFilePicker,
        onFileChosen: (file) => void backup.onFileChosen(file),
        onExport: () => void backup.exportNow(),
        onSaveBeforeImport: () => void backup.saveBeforeImport(),
        onConfirmImport: () => void backup.confirmImport(),
        onCancelImport: backup.cancelImport,
        pending: backup.pending,
        busy: backup.busy,
        savedFirst: backup.savedFirst,
      }}
    />
  )
}
