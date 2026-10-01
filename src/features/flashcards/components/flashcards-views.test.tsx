import { describe, expect, it, vi } from 'vitest'

import type { Card } from '@/db/types'
import { render, screen } from '@/test/render'
import type { DeckSummary } from '../types'
import { DeckDetailView } from './deck-detail-view'
import { DeckListView } from './deck-list-view'
import { ReviewCardView } from './review-card-view'
import { CardFormView } from './card-form-view'

/**
 * Layer 3 views, tested for the behaviour that can actually be wrong.
 *
 * Deliberately **not** tested: Tailwind classes, layout, and anything asserted by snapshot. Those
 * are the tests the runbook bans, and they would break on every cosmetic change while catching
 * nothing. What is asserted here is the interaction contract the page depends on — a disclosure
 * that cannot be opened, or a grade button that reports the wrong grade, is a real defect.
 */

const NOW = new Date(2026, 8, 21, 10, 0, 0, 0).getTime()

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    deckId: 'deck-practice-i',
    front: 'What is the first link in the chain of infection?',
    back: 'The infectious agent.',
    tags: [],
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    learningStep: 0,
    nextReview: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function summary(overrides: Partial<DeckSummary> = {}): DeckSummary {
  return {
    deck: {
      id: 'deck-practice-i',
      subject: 'practice-i',
      name: 'Nursing Practice I',
      scope: 'Community Health Nursing',
      updatedAt: NOW,
    },
    totalCards: 0,
    dueCards: 0,
    masteredCards: 0,
    ...overrides,
  }
}

describe('DeckListView', () => {
  it('offers a review action only when something is due', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onStartReview = vi.fn()

    const { unmount } = render(
      <DeckListView
        decks={[summary({ dueCards: 3 })]}
        loading={false}
        totalDue={3}
        onOpenDeck={vi.fn()}
        onStartReview={onStartReview}
        onAddFromNotes={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Review now' }))
    expect(onStartReview).toHaveBeenCalledOnce()

    unmount()

    render(
      <DeckListView
        decks={[summary()]}
        loading={false}
        totalDue={0}
        onOpenDeck={vi.fn()}
        onStartReview={onStartReview}
        onAddFromNotes={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Review now' })).toBeNull()
  })

  it('offers the ingest path from the Cards screen', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onAddFromNotes = vi.fn()

    render(
      <DeckListView
        decks={[summary()]}
        loading={false}
        totalDue={0}
        onOpenDeck={vi.fn()}
        onStartReview={vi.fn()}
        onAddFromNotes={onAddFromNotes}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Add from your notes' }))
    expect(onAddFromNotes).toHaveBeenCalledOnce()
  })

  it('prompts her to add a first card when every deck is empty', () => {
    render(
      <DeckListView
        decks={[summary()]}
        loading={false}
        totalDue={0}
        onOpenDeck={vi.fn()}
        onStartReview={vi.fn()}
        onAddFromNotes={vi.fn()}
      />,
    )

    expect(screen.getByText('Your decks are ready')).toBeInTheDocument()
  })

  it('says nothing is due rather than claiming an empty deck once cards exist', () => {
    render(
      <DeckListView
        decks={[summary({ totalCards: 4 })]}
        loading={false}
        totalDue={0}
        onOpenDeck={vi.fn()}
        onStartReview={vi.fn()}
        onAddFromNotes={vi.fn()}
      />,
    )

    expect(screen.getByText('Nothing due right now')).toBeInTheDocument()
  })

  it('opens the deck she taps', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onOpenDeck = vi.fn()

    render(
      <DeckListView
        decks={[summary()]}
        loading={false}
        totalDue={0}
        onOpenDeck={onOpenDeck}
        onStartReview={vi.fn()}
        onAddFromNotes={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open deck' }))
    expect(onOpenDeck).toHaveBeenCalledWith('deck-practice-i')
  })
})

describe('DeckDetailView', () => {
  it('disables review and explains why when nothing is due', () => {
    render(
      <DeckDetailView
        deck={summary().deck}
        cards={[card()]}
        loading={false}
        dueCount={0}
        onBack={vi.fn()}
        onStartReview={vi.fn()}
        onAddCard={vi.fn()}
        onEditCard={vi.fn()}
        onDeleteCard={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Nothing due yet' })).toBeDisabled()
  })

  it('shows an empty state with a real action when there are no cards', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onAddCard = vi.fn()

    render(
      <DeckDetailView
        deck={summary().deck}
        cards={[]}
        loading={false}
        dueCount={0}
        onBack={vi.fn()}
        onStartReview={vi.fn()}
        onAddCard={onAddCard}
        onEditCard={vi.fn()}
        onDeleteCard={vi.fn()}
      />,
    )

    expect(screen.getByText('This deck is empty')).toBeInTheDocument()

    // Both the toolbar and the empty state offer the action, and both must work. The empty-state
    // button is the one inside the empty state, which is the second of the two.
    const addButtons = screen.getAllByRole('button', { name: 'Add a card' })
    expect(addButtons).toHaveLength(2)

    for (const button of addButtons) {
      await user.click(button)
    }
    expect(onAddCard).toHaveBeenCalledTimes(2)
  })

  it('labels a card by its schedule: learning, reviewing or mature', () => {
    render(
      <DeckDetailView
        deck={summary().deck}
        cards={[
          card({ id: 'a', learningStep: 0 }),
          card({ id: 'b', learningStep: null, intervalDays: 6 }),
          card({ id: 'c', learningStep: null, intervalDays: 21 }),
        ]}
        loading={false}
        dueCount={3}
        onBack={vi.fn()}
        onStartReview={vi.fn()}
        onAddCard={vi.fn()}
        onEditCard={vi.fn()}
        onDeleteCard={vi.fn()}
      />,
    )

    expect(screen.getByText('Learning')).toBeInTheDocument()
    expect(screen.getByText('Reviewing')).toBeInTheDocument()
    expect(screen.getByText('Mature')).toBeInTheDocument()
  })

  it('offers edit and delete per card and reports which card', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onEditCard = vi.fn()
    const onDeleteCard = vi.fn()
    const target = card({ id: 'the-card', front: 'Delete me' })

    render(
      <DeckDetailView
        deck={summary().deck}
        cards={[target]}
        loading={false}
        dueCount={1}
        onBack={vi.fn()}
        onStartReview={vi.fn()}
        onAddCard={vi.fn()}
        onEditCard={onEditCard}
        onDeleteCard={onDeleteCard}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEditCard).toHaveBeenCalledWith(target)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDeleteCard).toHaveBeenCalledWith(target)
  })
})

describe('ReviewCardView', () => {
  const baseProps = {
    card: card(),
    revealed: false,
    startCount: 3,
    gradedCount: 0,
    remaining: 2,
    waitingToReturn: 0,
    finished: false,
    deckName: 'Nursing Practice I',
    onGrade: vi.fn(),
    onEnd: vi.fn(),
  }

  it('hides the answer and every grade button until she reveals it', () => {
    render(<ReviewCardView {...baseProps} onReveal={vi.fn()} />)

    expect(screen.queryByText('The infectious agent.')).toBeNull()
    // Grading a card she has not read is not studying, so the buttons do not exist yet.
    expect(screen.queryByRole('button', { name: /Again/ })).toBeNull()
  })

  it('reveals the answer and then offers all four grades', () => {
    render(<ReviewCardView {...baseProps} revealed onReveal={vi.fn()} />)

    expect(screen.getByText('The infectious agent.')).toBeInTheDocument()
    for (const label of ['Again', 'Hard', 'Good', 'Easy']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it('asks to be revealed when the card is tapped', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onReveal = vi.fn()

    render(<ReviewCardView {...baseProps} onReveal={onReveal} />)

    await user.click(screen.getByRole('button', { name: 'Show the answer' }))
    expect(onReveal).toHaveBeenCalledOnce()
  })

  it('reports the exact grade for each button', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    // Each grade is checked against its own button, so a mis-wired handler that sends Good for
    // Hard — the single most damaging bug this screen could have — cannot pass.
    for (const [label, grade] of [
      ['Again', 0],
      ['Hard', 3],
      ['Good', 4],
      ['Easy', 5],
    ] as const) {
      const onGrade = vi.fn()
      const { unmount } = render(
        <ReviewCardView {...baseProps} revealed onReveal={vi.fn()} onGrade={onGrade} />,
      )

      await user.click(screen.getByRole('button', { name: new RegExp(label) }))
      expect(onGrade).toHaveBeenCalledWith(grade)
      unmount()
    }
  })

  it('grades from the keyboard for the laptop', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onGrade = vi.fn()

    render(<ReviewCardView {...baseProps} revealed onReveal={vi.fn()} onGrade={onGrade} />)

    await user.keyboard('3')
    expect(onGrade).toHaveBeenCalledWith(4)
  })

  it('ignores keyboard grades before the answer is shown', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onGrade = vi.fn()

    render(<ReviewCardView {...baseProps} onReveal={vi.fn()} onGrade={onGrade} />)

    await user.keyboard('3')
    expect(onGrade).not.toHaveBeenCalled()
  })

  it('celebrates finishing only when nothing is coming back', () => {
    render(
      <ReviewCardView
        {...baseProps}
        card={null}
        startCount={3}
        gradedCount={3}
        waitingToReturn={0}
        finished
        onReveal={vi.fn()}
      />,
    )

    expect(screen.getByText('That’s the lot')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('says a card is coming back instead of claiming the session is over', () => {
    // The defect this pins: saying "that's the lot" while a card she just graded Again is a minute
    // from returning gives her the wrong answer about work that is still outstanding.
    render(
      <ReviewCardView
        {...baseProps}
        card={null}
        startCount={3}
        gradedCount={1}
        waitingToReturn={1}
        finished={false}
        onReveal={vi.fn()}
      />,
    )

    expect(screen.getByText('One card is coming back')).toBeInTheDocument()
    expect(screen.queryByText('That’s the lot')).toBeNull()
  })

  it('counts the cards coming back when there are several', () => {
    render(
      <ReviewCardView
        {...baseProps}
        card={null}
        startCount={5}
        gradedCount={2}
        waitingToReturn={3}
        finished={false}
        onReveal={vi.fn()}
      />,
    )

    expect(screen.getByText('3 cards are coming back')).toBeInTheDocument()
  })

  it('explains an empty queue rather than showing a blank screen', () => {
    render(
      <ReviewCardView
        {...baseProps}
        card={null}
        startCount={0}
        gradedCount={0}
        onReveal={vi.fn()}
      />,
    )

    expect(screen.getByText('Nothing due right now')).toBeInTheDocument()
  })
})

describe('CardFormView', () => {
  const formProps = {
    open: true,
    target: { mode: 'create' } as const,
    tagSuggestions: ['Pathophysiology', 'Pharmacology and Therapeutics'],
    onSubmit: vi.fn(),
    onClose: vi.fn(),
  }

  it('refuses to submit until both sides have something in them', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<CardFormView {...formProps} onSubmit={onSubmit} />)

    // The button is disabled up front, so the first press cannot submit an empty card.
    expect(screen.getByRole('button', { name: 'Add card' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Add card' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed values once both sides are filled', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<CardFormView {...formProps} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Front'), '  Term  ')
    await user.type(screen.getByLabelText('Back'), '  Definition  ')
    await user.click(screen.getByRole('button', { name: 'Add card' }))

    expect(onSubmit).toHaveBeenCalledWith({
      front: 'Term',
      back: 'Definition',
      tags: [],
    })
  })

  it('toggles a suggested topic on and off', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(<CardFormView {...formProps} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Front'), 'F')
    await user.type(screen.getByLabelText('Back'), 'B')

    const topic = screen.getByRole('button', { name: 'Pathophysiology' })
    expect(topic).toHaveAttribute('aria-pressed', 'false')

    await user.click(topic)
    expect(screen.getByRole('button', { name: '✓ Pathophysiology' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Add card' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['Pathophysiology'] }))
  })

  it('preselects the existing values and the topics when editing', () => {
    render(
      <CardFormView
        {...formProps}
        target={{
          mode: 'edit',
          card: card({ front: 'Existing front', back: 'Existing back', tags: ['Pathophysiology'] }),
        }}
      />,
    )

    expect(screen.getByLabelText('Front')).toHaveValue('Existing front')
    expect(screen.getByLabelText('Back')).toHaveValue('Existing back')
    expect(screen.getByRole('button', { name: '✓ Pathophysiology' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('offers a reset only when editing, and reports it', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onResetProgress = vi.fn()

    const { unmount } = render(<CardFormView {...formProps} />)
    expect(screen.queryByRole('button', { name: 'Reset progress' })).toBeNull()
    unmount()

    render(
      <CardFormView
        {...formProps}
        target={{ mode: 'edit', card: card() }}
        onResetProgress={onResetProgress}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Reset progress' }))
    expect(onResetProgress).toHaveBeenCalledOnce()
  })

  it('closes without submitting when cancelled', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSubmit = vi.fn()

    render(<CardFormView {...formProps} onClose={onClose} onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows a progress summary when editing a card that has been reviewed', () => {
    render(
      <CardFormView
        {...formProps}
        target={{
          mode: 'edit',
          card: card({ learningStep: null, intervalDays: 6, lastReviewedAt: NOW }),
        }}
        progressSummary="Currently in 6 days"
      />,
    )

    expect(screen.getByText('Currently in 6 days')).toBeInTheDocument()
  })
})
