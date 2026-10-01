import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  OCR_ASSET_DIRECTORY,
  ocrRuntimeCachingCovers,
  recognizePhoto,
  terminateOcrWorker,
  warmOcrWorker,
  type OcrWorkerLike,
} from './ocr'

/**
 * The OCR path's wiring.
 *
 * `tesseract.js` is replaced by an injected fake, and deliberately so: creating the real worker
 * needs a Web Worker, WebAssembly, and ~8 MB of language data. There is no honest way to run it
 * under jsdom, and mocking it wholesale would test the mock.
 *
 * What is genuinely under test here is the contract this module owes the rest of the app:
 *
 * - the three self-hosted paths are the ones actually passed to the worker (the first trap);
 * - the worker is created **once** and reused, because re-paying a multi-megabyte download per
 *   photo would be indefensible;
 * - warming does not recognise anything and does not throw when it fails;
 * - each failure mode gets a sentence she can act on rather than a stack trace.
 *
 * The image preparation either works in this environment or the failure is reported as an image
 * problem — both asserted, so the test is honest about which happened.
 */
function fakeWorker(text: string) {
  const terminate = vi.fn().mockResolvedValue(undefined)
  const recognize = vi.fn().mockResolvedValue({ data: { text } })
  return { worker: { recognize, terminate } as OcrWorkerLike, recognize, terminate }
}

/** The options the module passed to the factory, for asserting the self-hosted paths. */
function capturingFactory(worker: OcrWorkerLike) {
  const calls: { langs: string; oem: number; options: Record<string, unknown> }[] = []
  return {
    calls,
    factory: (langs: string, oem: number, options: Record<string, unknown>) => {
      calls.push({ langs, oem, options })
      return Promise.resolve(worker)
    },
  }
}

const tinyPng = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })

beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() }),
  )
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return {
          drawImage: vi.fn(),
          getImageData: (_x: number, _y: number, width: number, height: number) => ({
            data: new Uint8ClampedArray(width * height * 4),
          }),
          putImageData: vi.fn(),
        }
      }
      convertToBlob() {
        return Promise.resolve(new Blob([]))
      }
    },
  )
})

afterEach(async () => {
  await terminateOcrWorker()
  vi.unstubAllGlobals()
})

describe('self-hosted assets', () => {
  it('passes our own worker, core and language paths to Tesseract', async () => {
    // This is trap 1 from the C brief. Tesseract defaults all three to a CDN, which is 20–30 MB of
    // third-party traffic and breaks offline use outright — so this assertion is the offline
    // guarantee for the photo path, not a formatting check.
    const { worker } = fakeWorker('Vitamin C: ascorbic acid')
    const { calls, factory } = capturingFactory(worker)

    await recognizePhoto(tinyPng, { createWorker: factory })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.options['workerPath']).toBe('/ocr/worker.min.js')
    // A **directory**, because Tesseract picks between six capability variants (v5 had four —
    // see the doc comment in ocr.ts). Pointing at one file breaks SIMD devices.
    expect(calls[0]?.options['corePath']).toBe('/ocr/core')
    expect(calls[0]?.options['langPath']).toBe('/ocr/lang')
    expect(calls[0]?.langs).toBe('eng')
  })

  it('reports the same-origin paths that need runtime caching', () => {
    // The service worker deliberately does not precache these; this is what it caches on demand
    // instead, and the screen uses the fact to be honest about needing the network once.
    expect(ocrRuntimeCachingCovers()).toContain('/ocr/lang/')
    expect(OCR_ASSET_DIRECTORY).toBe('/ocr/')
  })
})

describe('recognizePhoto', () => {
  it('returns what the worker read, and does not call it empty', async () => {
    const { worker } = fakeWorker('Vitamin C: ascorbic acid\nIron: ferrous sulfate')
    const { factory } = capturingFactory(worker)

    const result = await recognizePhoto(tinyPng, { createWorker: factory })

    expect(result.text).toContain('Vitamin C')
    expect(result.empty).toBe(false)
  })

  it('calls an image with no words empty rather than returning blank text as success', async () => {
    const { worker } = fakeWorker('   \n  ')
    const { factory } = capturingFactory(worker)

    const result = await recognizePhoto(tinyPng, { createWorker: factory })

    expect(result.empty).toBe(true)
  })

  it('creates the worker once and reuses it across photos', async () => {
    // Re-downloading a multi-megabyte worker and language pack once per photo would make a
    // three-photo import cost 20 MB of traffic and a minute of waiting.
    const { worker } = fakeWorker('text')
    const { calls, factory } = capturingFactory(worker)

    await recognizePhoto(tinyPng, { createWorker: factory })
    await recognizePhoto(tinyPng, { createWorker: factory })

    expect(calls).toHaveLength(1)
  })

  it('forwards Tesseract progress so the screen is never frozen-looking', async () => {
    const progress: string[] = []
    const worker: OcrWorkerLike = {
      recognize: vi.fn().mockResolvedValue({ data: { text: 'text' } }),
      terminate: vi.fn().mockResolvedValue(undefined),
    }
    const factory = (_langs: string, _oem: number, options: { logger: (m: unknown) => void }) => {
      options.logger({ status: 'recognizing text', progress: 0.62 })
      progress.push('called')
      return Promise.resolve(worker)
    }

    await recognizePhoto(tinyPng, { createWorker: factory })

    expect(progress).toEqual(['called'])
  })

  it('says the reader has to download once when the worker will not start', async () => {
    // The real cause is almost always no network on the first photo, because the assets are
    // runtime-cached rather than precached. Naming that is the difference between a retry and a
    // support message.
    const factory = () => Promise.reject(new Error('no network'))

    await expect(recognizePhoto(tinyPng, { createWorker: factory })).rejects.toThrow(
      /has to download once/,
    )
  })

  it('names HEIC as the likely cause when the image will not decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')))
    const { worker } = fakeWorker('text')
    const { factory } = capturingFactory(worker)

    await expect(recognizePhoto(tinyPng, { createWorker: factory })).rejects.toThrow(/HEIC/)
  })

  it('blames the photo, not the app, when recognition itself fails', async () => {
    const worker: OcrWorkerLike = {
      recognize: vi.fn().mockRejectedValue(new Error('boom')),
      terminate: vi.fn().mockResolvedValue(undefined),
    }
    const { factory } = capturingFactory(worker)

    await expect(recognizePhoto(tinyPng, { createWorker: factory })).rejects.toThrow(
      /flatter, brighter picture/,
    )
  })
})

describe('warmOcrWorker', () => {
  it('creates the worker without recognising anything', async () => {
    const { worker, recognize } = fakeWorker('text')
    const { calls, factory } = capturingFactory(worker)

    await warmOcrWorker({ createWorker: factory })

    expect(calls).toHaveLength(1)
    expect(recognize).not.toHaveBeenCalled()
  })

  it('swallows a warming failure so it cannot break the screen', async () => {
    // Warming is an optimisation. If it fails, the real attempt reports the error where she can
    // act on it — an unhandled rejection here would blank the photo tab instead.
    const factory = () => Promise.reject(new Error('no network'))

    await expect(warmOcrWorker({ createWorker: factory })).resolves.toBeUndefined()
  })

  it('lets a real attempt retry after a failed warm', async () => {
    // The in-flight promise is cleared on failure, so a transient error does not poison every
    // later attempt — the same reasoning as `getDb` in src/db/schema.ts.
    let attempt = 0
    const { worker } = fakeWorker('text')
    const factory = () => {
      attempt += 1
      return attempt === 1 ? Promise.reject(new Error('first fails')) : Promise.resolve(worker)
    }

    await warmOcrWorker({ createWorker: factory })
    const result = await recognizePhoto(tinyPng, { createWorker: factory })

    expect(result.text).toBe('text')
    expect(attempt).toBe(2)
  })
})
