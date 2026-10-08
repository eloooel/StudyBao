import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, type Mock } from 'vitest'

import type { Lesson } from '@/db/types'
import { fireEvent, render, screen, within } from '@/test/render'
import { lessonGroups } from '../lib/deadline'
import { FILTER_EMPTY, lessonCounts } from '../lib/status'
import type { LessonFilter, LessonFormValues, LessonGroup } from '../types'
import { LessonFormView } from './lesson-form-view'
import { TrackerView } from './tracker-view'

/**
 * Layer 3, tested for the behaviour that can actually be wrong.
 *
 * Deliberately **not** tested: Tailwind classes, layout, section order for its own sake, or anything
 * asserted by snapshot. What is asserted is the interaction contract the page depends on and the
 * two rules a view can quietly break on its own — a section or a chip that renders as a blank
 * region, and a mastered lesson that renders as something still owed.
 */

const NOW = new Date(2026, 8, 21, 10, 0, 0, 0).getTime() // Mon 21 Sep 2026, 10:00 local

function at4(year: number, month: number, day: number): number {
  return new Date(year, month, day, 4, 0, 0, 0).getTime()
}

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    subject: 'practice-i',
    topic: 'Community diagnosis',
    status: 'not-started',
    updatedAt: NOW,
    ...overrides,
  }
}

function renderTracker(
  lessons: Lesson[],
  filter: LessonFilter = 'active',
  overrides: Partial<Parameters<typeof TrackerView>[0]> = {},
) {
  const handlers = {
    onSelectFilter: vi.fn(),
    onAddLesson: vi.fn(),
    onEditLesson: vi.fn(),
    onToggleMastered: vi.fn(),
  }

  const groups: LessonGroup[] = lessonGroups(lessons, filter, NOW)
  const total = groups.reduce((sum, group) => sum + group.lessons.length, 0)

  const view = render(
    <TrackerView
      groups={groups}
      counts={lessonCounts(lessons)}
      total={total}
      now={NOW}
      filter={filter}
      loading={false}
      {...handlers}
      {...overrides}
    />,
  )

  return { ...handlers, ...view }
}

/** The `<li>` a topic lives in, so a status word can be queried inside one row rather than page-wide. */
function rowFor(topic: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: topic })
  const item = heading.closest('li')
  if (item === null) throw new Error(`No row for ${topic}`)
  return item
}

describe('TrackerView', () => {
  it('says it is loading rather than showing four empty sections', () => {
    renderTracker([], 'active', { loading: true })

    expect(screen.getByRole('status')).toHaveTextContent('Getting your lessons ready')
    // The failure this guards: an empty state flashing on every open, before the read lands.
    expect(screen.queryByText(FILTER_EMPTY.active.title)).not.toBeInTheDocument()
  })

  it('gives every chip its own empty state instead of a blank region', () => {
    // Workflow E addition A. A filter matching nothing is the normal case on a good week — this is
    // the assertion that she never gets an empty screen she cannot explain.
    for (const filter of ['active', 'not-started', 'reviewing', 'mastered'] as LessonFilter[]) {
      const { unmount } = renderTracker([], filter)

      expect(screen.getByRole('heading', { name: FILTER_EMPTY[filter].title })).toBeInTheDocument()
      expect(screen.getByText(FILTER_EMPTY[filter].message)).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Add a lesson' }).length).toBeGreaterThan(0)

      unmount()
    }
  })

  it('keeps a section heading and a line of copy when a section has nothing in it', () => {
    renderTracker([lesson({ topic: 'Undated only' })])

    expect(screen.getByRole('heading', { name: 'Still waiting' })).toBeInTheDocument()
    expect(screen.getByText('Nothing has slipped.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No date yet' })).toBeInTheDocument()
  })

  it('shows the topic, the part and the deadline, with the study day deciding the wording', () => {
    renderTracker([
      lesson({ id: 'today', topic: 'Due today', deadline: at4(2026, 8, 21) }),
      lesson({ id: 'late', topic: 'Slipped', deadline: at4(2026, 8, 18) }),
      lesson({ id: 'undated', topic: 'Undated topic' }),
    ])

    // 10:00 on the day it is due: "Today", not "Yesterday" and not "overdue".
    expect(within(rowFor('Due today')).getByText(/Today/)).toBeInTheDocument()
    expect(within(rowFor('Slipped')).getByText(/Fri 18 Sep · 3 days ago/)).toBeInTheDocument()
    expect(within(rowFor('Undated topic')).getByText(/No date yet/)).toBeInTheDocument()
  })

  it('marks a row with its status and offers the opposite of it in one tap', async () => {
    const user = userEvent.setup()
    const done = lesson({ id: 'done', topic: 'Finished it', status: 'mastered' })

    const { onToggleMastered } = renderTracker([done], 'mastered')

    expect(within(rowFor('Finished it')).getByText('Mastered')).toBeInTheDocument()

    await user.click(
      within(rowFor('Finished it')).getByRole('button', { name: 'Back to reviewing' }),
    )
    expect(onToggleMastered).toHaveBeenCalledWith(done)
  })

  it('offers Mark mastered on a lesson that is not finished', async () => {
    const user = userEvent.setup()
    const open = lesson({ id: 'open', topic: 'Still open', status: 'not-started' })

    const { onToggleMastered } = renderTracker([open])

    await user.click(within(rowFor('Still open')).getByRole('button', { name: 'Mark mastered' }))
    expect(onToggleMastered).toHaveBeenCalledWith(open)
  })

  it('sends the tapped chip up, and reports which one is showing', async () => {
    const user = userEvent.setup()
    const { onSelectFilter } = renderTracker([lesson()])

    expect(screen.getByRole('button', { name: /^To do/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Mastered/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await user.click(screen.getByRole('button', { name: /^Reviewing/ }))
    expect(onSelectFilter).toHaveBeenCalledWith('reviewing')
  })

  it('shows each chip’s count from the whole list, not from what is visible', () => {
    renderTracker(
      [
        lesson({ id: 'a', status: 'not-started' }),
        lesson({ id: 'b', status: 'reviewing' }),
        lesson({ id: 'c', status: 'mastered' }),
      ],
      'reviewing',
    )

    // The counts are properties of the list, so they do not change with the selected chip.
    expect(screen.getByRole('button', { name: /^To do · 2/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Mastered · 1/ })).toBeInTheDocument()
  })

  it('opens a lesson for editing', async () => {
    const user = userEvent.setup()
    const target = lesson({ topic: 'Edit me' })

    const { onEditLesson } = renderTracker([target])

    await user.click(within(rowFor('Edit me')).getByRole('button', { name: 'Edit' }))
    expect(onEditLesson).toHaveBeenCalledWith(target)
  })

  it('adds a lesson from both the top of the screen and an empty chip', async () => {
    const user = userEvent.setup()
    const { onAddLesson } = renderTracker([], 'mastered')

    const buttons = screen.getAllByRole('button', { name: 'Add a lesson' })
    expect(buttons.length).toBeGreaterThan(1)

    for (const button of buttons) {
      await user.click(button)
    }
    expect(onAddLesson).toHaveBeenCalledTimes(buttons.length)
  })

  it('shows a mastered lesson without ever filing it under what is still waiting', () => {
    // A finished topic with a date that has passed. It belongs on its own chip, in its own section,
    // and nowhere near "Still waiting" — that is the whole reason mastered is out of the default view.
    renderTracker(
      [
        lesson({
          id: 'done',
          topic: 'Already done',
          status: 'mastered',
          deadline: at4(2026, 8, 1),
        }),
      ],
      'mastered',
    )

    expect(screen.queryByRole('heading', { name: 'Still waiting' })).not.toBeInTheDocument()
    expect(within(rowFor('Already done')).getByText('Mastered')).toBeInTheDocument()
  })
})

describe('LessonFormView', () => {
  function renderForm(
    target: Parameters<typeof LessonFormView>[0]['target'],
    overrides: Partial<{ onDelete: () => void }> = {},
  ) {
    const onSubmit = vi.fn()
    const onClose = vi.fn()
    const onDelete = overrides.onDelete ?? vi.fn()

    render(
      <LessonFormView
        open
        target={target}
        onSubmit={onSubmit}
        onClose={onClose}
        onDelete={target?.mode === 'edit' ? onDelete : undefined}
      />,
    )

    return { onSubmit, onClose, onDelete }
  }

  function submittedValues(onSubmit: Mock): LessonFormValues {
    const calls = onSubmit.mock.calls as unknown as [LessonFormValues][]
    const first = calls[0]?.[0]
    if (first === undefined) throw new Error('The form never submitted')
    return first
  }

  it('adds a lesson with the first part, no date and no notes', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ mode: 'create' })

    await user.type(screen.getByLabelText('Topic'), 'Fluid and electrolytes')
    await user.click(screen.getByRole('button', { name: 'Add lesson' }))

    const values = submittedValues(onSubmit)
    expect(values).toMatchObject({
      subject: 'practice-i',
      topic: 'Fluid and electrolytes',
      status: 'not-started',
    })
    // Absent, not `undefined`: an empty date field means "no date yet", and the repository keys off
    // the property being missing.
    expect(Object.hasOwn(values, 'deadline')).toBe(false)
    expect(Object.hasOwn(values, 'notes')).toBe(false)
  })

  it('refuses a lesson with no topic and says why, rather than doing nothing', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ mode: 'create' })

    await user.click(screen.getByRole('button', { name: 'Add lesson' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Give it a topic')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps a typed date as the study-day start of that day', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ mode: 'create' })

    await user.type(screen.getByLabelText('Topic'), 'Endocrine')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-24' } })
    await user.click(screen.getByRole('button', { name: 'Add lesson' }))

    // 04:00 local, not midnight — a lesson due today must not flip to overdue at 00:30.
    expect(submittedValues(onSubmit).deadline).toBe(at4(2026, 8, 24))
  })

  it('trims the topic and drops a notes field she left blank', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ mode: 'create' })

    await user.type(screen.getByLabelText('Topic'), '  Triage  ')
    await user.type(screen.getByLabelText(/Notes/), '   ')
    await user.click(screen.getByRole('button', { name: 'Add lesson' }))

    const values = submittedValues(onSubmit)
    expect(values.topic).toBe('Triage')
    expect(Object.hasOwn(values, 'notes')).toBe(false)
  })

  it('pre-fills everything when editing, including the date field', () => {
    const target = lesson({
      topic: 'Growth and development',
      subject: 'practice-ii',
      status: 'reviewing',
      deadline: at4(2026, 8, 24),
      notes: 'Chapter 4',
    })

    renderForm({ mode: 'edit', lesson: target })

    expect(screen.getByRole('heading', { name: 'Edit this lesson' })).toBeInTheDocument()
    expect(screen.getByLabelText('Topic')).toHaveValue('Growth and development')
    expect(screen.getByLabelText('Which part?')).toHaveValue('practice-ii')
    expect(screen.getByLabelText('Where is it up to?')).toHaveValue('reviewing')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-24')
    expect(screen.getByLabelText(/Notes/)).toHaveValue('Chapter 4')
  })

  it('clears a date she removes, rather than quietly keeping the old one', async () => {
    const user = userEvent.setup()
    const target = lesson({ topic: 'Was dated', deadline: at4(2026, 8, 24) })
    const { onSubmit } = renderForm({ mode: 'edit', lesson: target })

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(Object.hasOwn(submittedValues(onSubmit), 'deadline')).toBe(false)
  })

  it('remounts the fields when the form is reused for another lesson', () => {
    // The Modal keeps its children mounted, so without the per-target `key` the second lesson would
    // open showing the first one's topic — the stale-form bug this component's shape prevents.
    const first = lesson({ id: 'a', topic: 'First topic' })
    const second = lesson({ id: 'b', topic: 'Second topic' })

    const { rerender } = render(
      <LessonFormView
        open
        target={{ mode: 'edit', lesson: first }}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Topic')).toHaveValue('First topic')

    rerender(
      <LessonFormView
        open
        target={{ mode: 'edit', lesson: second }}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Topic')).toHaveValue('Second topic')
  })

  it('offers deletion only for a lesson that exists', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()

    const { unmount } = render(
      <LessonFormView open target={{ mode: 'create' }} onSubmit={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: 'Delete this lesson' })).not.toBeInTheDocument()
    unmount()

    renderForm({ mode: 'edit', lesson: lesson() }, { onDelete })

    await user.click(screen.getByRole('button', { name: 'Delete this lesson' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('closes without saving', async () => {
    const user = userEvent.setup()
    const { onSubmit, onClose } = renderForm({ mode: 'create' })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('lets her move the status from the form, not only from the list', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ mode: 'edit', lesson: lesson({ topic: 'Solid now' }) })

    await user.selectOptions(screen.getByLabelText('Where is it up to?'), 'mastered')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(submittedValues(onSubmit).status).toBe('mastered')
  })

  it('lets her file a lesson under a different part', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ mode: 'create' })

    await user.type(screen.getByLabelText('Topic'), 'Emergency')
    await user.selectOptions(screen.getByLabelText('Which part?'), 'practice-v')
    await user.click(screen.getByRole('button', { name: 'Add lesson' }))

    expect(submittedValues(onSubmit).subject).toBe('practice-v')
  })
})
