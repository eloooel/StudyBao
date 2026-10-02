/**
 * The sound cue on a phase change.
 *
 * ## Why this is not an audio file
 *
 * A couple of oscillators are a few hundred bytes and no network request. An `.mp3` would be a
 * binary in the repo or an asset to copy, for a beep. `BUILD_GUIDE.md` §4 asks for a sound cue, not
 * for a particular sound.
 *
 * ## The constraint that decides the design
 *
 * **Browsers only allow audio after a user gesture.** An `AudioContext` created at page load starts
 * `suspended`, and a cue played from a timer callback would be silent — which is the worst possible
 * failure here, because it is silent and therefore unnoticeable. §4 names it: "unlock it on the
 * first Start press, or the first cue is silent."
 *
 * So the context is created **lazily, on the first `playCue` call**, and every `playCue` call
 * happens inside a press handler (`Start`, `Skip`, `Reset`). The one exception is the cue fired when
 * a phase ends on its own, which is a timer callback — and by then the context has already been
 * created and resumed by an earlier press, so it is unlocked.
 *
 * Failures are swallowed on purpose. A device that refuses audio must not break the timer: the
 * visual state change is the primary signal (`BUILD_GUIDE.md` §4 asks for both).
 */

/** One reusable context. Creating one per cue leaks a context, and browsers cap them. */
let context: AudioContext | undefined

/** Which tone each transition gets. Rising for work, falling for a break. */
export type CueKind = 'workStarted' | 'breakStarted' | 'longBreakStarted'

const TONES: Record<CueKind, { frequencies: number[]; durationMs: number }> = {
  // Rising: "go".
  workStarted: { frequencies: [660, 880], durationMs: 140 },
  // Falling and lower: "rest".
  breakStarted: { frequencies: [587, 440], durationMs: 160 },
  // A longer, distinct pair so a long break is never mistaken for a short one.
  longBreakStarted: { frequencies: [523, 392, 330], durationMs: 200 },
}

/**
 * Whether audio has been unlocked by a user gesture yet.
 *
 * Exported so the view can decide whether to explain itself — and, more importantly, so a test can
 * assert the unlock happened during a press rather than at mount, which is the bug §4 warns about.
 */
export function isCueUnlocked(): boolean {
  return context !== undefined && context.state === 'running'
}

/**
 * Play the cue for a transition. Safe to call anywhere; never throws.
 *
 * Returns whether a tone was actually produced, so a caller that cares can tell the difference
 * between "muted" and "played".
 */
export function playCue(kind: CueKind): boolean {
  const audio = ensureContext()
  if (audio === undefined) return false

  try {
    const tone = TONES[kind]
    // Small offset so the first note is not scheduled at exactly `currentTime`, which some
    // implementations clip.
    let at = audio.currentTime + 0.01

    for (const frequency of tone.frequencies) {
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.value = frequency

      // A short attack and a fade-out rather than a square gate: an abrupt start or stop on a
      // non-zero sample is an audible click, which sounds like a fault rather than a cue.
      const seconds = tone.durationMs / 1000
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.18, at + 0.02)
      gain.gain.linearRampToValueAtTime(0, at + seconds)

      oscillator.connect(gain)
      gain.connect(audio.destination)
      oscillator.start(at)
      oscillator.stop(at + seconds)

      at += seconds * 0.8
    }

    return true
  } catch {
    // A refused or unsupported audio stack must never break the timer. The visual transition
    // carries the same information.
    return false
  }
}

/**
 * Create or resume the context. Returns `undefined` when audio is unavailable.
 *
 * `resume()` is called on every cue, not just the first: a context can be suspended again by the
 * browser after a long period of backgrounding, and a suspended context plays nothing.
 */
function ensureContext(): AudioContext | undefined {
  try {
    if (context === undefined) {
      const Ctor = globalThis.AudioContext
      if (Ctor === undefined) return undefined
      context = new Ctor()
    }

    if (context.state === 'suspended') {
      // Deliberately not awaited. The cue is scheduled immediately after, and awaiting here would
      // make the caller's press handler async for no benefit — a resumed context plays the nodes
      // queued after the resume resolves.
      void context.resume()
    }

    return context
  } catch {
    return undefined
  }
}

/**
 * Release the context. **Tests only.**
 *
 * Not called by the app: a single context reused for the life of the tab is the correct shape, and
 * closing it would mean the next cue re-pays the unlock. Tests need it because jsdom shares one
 * module registry across a file.
 */
export function resetCueForTests(): void {
  context = undefined
}
