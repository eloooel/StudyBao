import { describe, expect, it } from 'vitest'

import {
  homeScreenState,
  isIpadOs,
  showHomeScreenSteps,
  shouldPromptHomeScreen,
  type HomeScreenEnvironment,
} from './home-screen'

/**
 * The decision, tested with plain objects and no `window`.
 *
 * That constraint is the point of the module: nobody on this project has an iPad in the loop, so a
 * test that goes through the real `navigator` would be asserting against jsdom rather than against
 * iPadOS. Every case below is a device stated as data.
 *
 * `docs/REVEAL-FIRST-RUN.md` requires these four at minimum:
 *
 *   1. iPadOS in a Safari tab — prompt
 *   2. inside the Home Screen app — no prompt
 *   3. on an iPhone — no prompt
 *   4. on the Windows laptop — no prompt
 *
 * The remaining cases are here because each one is a way the first four can pass while the
 * predicate is still wrong.
 */

/** iPadOS 13+, in Safari, not added to the Home Screen. */
const IPAD_SAFARI: HomeScreenEnvironment = {
  platform: 'MacIntel',
  maxTouchPoints: 5,
  standalone: false,
}
/** The same device, opened from the Home Screen icon. */
const IPAD_HOME_SCREEN: HomeScreenEnvironment = { ...IPAD_SAFARI, standalone: true }
/** iPadOS reported the old way, which is the population `navigator.standalone` exists for. */
const OLD_IPAD: HomeScreenEnvironment = { platform: 'iPad', maxTouchPoints: 5, standalone: false }
const IPHONE: HomeScreenEnvironment = { platform: 'iPhone', maxTouchPoints: 5, standalone: false }
const WINDOWS_LAPTOP: HomeScreenEnvironment = {
  platform: 'Win32',
  maxTouchPoints: 0,
  standalone: false,
}
/** A reachable Windows machine, and the case a `maxTouchPoints`-only check gets wrong. */
const TOUCHSCREEN_LAPTOP: HomeScreenEnvironment = {
  platform: 'Win32',
  maxTouchPoints: 10,
  standalone: false,
}
/** 'MacIntel' with no touch screen: the other half of the trap. */
const MAC_WITH_TRACKPAD: HomeScreenEnvironment = {
  platform: 'MacIntel',
  maxTouchPoints: 0,
  standalone: false,
}
const ANDROID_TABLET: HomeScreenEnvironment = {
  platform: 'Linux aarch64',
  maxTouchPoints: 5,
  standalone: false,
}

describe('isIpadOs', () => {
  it('is true for iPadOS 13+, which reports itself as MacIntel', () => {
    expect(isIpadOs(IPAD_SAFARI)).toBe(true)
  })

  it('is true for the old iPad platform string as well', () => {
    expect(isIpadOs(OLD_IPAD)).toBe(true)
  })

  it('is false for an Intel Mac, which reports the same platform string', () => {
    expect(isIpadOs(MAC_WITH_TRACKPAD)).toBe(false)
  })

  it('is false for a touchscreen Windows laptop', () => {
    expect(isIpadOs(TOUCHSCREEN_LAPTOP)).toBe(false)
  })

  it('is false for an iPhone', () => {
    expect(isIpadOs(IPHONE)).toBe(false)
  })

  /**
   * The regression guard, and the reason the iPad cases above are worth trusting.
   *
   * The obvious check — `platform === 'iPad'` — is wrong on every iPad made since 2019, and that
   * was the real trap in this task. The naive predicate is written out here and run against the
   * same devices, so this test fails if `isIpadOs` ever quietly becomes it again.
   *
   * Note which case catches that: the legacy `'iPad'` device passes the naive check too, so a suite
   * that tested only `OLD_IPAD` would stay green through the bug. The modern iPad is the one that
   * distinguishes them — which is precisely the device this feature exists for.
   */
  it('is not the naive platform check, which fails on every modern iPad', () => {
    const naive = (environment: HomeScreenEnvironment) => environment.platform === 'iPad'

    expect(naive(IPAD_SAFARI)).toBe(false) // the naive check says "not an iPad"
    expect(isIpadOs(IPAD_SAFARI)).toBe(true) // the real one says it is

    // And it stays right about the device the naive check was written for:
    expect(naive(OLD_IPAD)).toBe(true)
    expect(isIpadOs(OLD_IPAD)).toBe(true)

    // Dropping the touch-screen half is the other way to get this wrong, and it is the more
    // expensive one: it would put a Home Screen prompt in front of every Mac user.
    expect(isIpadOs(MAC_WITH_TRACKPAD)).toBe(false)
  })
})

describe('shouldPromptHomeScreen', () => {
  it('prompts on iPadOS in a Safari tab', () => {
    expect(shouldPromptHomeScreen(IPAD_SAFARI, false)).toBe(true)
  })

  it('does not prompt inside the Home Screen app', () => {
    expect(shouldPromptHomeScreen(IPAD_HOME_SCREEN, false)).toBe(false)
  })

  it('does not prompt on an iPhone', () => {
    expect(shouldPromptHomeScreen(IPHONE, false)).toBe(false)
  })

  it('does not prompt on the Windows laptop', () => {
    expect(shouldPromptHomeScreen(WINDOWS_LAPTOP, false)).toBe(false)
  })

  it('does not prompt on a touchscreen Windows laptop', () => {
    expect(shouldPromptHomeScreen(TOUCHSCREEN_LAPTOP, false)).toBe(false)
  })

  it('does not prompt on a Mac with a trackpad', () => {
    expect(shouldPromptHomeScreen(MAC_WITH_TRACKPAD, false)).toBe(false)
  })

  it('does not prompt on an Android tablet', () => {
    expect(shouldPromptHomeScreen(ANDROID_TABLET, false)).toBe(false)
  })

  it('does not prompt a second time once she has seen it', () => {
    expect(shouldPromptHomeScreen(IPAD_SAFARI, true)).toBe(false)
  })

  /**
   * A skip and a dismissal are the same fact, so both stamp `homeScreenPromptSeenAt`. This asserts
   * the consequence: there is no input that shows the prompt twice.
   */
  it('has no input that prompts twice', () => {
    const everyDevice = [
      IPAD_SAFARI,
      IPAD_HOME_SCREEN,
      OLD_IPAD,
      IPHONE,
      WINDOWS_LAPTOP,
      ANDROID_TABLET,
    ]
    expect(everyDevice.every((device) => !shouldPromptHomeScreen(device, true))).toBe(true)
  })
})

describe('homeScreenState', () => {
  it('offers the steps on iPadOS before it has been added', () => {
    expect(homeScreenState(IPAD_SAFARI)).toBe('add-now')
    expect(showHomeScreenSteps(IPAD_SAFARI)).toBe(true)
  })

  it('confirms rather than instructs once it is on the Home Screen', () => {
    expect(homeScreenState(IPAD_HOME_SCREEN)).toBe('already-added')
    expect(showHomeScreenSteps(IPAD_HOME_SCREEN)).toBe(false)
  })

  it('says nothing about Home Screen setup on the laptop, because there is nothing to do there', () => {
    expect(homeScreenState(WINDOWS_LAPTOP)).toBe('desktop')
    expect(showHomeScreenSteps(WINDOWS_LAPTOP)).toBe(false)
  })

  it('treats the iPhone as a device this is not for', () => {
    expect(homeScreenState(IPHONE)).toBe('desktop')
  })

  /**
   * The card is permanent, so the one thing it must never do is show the instructions again to
   * someone who has already followed them.
   */
  it('never returns the steps in the already-added state', () => {
    const added: HomeScreenEnvironment[] = [
      IPAD_HOME_SCREEN,
      { platform: 'iPad', maxTouchPoints: 5, standalone: true },
    ]
    expect(added.every((device) => !showHomeScreenSteps(device))).toBe(true)
  })
})
