import { afterEach, describe, expect, it, vi } from 'vitest'

import { isCueUnlocked, playCue, resetCueForTests } from './cue'

/**
 * The sound cue.
 *
 * jsdom has no `AudioContext`, so a fake is installed. What is worth testing is not the waveform
 * but the two things that decide whether she ever hears anything:
 *
 * 1. **The context is created on a cue, never at import.** A context created at page load starts
 *    `suspended`, and a cue from a timer callback is then silent — the failure
 *    `docs/BUILD_GUIDE.md` §4 says to avoid by unlocking on the first Start press.
 * 2. **Nothing here ever throws.** A device that refuses audio must not break the timer.
 */

interface FakeNode {
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

function installFakeAudio(options: { state?: AudioContextState; throwOnResume?: boolean } = {}) {
  const created: number[] = []
  const oscillators: { type: string; frequency: { value: number } }[] = []
  const gains: {
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>
      linearRampToValueAtTime: ReturnType<typeof vi.fn>
    }
  }[] = []

  class FakeAudioContext {
    state: AudioContextState = options.state ?? 'running'
    currentTime = 0
    destination = {}
    resume = vi.fn(() => {
      if (options.throwOnResume === true) throw new Error('refused')
      this.state = 'running'
      return Promise.resolve()
    })

    constructor() {
      created.push(1)
    }

    createOscillator(): FakeNode & { type: string; frequency: { value: number } } {
      const node = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      oscillators.push(node)
      return node
    }

    createGain() {
      const node = {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }
      gains.push(node)
      return node
    }
  }

  vi.stubGlobal('AudioContext', FakeAudioContext)
  return { created, oscillators, gains }
}

afterEach(() => {
  resetCueForTests()
  vi.unstubAllGlobals()
})

describe('playCue', () => {
  it('does not create an audio context until a cue is played', () => {
    // The unlock rule. Creating one at import or at mount would leave it suspended, and the first
    // cue — the whole point of the feature — would be silent.
    const { created } = installFakeAudio()

    expect(isCueUnlocked()).toBe(false)
    expect(created).toHaveLength(0)

    playCue('workStarted')

    expect(created).toHaveLength(1)
  })

  it('reuses one context across cues rather than leaking one per transition', () => {
    // Browsers cap the number of live AudioContexts, and a long study session fires many cues.
    const { created } = installFakeAudio()

    playCue('workStarted')
    playCue('breakStarted')
    playCue('longBreakStarted')

    expect(created).toHaveLength(1)
  })

  it('produces a distinct number of tones per transition', () => {
    // A long break must not sound like a short one; that is the entire informational content of
    // the cue when she is not looking at the screen.
    const first = installFakeAudio()

    playCue('breakStarted')
    expect(first.oscillators).toHaveLength(2)

    // The module caches its context, so the cache has to be dropped before a second fake can be
    // observed — otherwise the second `playCue` reuses the first context and this asserts nothing.
    resetCueForTests()
    const second = installFakeAudio()

    playCue('longBreakStarted')
    expect(second.oscillators.length).toBeGreaterThan(2)
  })

  it('ramps gain instead of gating it, so there is no click', () => {
    const { gains } = installFakeAudio()

    playCue('workStarted')

    expect(gains.length).toBeGreaterThan(0)
    expect(gains[0]?.gain.setValueAtTime).toHaveBeenCalled()
    // Attack then release, both scheduled.
    expect(gains[0]?.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(2)
  })

  it('resumes a context the browser suspended again', () => {
    // A context can be suspended after a long period of backgrounding, and a suspended one plays
    // nothing — so resuming must not be a one-time thing at unlock.
    const { created } = installFakeAudio({ state: 'suspended' })

    const played = playCue('workStarted')

    expect(played).toBe(true)
    expect(created).toHaveLength(1)
  })

  it('reports failure instead of throwing when audio is unavailable', () => {
    // A device that refuses audio must not break the timer; the visual change carries the same
    // information.
    vi.stubGlobal('AudioContext', undefined)

    expect(() => playCue('workStarted')).not.toThrow()
    expect(playCue('workStarted')).toBe(false)
  })

  it('reports failure instead of throwing when the context constructor refuses', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('no audio for you')
        }
      },
    )

    expect(playCue('workStarted')).toBe(false)
  })
})
