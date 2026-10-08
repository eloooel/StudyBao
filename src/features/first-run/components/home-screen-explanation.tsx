import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { ShareSheetDiagram } from './share-sheet-diagram'

/**
 * Why adding StudyBao to her Home Screen is worth two taps — the explanation, written once.
 *
 * One component, used by both places it appears: the first-run prompt, and the Settings card's
 * permanent "How to add it". Two copies of this copy would eventually disagree about which rows she
 * has to tap, and the copy is the entire instruction — a wrong row in one of them is a defect she
 * cannot see and we cannot test.
 *
 * ## The word this file does not contain
 *
 * The UI rule is flat (CLAUDE.md, UX rules): never the word, on any screen. It is also not *needed* —
 * "add it to your Home Screen" names the action exactly, and naming the thing we are not asking for
 * would reintroduce the frame the rule exists to avoid. So the reassurance is said positively
 * instead: it is the same page, Safari just is not allowed to clear it.
 *
 * That rule is asserted against what is actually **rendered**, in `first-run.test.tsx`, rather than
 * against this file — the file is not where copy goes wrong, and a comment cannot fail a build.
 */
export interface HomeScreenExplanationProps {
  /** Hides the diagram when the same words are being read for the second time from Settings. */
  showDiagram?: boolean
  className?: string
}

export function HomeScreenExplanation({
  showDiagram = true,
  className,
}: HomeScreenExplanationProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <p className="font-display text-lg font-semibold text-ink">
        Two taps, and it stops your notes from being cleared.
      </p>

      <p className="text-sm leading-relaxed text-ink-muted">
        Your iPad clears a website&rsquo;s saved data after about a week of not visiting it. A Home
        Screen icon is the one exception — that copy is kept safe.
      </p>

      <ol className="flex flex-col gap-2 text-sm leading-relaxed text-ink">
        <li className="flex gap-3">
          <StepNumber>1</StepNumber>
          <span>
            Tap the <strong className="font-semibold">Share</strong> button in Safari&rsquo;s
            toolbar — the square with the arrow coming out of it. It lives in the bar at the bottom
            of the screen.
          </span>
        </li>
        <li className="flex gap-3">
          <StepNumber>2</StepNumber>
          <span>
            Scroll down and tap <strong className="font-semibold">Add to Home Screen</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <StepNumber>3</StepNumber>
          <span>
            Tap <strong className="font-semibold">Add</strong>.
          </span>
        </li>
      </ol>

      {showDiagram ? <ShareSheetDiagram /> : null}

      <p className="text-sm leading-relaxed text-ink-muted">
        Nothing gets downloaded and there is nothing to buy. It is the same page — Safari just
        isn&rsquo;t allowed to clear it.
      </p>
    </div>
  )
}

function StepNumber({ children }: { children: string }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-display text-xs font-bold text-on-primary"
    >
      {children}
    </span>
  )
}

/**
 * The confirmation state, for once it is actually on her Home Screen.
 *
 * The Settings card is permanent and cannot be dismissed, so it must not look identical before and
 * after she has done the thing it asks — that would be a nag wearing a helpful hat. This is the
 * other half of that pair, and it carries ADR 0008 item 4's advice: the icon and the Safari tab are
 * separate storage containers, and the Safari one is the one that gets deleted.
 */
export function HomeScreenAddedNotice() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-ink">
        Your notes are safe — you&rsquo;ve added StudyBao to your Home Screen.
      </p>
      <p className="text-sm leading-relaxed text-ink-muted">
        Open it from that icon rather than this Safari tab. They keep separate copies, and the
        Safari one is the copy that can be cleared.
      </p>
    </div>
  )
}

/**
 * The desktop state. ADR 0008 item 6 is explicit that the laptop is left alone: Chrome and Edge have
 * no eviction timer, so a tab there is durable, and suggesting an icon would add a maintenance
 * surface for nothing.
 */
export function HomeScreenNotNeededNotice() {
  return (
    <p className="text-sm leading-relaxed text-ink-muted">
      Nothing to do here. This is a laptop, where a browser tab keeps its data — the clearing
      problem is an iPad one, and StudyBao handles it for you there.
    </p>
  )
}

/**
 * The Settings card's action: one button that opens the explanation in a modal.
 *
 * Kept next to the explanation rather than in the Settings view because the two are one decision —
 * what the card offers and what opening it shows cannot drift apart if they live in one file.
 */
export interface HomeScreenHelpButtonProps {
  onOpen: () => void
}

export function HomeScreenHelpButton({ onOpen }: HomeScreenHelpButtonProps) {
  return (
    <div>
      <Button variant="secondary" onClick={onOpen}>
        How to add it
      </Button>
    </div>
  )
}
