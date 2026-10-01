import { useCallback, useEffect, useRef, useState } from 'react'

import { recognizePhoto, warmOcrWorker } from '../lib/ocr'
import type { PhotoStatus } from '../types'

/**
 * Layer 2 — reading a photo into text.
 *
 * Two things this hook exists to get right:
 *
 * 1. **The worker is warmed when the tab opens**, not when the app loads. It is several
 *    megabytes of WebAssembly, and `docs/WORKFLOW-C-PROMPT.md` names precaching or pre-warming it
 *    at startup as the trap that would slow the first load of the app for every user forever.
 * 2. **Progress is visible the whole way through.** OCR takes 20–30 seconds on a phone. A screen
 *    that looks frozen for half a minute reads as broken, and she would close it.
 *
 * Recognised text goes into the page's shared `text`, so the parser and the review screen are the
 * same ones the paste and PDF paths use. A third parse path would be a third thing to keep in
 * step with the first two.
 */
export interface PhotoIngest {
  status: PhotoStatus
  pickFile: (file: File | undefined) => void
  reset: () => void
}

export interface PhotoIngestCallbacks {
  onExtracted: (text: string) => void
}

const IDLE: PhotoStatus = { state: 'idle' }

export function usePhotoIngest(callbacks: PhotoIngestCallbacks, enabled: boolean): PhotoIngest {
  const [status, setStatus] = useState<PhotoStatus>(IDLE)

  // The callbacks arrive as a fresh object from the page on every render, so they are reached
  // through a ref rather than being a dependency of `pickFile` — otherwise every keystroke on the
  // page would rebuild the handler mid-recognition. Updated in an effect, not during render:
  // writing a ref while rendering is what `react-hooks` forbids, and correctly so.
  const callbacksRef = useRef(callbacks)
  useEffect(() => {
    callbacksRef.current = callbacks
  }, [callbacks])

  useEffect(() => {
    if (!enabled) return
    // Fire and forget: warming is an optimisation, and if it fails the real attempt says so.
    void warmOcrWorker()
  }, [enabled])

  const pickFile = useCallback((file: File | undefined) => {
    if (file === undefined) {
      setStatus(IDLE)
      return
    }

    setStatus({ state: 'preparing', fileName: file.name })

    void recognizePhoto(file, {
      onProgress: (stage, progress) => {
        setStatus({ state: 'reading', fileName: file.name, stage, progress })
      },
    })
      .then((result) => {
        if (result.empty) {
          // The honest answer for handwriting, a blurred shot, or a picture of something that is
          // not text. Guessing at words would produce cards she cannot trust.
          setStatus({ state: 'empty', fileName: file.name })
          return
        }

        callbacksRef.current.onExtracted(result.text)
        setStatus({ state: 'ready', fileName: file.name })
      })
      .catch((error: unknown) => {
        setStatus({
          state: 'failed',
          fileName: file.name,
          message: error instanceof Error ? error.message : "We couldn't read that photo.",
        })
      })
  }, [])

  return { status, pickFile, reset: () => setStatus(IDLE) }
}
