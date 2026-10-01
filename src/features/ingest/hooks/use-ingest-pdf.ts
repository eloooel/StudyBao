import { useCallback, useState } from 'react'

import { extractPdfText } from '../lib/extract-pdf'
import type { PdfStatus } from '../types'

/**
 * Layer 2 — reading a chosen PDF into text.
 *
 * Extraction is started by choosing the file rather than by pressing the submit button,
 * because it is the slow part (a 200-page PDF takes a while) and because its failure modes are
 * specific: an encrypted file, a corrupt one, and a **scanned** one are three different
 * problems with three different answers. Doing it here means the screen can say which one it
 * is while she is still looking at the file she picked, instead of after a submit.
 *
 * On success the page's shared `text` is filled in and the normal "Find my cards" path takes
 * over — the parser does not care where the lines came from, and giving PDF ingest its own
 * parse path would be a second implementation to keep in step with the first.
 */
export interface PdfIngest {
  status: PdfStatus
  /** Chosen and read. `text` is then on the page, ready to parse. */
  pickFile: (file: File | undefined) => void
  reset: () => void
}

export interface PdfIngestCallbacks {
  onExtracted: (text: string) => void
}

const IDLE: PdfStatus = { state: 'idle' }

export function usePdfIngest(callbacks: PdfIngestCallbacks): PdfIngest {
  const [status, setStatus] = useState<PdfStatus>(IDLE)

  const pickFile = useCallback(
    (file: File | undefined) => {
      if (file === undefined) {
        setStatus(IDLE)
        return
      }

      setStatus({ state: 'reading', fileName: file.name, done: 0, total: 0 })

      void extractPdfText(file, {
        onProgress: (done, total) => {
          setStatus({ state: 'reading', fileName: file.name, done, total })
        },
      })
        .then((result) => {
          if (result.looksScanned) {
            // The honest answer for a scanned PDF. Saying "no text found" would leave her to
            // guess; the photo path is genuinely the right next step, and her phone's own text
            // recognition beats anything we could do with the images anyway.
            setStatus({ state: 'scanned', fileName: file.name, pageCount: result.pageCount })
            return
          }

          callbacks.onExtracted(result.text)
          setStatus({ state: 'ready', fileName: file.name, pageCount: result.pageCount })
        })
        .catch((error: unknown) => {
          setStatus({
            state: 'failed',
            fileName: file.name,
            message: error instanceof Error ? error.message : 'That PDF could not be read.',
          })
        })
    },
    [callbacks],
  )

  return { status, pickFile, reset: () => setStatus(IDLE) }
}
