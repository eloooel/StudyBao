import { Button } from '@/components/ui/button'

export interface UpdatePromptProps {
  /** True when a newer version has been installed and is waiting to take over. */
  needRefresh: boolean
  /** Take it now: activate the waiting worker and reload onto the new build. */
  onUpdate: () => void
  /** Put it off. It returns on the next launch, which is deliberate. */
  onDismiss: () => void
}

/**
 * Layer 3 — pure JSX. No hooks, no service worker, no globals.
 *
 * ## Why this exists at all
 *
 * The app is a PWA that precaches its whole shell, so a deploy does **not** reach a browser that
 * already has it. The generated registration only called `navigator.serviceWorker.register` — 134
 * bytes, no `controllerchange` listener and no reload — so a new worker installed, `skipWaiting` and
 * `clientsClaim` activated it immediately, and the page carried on running the **previous**
 * JavaScript. Indefinitely. That is not a cosmetic problem at a one-person scale: every fix shipped
 * was invisible to her until she manually reloaded, which is an instruction that cannot exist for a
 * non-technical user. It was diagnosed by a report of "I can't see any of the three fixes", where
 * the truth was that she was looking at the whole previous version of the app.
 *
 * ## Why a prompt rather than an automatic reload
 *
 * A reload she did not ask for can land mid-card in a review session. Her data is safe either way —
 * it is in IndexedDB, not in the page — but losing her place without warning is exactly the kind of
 * surprise this app should not spring on someone. So the new version waits, and she chooses.
 *
 * `role="status"` rather than `alert`: it is polite news, not an interruption, and a screen reader
 * announces it when focus next settles.
 */
export function UpdatePrompt({ needRefresh, onUpdate, onDismiss }: UpdatePromptProps) {
  if (!needRefresh) return null

  return (
    <div role="status" className="border-t border-line bg-surface">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
        <p className="text-sm leading-relaxed text-ink">
          A new version is ready. Update whenever suits you.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={onUpdate}>
            Update
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  )
}
