import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'
import {
  ToastContext,
  type ToastApi,
  type ToastOptions,
  type ToastRecord,
  type ToastTone,
} from './use-toast'

const AUTO_DISMISS_MS = 6000

const TONES: Record<ToastTone, string> = {
  info: 'bg-mauve text-ink',
  success: 'bg-sage text-ink',
  attention: 'bg-accent text-on-strong',
}

export interface ToastProviderProps {
  children: ReactNode
}

/**
 * In-app banners only. There is no push, no permission prompt and no service
 * worker involvement — see docs/adr/0006-in-app-notifications-only.md. This is
 * therefore a plain React primitive; the *decision* about when to show a nudge
 * belongs to the notifications feature (Workflow G) and must stay a pure
 * function so the cadence caps and quiet hours can be unit-tested.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      nextId.current += 1
      const id = `toast-${nextId.current}`
      const sticky = options?.sticky ?? false

      setToasts((current) => [...current, { id, message, tone: options?.tone ?? 'info', sticky }])

      if (!sticky) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
        )
      }

      return id
    },
    [dismiss],
  )

  // Clear pending timers on unmount so a dismissed-but-pending toast cannot fire
  // setState on a dead component.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

interface ToastViewportProps {
  toasts: ToastRecord[]
  onDismiss: (id: string) => void
}

function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null

  return (
    <div
      // Announced politely, so a banner never interrupts what she is reading.
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          // The attention tone is the one she must act on, so it gets role=alert
          // and interrupts; the others are informational.
          role={toast.tone === 'attention' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[var(--radius-control)] px-4 py-3 font-display text-sm font-semibold',
            'shadow-[var(--shadow-soft)]',
            TONES[toast.tone],
          )}
        >
          <span className="min-w-0 flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
            className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/10"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
