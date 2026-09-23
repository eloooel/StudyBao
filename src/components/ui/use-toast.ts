import { createContext, useContext } from 'react'

export type ToastTone = 'info' | 'success' | 'attention'

export interface ToastRecord {
  id: string
  message: string
  tone: ToastTone
  /** Stays until dismissed. Use for anything she must act on. */
  sticky: boolean
}

export interface ToastOptions {
  tone?: ToastTone
  sticky?: boolean
}

export interface ToastApi {
  show: (message: string, options?: ToastOptions) => string
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

/**
 * Lives in its own module, separate from `toast.tsx`, so that file exports only
 * components. That keeps `react-refresh/only-export-components` happy without an
 * eslint override, and keeps hot reload working for the provider.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)

  if (!api) {
    throw new Error('useToast() must be called inside <ToastProvider>.')
  }

  return api
}
