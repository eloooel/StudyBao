/*
 * The `@testing-library/jest-dom/vitest` import is **load-bearing for the typecheck**, not just
 * for the matchers at runtime: it is what augments vitest's `Assertion` interface. Without it every
 * `expect(...).toBeInTheDocument()` in the suite fails `tsc` while passing at runtime, which is a
 * confusing way to spend an afternoon. Do not remove it.
 */
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { resetDatabaseForTestsIfUsed } from '@/db/schema'

// React Testing Library only auto-cleans when `globals` is on, and we keep globals
// off so every test imports what it uses. Without this, renders leak between tests
// and failures become order-dependent.
afterEach(async () => {
  cleanup()
  // The same reason, for the database. The app's Dexie handle is a module-level singleton over a
  // shared in-memory IndexedDB, so without an explicit wipe a deck created in one test is visible
  // in the next and the suite becomes order-dependent.
  //
  // This re-seeds as well as wipes, so every test starts from the state a real first launch
  // produces: the five PRC decks and a settings row. A test that needs a *pre-first-launch*
  // database should call `clearDatabaseForTests()` itself.
  //
  // It is a no-op when nothing touched the database, so the ~200 tests that are pure logic or
  // component rendering do not pay for an IndexedDB open and re-seed after every case.
  await resetDatabaseForTestsIfUsed()
})

// jsdom does not implement matchMedia. The theme resolver reads it, so tests need
// a stand-in. This is a plain function rather than a vi.fn() because `restoreMocks`
// resets mock implementations between tests, which would leave this returning
// undefined and make the theme tests order-dependent.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

/*
 * jsdom implements <dialog> only partially — `showModal()` and `close()` are
 * missing. The Modal component deliberately uses the native element in
 * production, because that is what gives real focus containment and real Escape
 * handling rather than a hand-rolled approximation.
 *
 * So rather than replacing the component with a div and losing those semantics,
 * tests get a minimal shim for the two methods and exercise the component's own
 * handlers directly.
 */
const dialogPrototype = globalThis.HTMLDialogElement?.prototype

if (dialogPrototype && typeof dialogPrototype.showModal !== 'function') {
  dialogPrototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }

  dialogPrototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}
