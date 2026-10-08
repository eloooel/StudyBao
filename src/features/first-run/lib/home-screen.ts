/**
 * The Add to Home Screen decision, and the only reads of the environment it needs.
 *
 * Why this is a pure function taking an object rather than a check inside a component: the whole
 * point is that an agent cannot open a browser or hold an iPad, so `window` is the one thing this
 * decision must not depend on. Everything real — `navigator.platform` and friends — is read by
 * `readHomeScreenEnvironment` below, at the edge, and the decision sees only plain values.
 *
 * See docs/adr/0008-add-to-home-screen-on-ipad.md for why the prompt exists at all, and
 * `src/features/first-run/components/` for how the copy is worded.
 *
 * ## This file is deliberately free of one word
 *
 * The UI rule is flat — never that word on a screen — and a rule that lives only on screens is a rule
 * that eventually lands in a `title` attribute or an `aria-label`. So nothing here uses it, including
 * identifiers: `showAddToHomeScreen`, `shouldPromptHomeScreen`. Nothing here needs it: "add to the
 * Home Screen" is the whole concept and there is no second thing to confuse it with.
 *
 * **One deliberate exception, and it is not in this feature.** The stored field is
 * `AppSettings.installPromptSeenAt`, which is the name the brief for this work specifies and the name
 * already written into `docs/BUILD_GUIDE.md` §6. Renaming a synced field to satisfy a copy rule is the
 * wrong trade — the rule governs what she reads, and a field name is not read by anyone but us. The
 * mismatch is recorded here rather than left for someone to trip over.
 */

/** What the device reports, reduced to the three facts the decision turns on. */
export interface HomeScreenEnvironment {
  /**
   * `navigator.platform`.
   *
   * **iPadOS 13 and later reports `'MacIntel'`**, not `'iPad'`. A check for `'iPad'` alone
   * therefore fails on every modern iPad — which is exactly the device this is for — while a Mac
   * with a trackpad reports the same `'MacIntel'`. That is why `maxTouchPoints` is not optional
   * here, and why both strings are accepted: see `isIpadOs`.
   */
  platform: string
  /** `navigator.maxTouchPoints`. An iPhone reports 5, an iPad 5, a Mac 0. */
  maxTouchPoints: number
  /**
   * `matchMedia('(display-mode: standalone)').matches || navigator.standalone`.
   *
   * Both halves are needed and the second is not redundant: the media query is the portable one,
   * and `navigator.standalone` is the iOS-specific one that older iPadOS versions report instead.
   */
  standalone: boolean
}

/** The platform strings iPadOS has reported. `'MacIntel'` is iPadOS 13 and later. */
const IPAD_PLATFORM_STRINGS = ['MacIntel', 'iPad']

/**
 * Whether this is iPadOS, in any browser.
 *
 * `'MacIntel'` (or the legacy `'iPad'`) **and** a touch screen, and both halves are load-bearing:
 * the platform string alone is also every Intel Mac, and a touch screen alone is every Windows
 * laptop.
 *
 * The legacy string is included because **no one on this project has observed an iPadOS 12 device**
 * and it costs nothing to accept it: `'iPad'` is not a string any Mac reports, so accepting it
 * cannot let a laptop through, while rejecting it could silently deny the prompt to an older iPad —
 * failure in the direction that loses her data. The touch-point requirement still stands, so the
 * only thing that would newly qualify is a touch-screen device claiming to be an iPad, which is an
 * iPad.
 */
export function isIpadOs(
  environment: Pick<HomeScreenEnvironment, 'platform' | 'maxTouchPoints'>,
): boolean {
  return IPAD_PLATFORM_STRINGS.includes(environment.platform) && environment.maxTouchPoints > 1
}

/**
 * Whether to show the Home Screen prompt now.
 *
 * `homeScreenPromptSeenAt !== undefined` is passed in as `alreadySeen` rather than the timestamp
 * itself: the decision is about whether it is set, and taking the number would invite a caller to
 * compare it to something.
 *
 * The four cases this must get right, in the order they are tested in
 * `home-screen.test.ts`: iPadOS in a Safari tab (yes), inside the Home Screen app (no), on an
 * iPhone (no), on the Windows laptop (no).
 */
export function shouldPromptHomeScreen(
  environment: HomeScreenEnvironment,
  alreadySeen: boolean,
): boolean {
  return isIpadOs(environment) && !environment.standalone && !alreadySeen
}

/**
 * Whether the Settings card should offer the how-to rather than report that she is already set.
 *
 * The card is permanent and cannot be dismissed, so it must not look identical after she has done
 * the thing it asks for — a card that never changes is a nag wearing a helpful hat. This is the
 * difference between its two states: steps when they are still useful, and a plain confirmation
 * when the address bar is already gone.
 */
export function showHomeScreenSteps(environment: HomeScreenEnvironment): boolean {
  return isIpadOs(environment) && !environment.standalone
}

/** The two states ADR 0008's platform posture actually has, plus "not this device". */
export type HomeScreenState = 'desktop' | 'add-now' | 'already-added'

/**
 * Which of the Settings card's three states applies.
 *
 * `'desktop'` is not a lesser version of the others: on Windows there is no eviction timer and a
 * browser tab is durable, so ADR 0008 item 6 says to say nothing. It exists so the card can be
 * explicit about that rather than silently empty.
 */
export function homeScreenState(environment: HomeScreenEnvironment): HomeScreenState {
  if (!isIpadOs(environment)) return 'desktop'
  return environment.standalone ? 'already-added' : 'add-now'
}

/**
 * The environment, read from the browser. **The only impure function in this file.**
 *
 * Every `window` read is guarded: this runs in a browser, in jsdom, and — during a Vitest import
 * graph — potentially in a context where a partial global exists. `matchMedia` in particular is
 * not implemented by jsdom (see `src/test/setup.ts`), and the theme resolver already documents the
 * `?.` guard as load-bearing. Throwing here would take the whole shell down on a device that is
 * merely old, which is a worse failure than not showing a prompt.
 */
export function readHomeScreenEnvironment(): HomeScreenEnvironment {
  return {
    platform: typeof navigator === 'undefined' ? '' : navigator.platform,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
    standalone: readStandalone(),
  }
}

const STANDALONE_QUERY = '(display-mode: standalone)'

function readStandalone(): boolean {
  if (typeof window === 'undefined') return false

  const fromMediaQuery = window.matchMedia?.(STANDALONE_QUERY)?.matches === true
  // `navigator.standalone` is iOS-specific and is not in TypeScript's `Navigator`, hence the
  // narrowing rather than a cast to `any` (which this codebase bans outright).
  const fromNavigator = (navigator as Navigator & { standalone?: boolean }).standalone === true

  return fromMediaQuery || fromNavigator
}

/**
 * Call `onChange` whenever the display mode changes, and return an unsubscribe.
 *
 * Subscribed to rather than read once because the prompt's own advice can be acted on without a
 * reload: iOS adds the icon and the running Safari tab keeps going. This is also what lets the
 * Settings card flip from steps to confirmation in the same session, instead of the two of them
 * disagreeing about what she has done.
 *
 * `addListener` is the pre-14 spelling of `addEventListener` on a `MediaQueryList`, which is the
 * same old-iPadOS population the `navigator.standalone` half of the check exists for.
 */
export function subscribeToDisplayMode(onChange: (standalone: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const list = window.matchMedia?.(STANDALONE_QUERY)
  if (!list) return () => {}

  const handle = () => onChange(readStandalone())

  list.addEventListener('change', handle)
  return () => list.removeEventListener('change', handle)
}
