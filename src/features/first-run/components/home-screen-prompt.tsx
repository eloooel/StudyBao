import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { HomeScreenExplanation } from './home-screen-explanation'

/**
 * The one-time first-run prompt. Layer 3 — pure props, no data access, no environment reads.
 *
 * ## Both ways out are the same fact
 *
 * "Got it" and "Skip for now" both close it and both stamp `homeScreenPromptSeenAt`. That is not a
 * shortcut: the field means *she has seen this and decided*, and it cannot mean anything else without
 * a second field that would eventually disagree with the first. The consequence is deliberate and
 * documented — a skip is final, and the permanent Settings card is what she can return to.
 *
 * The skip is a plain `ghost` button with its own visible label. Not a disguised one, not an "✕" that
 * is the only exit, and never a countdown or a second confirmation.
 *
 * The modal's own header supplies the `<h2>` title, which is why the explanation's first line is a
 * paragraph rather than a heading — see `HomeScreenExplanation`.
 */
export interface HomeScreenPromptProps {
  open: boolean
  /** Called for every exit: the primary button, the skip, the X, Escape, and a backdrop tap. */
  onDismiss: () => void
}

export function HomeScreenPrompt({ open, onDismiss }: HomeScreenPromptProps) {
  return (
    <Modal
      open={open}
      onClose={onDismiss}
      title="Add StudyBao to your Home Screen"
      description="It takes about ten seconds, and it's the thing that keeps your notes."
      className="w-[min(34rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="ghost" onClick={onDismiss}>
            Skip for now
          </Button>
          <Button onClick={onDismiss}>Got it</Button>
        </>
      }
    >
      <HomeScreenExplanation />
    </Modal>
  )
}
