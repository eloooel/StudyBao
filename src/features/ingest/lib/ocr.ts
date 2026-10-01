import { fitWithin, preparePixels, type ImageSize } from './image-prep'

/**
 * OCR — the third ingest path, and the one `BUILD_GUIDE.md` §3 labels **best-effort**.
 *
 * Tesseract is trained on printed text. Handwriting accuracy is poor and tabular schedules are
 * worse, so this is deliberately the last path built and the last one offered, with her phone's
 * own text recognition named as the better option on the tab itself.
 *
 * ## Everything is same-origin, and that is the whole offline story
 *
 * Tesseract.js fetches three things from a CDN by default — the worker, the WebAssembly core, and
 * the language data — which is 20–30 MB of third-party traffic and breaks offline use outright.
 * This is the first of the three traps the C brief names, and all three are redirected:
 *
 * | What | Where | Why |
 * | --- | --- | --- |
 * | `workerPath` | `/ocr/worker.min.js` | copied from `node_modules` by `scripts/copy-ocr-assets.mjs` |
 * | `corePath` | `/ocr/core/` | the **whole directory** — see below |
 * | `langPath` | `/ocr/lang` | the committed `eng.traineddata.gz` |
 *
 * **`corePath` must be a directory, not a file.** Tesseract picks between six capability
 * variants (`tesseract-core`, `-lstm`, `-simd`, `-simd-lstm`, `-relaxedsimd`,
 * `-relaxedsimd-lstm`) by device capability, each a `*.wasm.js` loader plus the `*.wasm` it
 * fetches. Pointing at one file is the documented way to break SIMD devices or lose an order of
 * magnitude of performance. The brief and `BUILD_GUIDE.md` §3 both say "four files", which was
 * true of core v5; the installed v7 ships six, and the code wins.
 *
 * ## The worker is created lazily, and reused
 *
 * Creating it downloads and compiles several megabytes, so it happens when she **opens the photo
 * tab**, never on app load — the second trap. It is then kept, because she will likely import
 * more than one photo in a sitting and re-paying the cost each time would be indefensible.
 */

const WORKER_PATH = '/ocr/worker.min.js'
const CORE_PATH = '/ocr/core'
const LANG_PATH = '/ocr/lang'

/** Everything except the worker, which is a file rather than a prefix. */
export const OCR_ASSET_DIRECTORY = '/ocr/'

/**
 * The idle timeout before the worker is torn down.
 *
 * Long enough that a second photo in the same sitting reuses it, short enough that a forgotten
 * tab stops holding ~40 MB of WebAssembly. `terminate()` is cheap; leaking it is not.
 */
const WORKER_IDLE_MS = 5 * 60 * 1000

/** The subset of the Tesseract worker this module uses. Structural, so it is testable. */
export interface OcrWorkerLike {
  recognize: (image: Blob) => Promise<{ data: { text: string } }>
  terminate: () => Promise<unknown>
}

export type CreateWorker = (
  langs: string,
  oem: number,
  options: { workerPath: string; corePath: string; langPath: string; logger: (m: unknown) => void },
) => Promise<OcrWorkerLike>

export interface OcrOptions {
  /** Tesseract's progress messages, forwarded so the screen can say something. */
  onProgress?: (status: string, progress: number) => void
  /**
   * Injected so tests can supply a fake without a Web Worker. In the app this is
   * tesseract.js's `createWorker`, imported dynamically so it is not in the eager bundle.
   */
  createWorker?: CreateWorker
}

/**
 * The live worker and its idle timer, at module scope.
 *
 * Module scope rather than React state because the worker deliberately outlives the component: a
 * route change away from the photo tab and back should not re-download 7 MB. It is a resource,
 * not state.
 */
let worker: OcrWorkerLike | undefined
let creating: Promise<OcrWorkerLike> | undefined
let idleTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Whether the OCR assets have been fetched before, so the screen can warn honestly.
 *
 * The language data is 1.9 MB and the core is up to 8 MB per device; the *first* photo import
 * therefore needs the network. Afterwards the service worker's runtime cache serves both, which
 * is what makes it offline-capable from the second use. Saying so is better than a spinner that
 * looks broken on a train.
 */
export function ocrRuntimeCachingCovers(): string[] {
  return [WORKER_PATH, `${CORE_PATH}/`, `${LANG_PATH}/`]
}

/** Create or reuse the worker. */
async function getWorker(options: OcrOptions): Promise<OcrWorkerLike> {
  if (worker !== undefined) return worker
  if (creating !== undefined) return creating

  const create: CreateWorker =
    options.createWorker ??
    (async (...args) => {
      // Imported here so tesseract.js — 62 KB of API plus whatever it pulls — is not in the
      // chunk anyone loads to paste text.
      const tesseract = await import('tesseract.js')
      return (await tesseract.createWorker(...args)) as unknown as OcrWorkerLike
    })

  creating = create('eng', 1, {
    workerPath: WORKER_PATH,
    corePath: CORE_PATH,
    langPath: LANG_PATH,
    logger: (message: unknown) => {
      const status = readStatus(message)
      options.onProgress?.(status.status, status.progress)
    },
  })
    .then((created) => {
      worker = created
      creating = undefined
      return created
    })
    .catch((error: unknown) => {
      // Clear the in-flight promise so a transient failure can be retried rather than poisoning
      // every later attempt — the same reasoning as `getDb` in src/db/schema.ts.
      creating = undefined
      throw error
    })

  return creating
}

/** Tesseract's logger payload, narrowed without `any`. */
function readStatus(message: unknown): { status: string; progress: number } {
  if (typeof message === 'object' && message !== null && 'status' in message) {
    const record = message as { status?: unknown; progress?: unknown }
    return {
      status: typeof record.status === 'string' ? record.status : 'working',
      progress: typeof record.progress === 'number' ? record.progress : 0,
    }
  }
  return { status: 'working', progress: 0 }
}

/** Drop the idle timer, so a read that is about to happen does not race termination. */
function keepAlive(): void {
  if (idleTimer !== undefined) {
    clearTimeout(idleTimer)
    idleTimer = undefined
  }
}

/** Start the idle countdown that eventually terminates the worker. */
function scheduleTeardown(): void {
  keepAlive()
  idleTimer = setTimeout(() => {
    void terminateOcrWorker()
  }, WORKER_IDLE_MS)
}

/**
 * Warm the worker without recognising anything.
 *
 * Called when the photo tab is opened, so the multi-megabyte download happens while she is
 * choosing a file rather than after. Failures are swallowed on purpose: warming is an
 * optimisation, and a failed warm means `recognizePhoto` will report the real error.
 */
export async function warmOcrWorker(options: OcrOptions = {}): Promise<void> {
  try {
    await getWorker(options)
    scheduleTeardown()
  } catch {
    // Deliberately ignored: the real attempt surfaces the error where she can act on it.
  }
}

/** Tear the worker down. Safe to call at any time, and a no-op if there is none. */
export async function terminateOcrWorker(): Promise<void> {
  keepAlive()
  const existing = worker
  worker = undefined
  creating = undefined
  if (existing !== undefined) {
    try {
      await existing.terminate()
    } catch {
      // Nothing useful to do: the worker is already gone from our side.
    }
  }
}

/**
 * Prepare an image for OCR: downscale to the long edge, grey it, and raise contrast.
 *
 * `docs/BUILD_GUIDE.md` §3 is emphatic that this matters more than Tesseract's own parameters,
 * and it is where a phone photo stops being 12 megapixels of nothing.
 */
export async function prepareImage(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)

  try {
    const size: ImageSize = fitWithin({ width: bitmap.width, height: bitmap.height })
    const canvas = new OffscreenCanvas(size.width, size.height)

    const context = canvas.getContext('2d')
    if (context === null) throw new Error('This browser would not give us an image canvas.')

    // Draw at the reduced size, which is also what does the downscaling — no separate resize
    // pass, and the browser's own filter is better than anything hand-rolled.
    context.drawImage(bitmap, 0, 0, size.width, size.height)

    const image = context.getImageData(0, 0, size.width, size.height)
    preparePixels(image.data, 1.35)
    context.putImageData(image, 0, 0)

    return await canvas.convertToBlob({ type: 'image/png' })
  } finally {
    // Releases the decoded bitmap immediately rather than at the next GC: a 12 MP photo decoded
    // is ~48 MB, and a phone that is also running OCR does not have it to spare.
    bitmap.close()
  }
}

export interface OcrResult {
  text: string
  /** True when Tesseract found nothing. Usually a blurry or handwritten image. */
  empty: boolean
}

/**
 * Recognise the text in a photo.
 *
 * Throws with a sentence she can act on. The failure modes are different enough to be worth
 * distinguishing: a worker that will not start (often a browser without WebAssembly or SIMD), an
 * image that will not decode, and an image with no text in it.
 */
export async function recognizePhoto(blob: Blob, options: OcrOptions = {}): Promise<OcrResult> {
  let image: Blob
  try {
    image = await prepareImage(blob)
  } catch {
    throw new Error(
      "We couldn't open that image. If it's a HEIC straight from the camera, try a screenshot of it instead.",
    )
  }

  let active: OcrWorkerLike
  try {
    active = await getWorker(options)
  } catch {
    // The most likely cause by far, and the one worth naming: the first photo import needs the
    // network to fetch the worker and language data, because they are not in the precache.
    throw new Error(
      "We couldn't start the reader. It has to download once, so check your connection and try again — after that it works offline.",
    )
  }

  try {
    const { data } = await active.recognize(image)
    return { text: data.text, empty: data.text.trim().length === 0 }
  } catch {
    throw new Error("We couldn't read that photo. A flatter, brighter picture usually helps.")
  } finally {
    // Not terminated here: she may have more photos, and the idle timer handles the rest.
    scheduleTeardown()
  }
}
