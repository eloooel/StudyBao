import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { CardsIcon } from '@/components/icons'
import type { Deck } from '@/db/types'
import { cn } from '@/lib/cn'
import type { IngestTabStatus, IngestViewProps } from '../types'
import { PasteTextArea } from './paste-text-area'

/**
 * Layer 3 — the ingest screen. No hooks, no database.
 *
 * The tabs are the three paths `BUILD_GUIDE.md` §4 names, and the ones that are not built
 * yet are **visible but disabled with a reason**, the way the Timer's Start button is. Hiding
 * them would leave her wondering whether she had missed a way to upload a photo; a disabled
 * control that says "next" answers the question in one line.
 *
 * Paste is the default tab deliberately. It is the highest-fidelity path — no OCR error at
 * all — and the guide's advice is to lead with it and label photo OCR as best-effort.
 */
export function IngestView({
  tab,
  tabs,
  onSelectTab,
  decks,
  deckId,
  onSelectDeck,
  text,
  onChangeText,
  onSubmit,
  lineCount,
  persistenceNote,
  error,
}: IngestViewProps) {
  const active = tabs.find((entry) => entry.id === tab)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl">Add from your notes</h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          Paste your notes and StudyBao will pull out the definitions it recognises. You get to
          check every card before anything is saved.
        </p>
      </header>

      <div role="tablist" aria-label="Where the notes come from" className="flex flex-wrap gap-2">
        {tabs.map((entry) => (
          <TabButton
            key={entry.id}
            entry={entry}
            selected={entry.id === tab}
            onSelect={() => onSelectTab(entry.id)}
          />
        ))}
      </div>

      <Card>
        <CardHeader title={active?.label ?? 'Add notes'} description={active?.note ?? undefined} />
        <CardContent className="flex flex-col gap-4">
          {tab === 'paste' ? (
            <>
              <PasteTextArea
                label="Your notes"
                value={text}
                onChange={onChangeText}
                placeholder={
                  'Vitamin C: ascorbic acid\nIron - ferrous sulfate\nQ1. What is the antidote?\nA1. N-acetylcysteine'
                }
                hint="One definition per line works best, either “Term: definition” or “Term - definition”. Anything it can't turn into a card waits for you on the next screen — nothing is thrown away."
              />

              <label className="flex flex-col gap-1.5">
                <span className="font-display text-sm font-semibold text-ink">
                  Which deck should these go in?
                </span>
                <select
                  value={deckId}
                  onChange={(event) => onSelectDeck(event.target.value)}
                  className={cn(
                    'min-h-12 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-base text-ink',
                    'focus-visible:border-accent focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent',
                  )}
                >
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" disabled={lineCount === 0} onClick={onSubmit}>
                  Find my cards
                </Button>
                <span className="text-sm text-ink-muted" role="status">
                  {lineCount === 0
                    ? 'Nothing to read yet'
                    : `${lineCount} line${lineCount === 1 ? '' : 's'} ready`}
                </span>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<CardsIcon className="size-6" />}
              title={active?.label ?? 'Not built yet'}
              message={active?.note ?? 'This path is not ready yet.'}
            />
          )}

          {persistenceNote !== undefined ? (
            <p className="rounded-[var(--radius-card)] border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink-muted">
              {persistenceNote}
            </p>
          ) : null}

          {error !== undefined ? (
            <p role="alert" className="text-sm font-semibold text-accent">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function TabButton({
  entry,
  selected,
  onSelect,
}: {
  entry: IngestTabStatus
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      disabled={!entry.enabled}
      onClick={onSelect}
      className={cn(
        'min-h-11 rounded-[var(--radius-control)] border px-4 font-display text-sm font-semibold transition-colors',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent',
        selected
          ? 'border-accent bg-primary text-on-primary'
          : 'border-line bg-surface text-ink-muted hover:text-ink',
        !entry.enabled && 'cursor-not-allowed opacity-55',
      )}
    >
      {entry.label}
    </button>
  )
}

/** Deck list for the picker, kept here so the page does not import a `<select>` shape. */
export type IngestDeckOption = Pick<Deck, 'id' | 'name'>
