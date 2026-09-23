import { TimerView } from '../components/timer-view'

/** Layer 1 — thin route component. Defaults arrive from Settings once Workflow D lands. */
export default function TimerPage() {
  return <TimerView workMinutes={25} />
}
