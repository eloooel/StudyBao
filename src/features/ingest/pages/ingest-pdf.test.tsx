import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearDraft, loadDraft } from '@/features/ingest/lib/draft-storage'
import { render, screen, waitFor } from '@/test/render'
import IngestPage from './ingest.page'

/**
 * The PDF path.
 *
 * `extract-pdf.ts` is mocked, and deliberately so: it drives a Web Worker and a real PDF.js
 * parse, neither of which exists in jsdom, and testing PDF.js itself is testing a third-party
 * library. What is left — and what can actually break — is the wiring: does choosing a file
 * fill the text, does a scanned PDF say the honest thing instead of showing an empty box, does
 * the parse path treat extracted text exactly like pasted text.
 *
 * The pure half of extraction (`contentItemsToLines`) is tested directly in `pdf-lines.test.ts`.
 */
const extractPdfText = vi.fn()

vi.mock('../lib/extract-pdf', () => ({
  extractPdfText: (...args: unknown[]) => extractPdfText(...args) as unknown,
}))

afterEach(() => {
  clearDraft()
  extractPdfText.mockReset()
})

beforeEach(() => {
  extractPdfText.mockResolvedValue({ text: '', pageCount: 1, looksScanned: false })
})

/** Render the page on the PDF tab. */
async function renderPdfTab(): Promise<void> {
  render(<IngestPage />, { initialPath: '/cards/ingest?tab=pdf' })
  await waitFor(() => expect(screen.getByLabelText('Choose a PDF')).toBeInTheDocument())
}

/** Choose a file on the PDF input. */
async function chooseFile(name: string, type = 'application/pdf'): Promise<void> {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  const file = new File(['%PDF-1.4 fake'], name, { type })

  await user.upload(screen.getByLabelText('Choose a PDF'), file)
}

describe('the PDF tab', () => {
  it('is enabled now, unlike the photo tab', async () => {
    await renderPdfTab()

    expect(screen.getByRole('tab', { name: 'Upload PDF' })).toBeEnabled()
    expect(screen.getByRole('tab', { name: 'Upload photo' })).toBeDisabled()
  })

  it('reads the chosen file and offers to find cards in it', async () => {
    extractPdfText.mockResolvedValue({
      text: 'Vitamin C: ascorbic acid\nIron - ferrous sulfate',
      pageCount: 4,
      looksScanned: false,
    })

    await renderPdfTab()
    await chooseFile('nursing-notes.pdf')

    await waitFor(() =>
      expect(screen.getByText(/Read 4 pages from nursing-notes\.pdf/)).toBeInTheDocument(),
    )
    expect(screen.getByRole('status', { name: 'Lines ready' })).toHaveTextContent('2 lines ready')
  })

  it('treats extracted text exactly like pasted text when the batch is built', async () => {
    extractPdfText.mockResolvedValue({
      text: 'Vitamin C: ascorbic acid',
      pageCount: 1,
      looksScanned: false,
    })

    await renderPdfTab()
    await chooseFile('notes.pdf')
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Lines ready' })).toHaveTextContent('1 line ready'),
    )

    const { default: userEvent } = await import('@testing-library/user-event')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Find my cards' }))

    const draft = loadDraft()
    expect(draft?.cards).toHaveLength(1)
    expect(draft?.cards[0]?.front).toBe('Vitamin C')
    // The label records where the text came from, so the review screen can say so.
    expect(draft?.sourceLabel).toBe('notes.pdf')
  })

  it('says a scanned PDF has no text instead of showing an empty box', async () => {
    extractPdfText.mockResolvedValue({ text: '', pageCount: 12, looksScanned: true })

    await renderPdfTab()
    await chooseFile('scanned-handout.pdf')

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no text in it/))
    expect(screen.getByRole('alert')).toHaveTextContent(/Live Text/)
    // Nothing to parse, so the submit stays disabled rather than producing an empty batch.
    expect(screen.getByRole('button', { name: 'Find my cards' })).toBeDisabled()
  })

  it('shows the failure reason for a locked PDF rather than a generic error', async () => {
    extractPdfText.mockRejectedValue(
      new Error(
        'This PDF is locked with a password. Open it on your device, remove the password or copy the text out, and paste it instead.',
      ),
    )

    await renderPdfTab()
    await chooseFile('locked.pdf')

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/locked with a password/),
    )
  })

  it('reports progress while reading, so a long file does not look frozen', async () => {
    let report: ((done: number, total: number) => void) | undefined
    extractPdfText.mockImplementation(
      (_file: File, options: { onProgress?: (done: number, total: number) => void }) => {
        report = options.onProgress
        return new Promise(() => {
          // Never settles: the test asserts the mid-read state, which is the whole point.
        })
      },
    )

    await renderPdfTab()
    await chooseFile('big.pdf')

    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'PDF progress' })).toHaveTextContent(
        'Opening big.pdf…',
      ),
    )

    const { act } = await import('@testing-library/react')
    act(() => report?.(3, 40))

    expect(screen.getByRole('status', { name: 'PDF progress' })).toHaveTextContent(
      'Reading big.pdf — page 3 of 40…',
    )
  })
})
