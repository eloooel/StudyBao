/**
 * Image preparation for OCR — downscale, grey out, raise contrast.
 *
 * These are **pure functions over pixels**, deliberately. `BUILD_GUIDE.md` §3 says preprocessing
 * matters more than tinkering with Tesseract's own parameters, which makes it the part worth
 * testing, and a canvas is not available under jsdom — so the decision (how much to scale, what
 * each channel becomes) is separated from the drawing. `ocr.ts` does the canvas work and calls
 * these.
 *
 * Anatomy of the pipeline, and why each step is here:
 *
 * - **Downscale to ~1600px on the long edge.** A modern phone photo is 4000px wide. Tesseract's
 *   own detector works best around 300 dpi of *text*, and feeding it four times the pixels it
 *   needs mostly makes it slower. 1600 is the guide's number.
 * - **Grayscale.** Tesseract binarises internally; giving it luminance removes the chance that a
 *   coloured highlight reads as a stroke edge.
 * - **Contrast.** Phone photos of paper are grey and low-contrast. Stretching around mid-grey is
 *   what turns faint pencil into black-on-white.
 */

/** The long-edge target. From `docs/BUILD_GUIDE.md` §3. */
export const MAX_IMAGE_EDGE = 1600

export interface ImageSize {
  width: number
  height: number
}

/**
 * Scale a size so its long edge is at most `maxEdge`, preserving the aspect ratio.
 *
 * Never scales **up**: blowing up a small, clear photo would invent no detail and cost time, and
 * a 600px screenshot is already legible to Tesseract.
 */
export function fitWithin(size: ImageSize, maxEdge: number = MAX_IMAGE_EDGE): ImageSize {
  const longest = Math.max(size.width, size.height)
  if (longest <= maxEdge || longest === 0) {
    return {
      width: Math.max(1, Math.round(size.width)),
      height: Math.max(1, Math.round(size.height)),
    }
  }

  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

/**
 * Contrast around mid-grey.
 *
 * `factor` 1 leaves the image alone. The formula is the standard one — push each channel away
 * from 128 by the factor — and 1.35 is mild on purpose: over-cooking contrast turns thin strokes
 * into broken ones and joins letters together, which is worse for OCR than the faintness it was
 * meant to fix.
 */
export function applyContrast(value: number, factor: number): number {
  return clampByte((value - 128) * factor + 128)
}

/** Rec. 601 luminance, which is what "greyscale" means everywhere else in imaging. */
export function toLuminance(red: number, green: number, blue: number): number {
  return clampByte(0.299 * red + 0.587 * green + 0.114 * blue)
}

/**
 * Apply greyscale and contrast to an RGBA buffer in place.
 *
 * Exported and tested because it is the whole visual transformation in four lines, and because
 * the alpha channel must be left untouched — zeroing it would make the image transparent, and
 * Tesseract would then be reading a blank page.
 */
export function preparePixels(pixels: Uint8ClampedArray, factor: number): void {
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const grey = toLuminance(pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0)
    const contrasted = applyContrast(grey, factor)
    pixels[index] = contrasted
    pixels[index + 1] = contrasted
    pixels[index + 2] = contrasted
    // Alpha deliberately untouched: see the doc comment.
  }
}

function clampByte(value: number): number {
  if (value < 0) return 0
  if (value > 255) return 255
  return Math.round(value)
}
