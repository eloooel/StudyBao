import * as React from 'react'

/**
 * The one cross-screen data-refresh mechanism.
 *
 * Every hook that reads from Dexie subscribes to a module-level "something changed" signal and
 * re-reads when it fires. Without it, grading a card on the review screen would leave the deck
 * list showing a stale due count until a reload — and a deck list that lies about what is due
 * is worse than no deck list.
 *
 * Deliberately not Dexie's `liveQuery`: that would add `dexie-react-hooks` as a dependency for
 * one behaviour, and this codebase prefers the smaller thing it already has. Deliberately not a
 * Zustand store either — card and deck data live in Dexie (CLAUDE.md, State management), and
 * mirroring them into a store is exactly the staleness this signal prevents.
 *
 * ## Why it lives in `src/lib/` and not in a feature
 *
 * It began in `features/flashcards/hooks/`, and both change-data-model notes said to promote
 * it once a third feature needed it rather than copy it. Workflow C's ingest feature is that
 * third consumer (settings and flashcards were the first two), so it moved here. `src/lib/`
 * rather than `src/db/`: `src/db/` holds the schema and the repositories, and a React hook
 * there would mix layers, whereas `src/lib/theme-store.ts` is already React-facing and sets
 * the precedent.
 *
 * **Do not copy this.** Two copies would mean two screens disagreeing about what is current.
 */
const listeners = new Set<() => void>()

/** Bumped on every write. A counter, not a boolean, so subscriptions re-fire reliably. */
let version = 0

export function notifyDataChanged(): void {
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): number {
  return version
}

/**
 * Re-runs `load` whenever the database changes, and returns the loaded value.
 *
 * `load` is expected to be stable (a module-level repository import), and putting it in the
 * dependency list is what makes the effect re-run on a version bump without also re-running on
 * every render.
 */
export function useDatabaseValue<T>(
  load: () => Promise<T>,
  initial: T,
): { value: T; loading: boolean; revision: number; reload: () => void } {
  const revision = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [value, setValue] = React.useState<T>(initial)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    load()
      .then((next) => {
        // Guard against a resolved promise from an earlier revision overwriting a newer read.
        if (cancelled) return
        setValue(next)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        // A read failure leaves the previous value on screen rather than blanking the screen.
        // She cannot act on a stack trace; a stale number plus a retry is survivable.
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [load, revision])

  return { value, loading, revision, reload: notifyDataChanged }
}
