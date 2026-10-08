import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createLesson, getLesson, listLessons } from '@/db/repositories/lessons'
import { addStudyDays } from '@/lib/study-day'
import { render, screen, waitFor, within } from '@/test/render'
import TrackerPage from './tracker.page'

/**
 * The tracker screen, assembled: Layer 1 + Layer 2 + Layer 3 + the real database.
 *
 * The view tests pin what each component renders and the lib tests pin the rules, but neither can
 * catch a page that never wires them together — a hook that never resolves, a filter that never
 * reaches the query, a write that never notifies the shared data signal. Those are exactly the
 * failures that look like "the screen is broken" on her iPad, so they are exercised here against
 * fake-indexeddb through the real repository.
 *
 * This is the closest thing to the walkthrough in `BUILD_GUIDE.md` §8's definition of done for
 * Workflow E: **a lesson created, filtered and completed without touching OCR.** What it cannot
 * prove is layout, iPad width, or offline behaviour — no browser is involved.
 *
 * Two things it deliberately does *not* pin:
 *
 * - **The clock.** Deadlines are built relative to `Date.now()` through `addStudyDays`, so the file
 *   cannot rot into asserting that "September 2026 is the future" — the first version of this file
 *   did exactly that and reported a lesson as overdue because the real date had moved past it.
 * - **The first read's speed.** The page loads asynchronously, and the first render in this file
 *   pays for creating and seeding the in-memory database, so the waits carry an explicit timeout —
 *   the same call `src/router.test.tsx` makes, and for the same reason: under contention the 1s
 *   default is not enough, and raising it further should be read as a finding about speed rather
 *   than as tuning.
 *
 * **5000 was wrong, and it failed under coverage load.** It equalled vitest's *default* 5s
 * `testTimeout`, so the wait could never report its own failure — vitest killed the test first with
 * "Test timed out", naming no element — and a wait that legitimately needed longer simply failed.
 * This file takes 20s for 8 tests under coverage. `testTimeout` is now explicit and higher in
 * `vitest.config.ts`; the invariant is **wait budget < test timeout**, and the raise to 10000 is the
 * finding about speed this comment asked for, not tuning.
 */

const WAIT = { timeout: 10000 } as const

/** A fixed timestamp for `updatedAt`, so nothing depends on when the suite runs. */
const NOW = 1_800_000_000_000

/** The `<li>` a topic lives in, so queries can be scoped to one row. */
function rowFor(topic: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: topic })
  const item = heading.closest('li')
  if (item === null) throw new Error(`No row for ${topic}`)
  return item
}

describe('the lessons screen', () => {
  it('shows the empty state for a brand-new install rather than a blank screen', async () => {
    render(<TrackerPage />, { initialPath: '/lessons' })

    expect(
      await screen.findByRole('heading', { name: 'Nothing on your list yet' }, WAIT),
    ).toBeInTheDocument()
    // Every chip still says how many it would show, which is zero.
    expect(await screen.findByRole('button', { name: /^To do · 0/ }, WAIT)).toBeInTheDocument()
  })

  it('creates a lesson through the form and shows it in the right section', async () => {
    const user = userEvent.setup()
    render(<TrackerPage />, { initialPath: '/lessons' })

    // Two buttons carry this name on an empty list (the top action and the empty state's), so the
    // first is clicked rather than assuming there is only one.
    const addButtons = await screen.findAllByRole('button', { name: 'Add a lesson' }, WAIT)
    await user.click(addButtons[0]!)
    await user.type(screen.getByLabelText('Topic'), 'Fluid and electrolytes')
    await user.selectOptions(screen.getByLabelText('Which part?'), 'practice-iii')
    // No date: it must land in "No date yet" rather than being invented into today.
    await user.click(screen.getByRole('button', { name: 'Add lesson' }))

    expect(
      await screen.findByRole('heading', { name: 'Fluid and electrolytes' }, WAIT),
    ).toBeInTheDocument()
    expect(
      within(rowFor('Fluid and electrolytes')).getByText(/Nursing Practice III/),
    ).toBeInTheDocument()
    expect(within(rowFor('Fluid and electrolytes')).getByText(/No date yet/)).toBeInTheDocument()

    const stored = await listLessons()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      topic: 'Fluid and electrolytes',
      subject: 'practice-iii',
      status: 'not-started',
    })
    // Absent, not blanked: "no date yet" is a state, not a missing value.
    expect(Object.hasOwn(stored[0] as object, 'deadline')).toBe(false)
  })

  it('files a lesson three study days out under this week, and leaves nothing overdue', async () => {
    await createLesson(
      {
        subject: 'practice-i',
        topic: 'Community diagnosis',
        deadline: addStudyDays(Date.now(), 3),
        status: 'not-started',
      },
      NOW,
    )

    render(<TrackerPage />, { initialPath: '/lessons' })

    expect(
      await screen.findByRole('heading', { name: 'Community diagnosis' }, WAIT),
    ).toBeInTheDocument()
    // Three study days ahead is "this week", not "still waiting" — the whole point of the study day
    // being 04:00-anchored rather than midnight.
    expect(screen.getByText('Nothing has slipped.')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'This week' })).getAllByRole('listitem'),
    ).toHaveLength(1)
    expect(within(rowFor('Community diagnosis')).getByText(/in 3 days/)).toBeInTheDocument()
  })

  it('completes a lesson in one tap, and it leaves the default view', async () => {
    const user = userEvent.setup()
    const lesson = await createLesson(
      { subject: 'practice-v', topic: 'Triage', status: 'reviewing' },
      NOW,
    )

    render(<TrackerPage />, { initialPath: '/lessons' })

    await user.click(await screen.findByRole('button', { name: 'Mark mastered' }, WAIT))

    // Written through to the database…
    await waitFor(async () => {
      expect((await getLesson(lesson.id))?.status).toBe('mastered')
    })
    // …and gone from "To do", because a finished topic does not belong in what is still owed.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Triage' })).not.toBeInTheDocument()
    })
    expect(await screen.findByRole('button', { name: /^Mastered · 1/ }, WAIT)).toBeInTheDocument()
  })

  it('shows mastered lessons on their own chip, and moves one back when it is not solid after all', async () => {
    const user = userEvent.setup()
    const lesson = await createLesson(
      { subject: 'practice-ii', topic: 'Growth and development', status: 'mastered' },
      NOW,
    )

    render(<TrackerPage />, { initialPath: '/lessons?status=mastered' })

    // The chip's own count is asserted only once the read has landed, or it would be reading the
    // pre-load zeroes rather than the list.
    expect(await screen.findByRole('button', { name: /^Mastered · 1/ }, WAIT)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(
      await screen.findByRole('heading', { name: 'Growth and development' }, WAIT),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to reviewing' }))

    await waitFor(async () => {
      expect((await getLesson(lesson.id))?.status).toBe('reviewing')
    })
  })

  it('falls back to the default view when the URL names a filter that does not exist', async () => {
    await createLesson({ subject: 'practice-i', topic: 'Still to do', status: 'not-started' }, NOW)

    render(<TrackerPage />, { initialPath: '/lessons?status=finished' })

    // A stale bookmark must show her list, not an empty screen she cannot explain.
    expect(await screen.findByRole('button', { name: /^To do · 1/ }, WAIT)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await screen.findByRole('heading', { name: 'Still to do' }, WAIT)).toBeInTheDocument()
  })

  it('deletes a lesson only after she confirms, and does not show it afterwards', async () => {
    const user = userEvent.setup()
    const lesson = await createLesson(
      { subject: 'practice-iv', topic: 'Endocrine emergencies', status: 'not-started' },
      NOW,
    )

    render(<TrackerPage />, { initialPath: '/lessons' })

    await screen.findByRole('heading', { name: 'Endocrine emergencies' }, WAIT)
    await user.click(within(rowFor('Endocrine emergencies')).getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Delete this lesson' }))

    // The first tap only asks. Asserting the row is still there rather than asserting the dialog's
    // copy: the Modal keeps its footer mounted, so a heading query would pass either way.
    expect(await getLesson(lesson.id)).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(async () => {
      expect(await getLesson(lesson.id)).toBeUndefined()
    })
    // Soft delete: the row is a tombstone, not gone — that is what stops the other device
    // resurrecting it once sync exists.
    expect(await listLessons()).toHaveLength(0)
  })

  it('keeps a lesson when she changes her mind in the confirmation', async () => {
    const user = userEvent.setup()
    const lesson = await createLesson(
      { subject: 'practice-i', topic: 'Keep me', status: 'not-started' },
      NOW,
    )

    render(<TrackerPage />, { initialPath: '/lessons' })

    await screen.findByRole('heading', { name: 'Keep me' }, WAIT)
    await user.click(within(rowFor('Keep me')).getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Delete this lesson' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(await getLesson(lesson.id)).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Keep me' })).toBeInTheDocument()
  })
})
