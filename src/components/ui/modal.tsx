import { useEffect, useId, useRef, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
}

/**
 * Built on the native `<dialog>` element rather than a portal and a hand-rolled
 * focus trap. That buys real modal semantics — focus containment, inert
 * background, Escape handling — with no dependency and nothing to get subtly
 * wrong. iPad Safari has supported `<dialog>` since 15.4.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  // Escape. We preventDefault so the handler below is the single path out, and we
  // deliberately do not listen for the 'close' event: that also fires when we
  // close programmatically, which would call onClose twice.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (event: Event) => {
      event.preventDefault()
      onClose()
    }

    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onClose])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Clicks that land on the backdrop are dispatched to the dialog itself, so
      // this closes on outside-click without a separate backdrop element.
      onMouseDown={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className={cn(
        'm-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink',
        'shadow-[var(--shadow-soft)] backdrop:bg-[rgba(74,46,53,0.45)]',
        className,
      )}
    >
      <div className="flex flex-col">
        <header className="flex items-start justify-between gap-4 p-5 pb-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {children ? <div className="p-5">{children}</div> : null}

        {footer ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line p-5">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  )
}
