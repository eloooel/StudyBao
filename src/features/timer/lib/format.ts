/**
 * Turning a duration into the string on screen.
 *
 * In `lib/` rather than beside the component for two reasons: it is pure arithmetic with an edge
 * case worth testing directly, and exporting a non-component from a component file trips
 * `react-refresh/only-export-components`, which exists to keep fast refresh working.
 */

/**
 * `MM:SS`, rounded **up**.
 *
 * Rounding up rather than down is the difference between a timer that shows `00:01` for a whole
 * second and one that briefly shows `00:00` while the block is still running. The second reads as
 * broken, and it happens on every single block.
 *
 * Negative input is floored rather than formatted, so a stale value can never render `-01:-30`.
 */
export function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Minutes as a short human phrase, for labels like "25 minutes". */
export function describeMinutes(minutes: number): string {
  return `${String(minutes)} minute${minutes === 1 ? '' : 's'}`
}
