import { useEffect } from 'react'

import { SparkleIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ProgressBar } from '@/components/ui/progress-bar'
import { GRADE_OPTIONS, gradeFromShortcut, shortcutForGrade } from '../lib/grades'
import type { ReviewCardViewProps } from '../types'

/**
 * Layer 3 — the review loop. Flip to reveal, four buttons to grade.
 *
 * Three behaviours here are deliberate and worth not "simplifying" later:
 *
 * 1. **Grading is not possible before revealing.** The four buttons only exist once the answer is
 *    on screen. Grading a card you have not read is not studying, it is tapping, and it would
 *    corrupt the schedule she is trusting.
 * 2. **Card content is rendered as text, never as HTML.** Cards will arrive from OCR and pasted
 *    notes (Workflow C), so the content is untrusted input by definition. React escaping it is
 *    the entire reason `dangerouslySetInnerHTML` does not appear here.
 *
 * The `msSpent` clock is owned by the page, which calls `markShown` when a card appears — this
 * view stays free of timers so it remains a pure function of its props.
 */
export function ReviewCardView({
  card,
  revealed,
  startCount,
  gradedCount,
  remaining,
  deckName,
  onReveal,
  onGrade,
  onEnd,
}: ReviewCardViewProps) {
  // Keyboard grading, for the laptop. Bound only while the answer is visible, so a stray
  // keypress cannot grade a card she has not read.
  useEffect(() => {
    if (!revealed || !card) return

    function handleKey(event: KeyboardEvent) {
      const grade = gradeFromShortcut(event.key)
      if (grade === undefined) return
      event.preventDefault()
      onGrade(grade)
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [revealed, card, onGrade])

  if (!card) {
    return (
      <EmptyState
        icon={<SparkleIcon className="size-6" />}
        title={startCount === 0 ? 'Nothing due right now' : 'That’s the lot'}
        message={
          startCount === 0
            ? 'Nothing in this deck is due yet. That’s the spacing doing its job — come back when a card is ready.'
            : `${gradedCount} card${gradedCount === 1 ? '' : 's'} reviewed. They’ll come back when they’re ready for you.`
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink-muted">{deckName}</p>
        <p className="text-sm text-ink-muted">
          {gradedCount + 1} of {startCount}
          {remaining > 0 ? ` · ${remaining} to go` : ''}
        </p>
      </div>

      <ProgressBar
        value={gradedCount}
        max={Math.max(1, startCount)}
        label="Session progress"
        showValue={false}
      />

      <button
        type="button"
        onClick={() => {
          if (!revealed) onReveal()
        }}
        aria-label={revealed ? undefined : 'Show the answer'}
        className="text-left"
      >
        <Card elevated className="min-h-56">
          <CardContent className="flex min-h-56 flex-col justify-center gap-4">
            <p className="font-display text-xl leading-snug font-semibold text-ink">{card.front}</p>

            {revealed ? (
              <div className="border-t border-line pt-4">
                <p className="text-base leading-relaxed whitespace-pre-wrap text-ink">
                  {card.back}
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Tap the card to see the answer.</p>
            )}
          </CardContent>
        </Card>
      </button>

      {revealed ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GRADE_OPTIONS.map((option) => (
              <Button
                key={option.grade}
                variant={option.variant}
                size="lg"
                onClick={() => onGrade(option.grade)}
                className="flex-col gap-0.5"
              >
                <span>{option.label}</span>
                <span className="text-xs font-normal opacity-80">
                  {option.hint} · {shortcutForGrade(option.grade)}
                </span>
              </Button>
            ))}
          </div>
          <p className="text-center text-xs text-ink-faint">
            On a keyboard, press 1–4. How you grade is what teaches the schedule when to bring it
            back.
          </p>
        </div>
      ) : null}

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={onEnd}>
          Finish for now
        </Button>
      </div>
    </div>
  )
}
