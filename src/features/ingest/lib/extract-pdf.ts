/**
 * PDF text extraction — the highest-fidelity ingest path after pasting.
 *
 * A digital PDF carries its text, so this reads it rather than recognising it: no OCR error
 * at all, which is why `BUILD_GUIDE.md` §3 makes paste/PDF the default and labels photo OCR
 * best-effort.
 *
 * ## Everything is same-origin, and that is the point
 *
 * PDF.js fetches three things at runtime, and all three default to a CDN: the **worker**, the
 * **wasm decoders**, and (for CJK) the **cmaps**. A CDN fetch would break the offline
 * guarantee outright, so:
 *
 * - the worker URL is produced by Vite (`?url`), which copies it into the build with a hash
 *   so a stale cached worker cannot be paired with a new main bundle;
 * - the wasm decoders come from `public/pdfjs/wasm/`, placed there by
 *   `scripts/copy-pdf-assets.mjs`;
 * - cmaps are deliberately **not** shipped (169 files, ~1.4 MB, CJK only). Her notes are
 *   English; see the note in that script for what to do if a PDF ever reads as boxes.
 *
 * **A note on `isEvalSupported`:** earlier PDF.js versions let a caller refuse `eval`-based
 * font and CMap handling, and passing `isEvalSupported: false` here was the intent. PDF.js 6
 * removed the option — there is no longer a switch to set, which typechecking caught rather
 * than shipping an option that silently does nothing.
 *
 * ## Why this lives in `lib/` but is not a pure function
 *
 * It touches the network and a Worker, so `docs/ai/add-feature.md` puts it in the hook layer
 * rather than in `lib/` beside the parser. It is here anyway because it is not a *decision* —
 * there is nothing to unit-test — and the extractable part, turning PDF text items into
 * lines, **is** pure and tested separately in `pdf-lines.ts` / `pdf-lines.test.ts`. The
 * boundary is drawn where the tests are.
 */
import { contentItemsToLines, type PdfTextItemLike } from './pdf-lines'

export interface ExtractPdfResult {
  text: string
  pageCount: number
  /**
   * True when the PDF produced no text at all. Almost always a **scanned** document — pages
   * of images with no text layer — and the honest answer is to say so and point her at the
   * photo path, not to present an empty textarea.
   */
  looksScanned: boolean
}

/** One page's worth of text items, in the shape `pdf-lines` needs. Deliberately narrow. */
interface PdfPageLike {
  getTextContent: () => Promise<{ items: PdfTextItemLike[] }>
}

export interface ExtractPdfOptions {
  /**
   * Called as pages are read, so a 200-page file can say "page 12 of 200" rather than looking
   * frozen. Optional because the tests do not need it.
   */
  onProgress?: (done: number, total: number) => void
}

/**
 * Our own copy of the worker, served same-origin.
 *
 * Written out by `scripts/copy-pdf-assets.mjs` and fetched only when a PDF is opened. Vendored
 * rather than imported with Vite's `?url` because PDF.js itself is imported **dynamically**
 * below — so its ~350 KB is not in the eagerly-loaded ingest chunk — and Vite cannot combine
 * `?url` with a dynamic import.
 *
 * `?v=` is the part that matters: this file lives in `public/`, which Vite does not hash, and a
 * long `Cache-Control` on it (see `vercel.json`) means a stale worker could otherwise be paired
 * with a new main bundle. Bump the value whenever `pdfjs-dist` is upgraded.
 */
const PDFJS_VERSION = '6.3.289'
export const pdfWorkerUrl = `/pdfjs/build/pdf.worker.min.mjs?v=${PDFJS_VERSION}`

/** Same-origin wasm image decoders, fetched on demand. */
const PDFJS_WASM_URL = '/pdfjs/wasm/'

/**
 * Read the text out of a PDF.
 *
 * Throws with a message intended for her, not for a log: an encrypted file and a corrupt one
 * are different problems and she can act on the difference (the first one she can re-export,
 * the second one she cannot).
 */
export async function extractPdfText(
  file: File,
  options: ExtractPdfOptions = {},
): Promise<ExtractPdfResult> {
  const data = new Uint8Array(await file.arrayBuffer())

  // Imported here, not at module scope: this is the only place PDF.js is needed, and a static
  // import put the whole library in the ingest page's chunk — 436 KB fetched by anyone who just
  // wanted to paste text. Measured, not assumed.
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const task = pdfjs.getDocument({
    data,
    // Same-origin wasm decoders. Without this PDF.js reaches for a CDN for JBIG2/JPEG-2000.
    wasmUrl: PDFJS_WASM_URL,
  })

  try {
    const pdf = await task.promise
    const lines: string[] = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = (await pdf.getPage(pageNumber)) as unknown as PdfPageLike
      const content = await page.getTextContent()
      lines.push(...contentItemsToLines(content.items))
      options.onProgress?.(pageNumber, pdf.numPages)
    }

    const text = lines.join('\n')

    return {
      text,
      pageCount: pdf.numPages,
      // A one-line PDF is possible; an empty one is almost always a scan.
      looksScanned: text.trim().length === 0,
    }
  } catch (error) {
    throw new Error(readablePdfError(error))
  } finally {
    // Releases the worker and the parsed document. Without this a second import in the same
    // session re-uses the first document, which shows up as the wrong text on screen.
    await task.destroy()
  }
}

/**
 * Turn a PDF.js failure into a sentence she can act on.
 *
 * The `name` is read off the thrown value rather than matched with `instanceof`, because
 * PDF.js throws a plain object with a `name` for the expected cases and a real `Error` for
 * the unexpected ones — and `instanceof` across a Worker boundary is not dependable.
 */
function readablePdfError(error: unknown): string {
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''

  switch (name) {
    case 'PasswordException':
      return 'This PDF is locked with a password. Open it on your device, remove the password or copy the text out, and paste it instead.'
    case 'InvalidPDFException':
      return "That file doesn't look like a PDF. If it's a Word document or a photo, try copying the text and pasting it instead."
    case 'MissingPDFException':
      return 'That file could not be read. Try choosing it again.'
    case 'UnexpectedResponseException':
      return "This PDF is damaged in a way we can't read. Try another copy, or copy the text out and paste it."
    default:
      return "We couldn't read that PDF. Copying the text out and pasting it will always work — and gives exactly the same cards."
  }
}
