import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React Testing Library only auto-cleans when `globals` is on, and we keep globals
// off so every test imports what it uses. Without this, renders leak between tests
// and failures become order-dependent.
afterEach(() => {
  cleanup()
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
