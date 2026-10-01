import { describe, expect, it } from 'vitest'

import { MAX_IMAGE_EDGE, applyContrast, fitWithin, preparePixels, toLuminance } from './image-prep'

/**
 * Image preparation for OCR.
 *
 * Pure pixel maths, tested directly. The canvas work lives in `ocr.ts` and cannot run under
 * jsdom; separating the decision from the drawing is what makes this part testable at all, which
 * is the whole reason the split exists.
 */
describe('fitWithin', () => {
  it('downscales a phone photo to the long-edge target', () => {
    // A 12 MP phone photo. This is the case the step exists for: four times the pixels
    // Tesseract needs, all of it slower for no gain.
    expect(fitWithin({ width: 4032, height: 3024 })).toEqual({ width: 1600, height: 1200 })
  })

  it('scales a tall photo by its height, not its width', () => {
    expect(fitWithin({ width: 3024, height: 4032 })).toEqual({ width: 1200, height: 1600 })
  })

  it('never scales up a small image', () => {
    // Blowing up a clear 600px screenshot invents no detail and costs time.
    expect(fitWithin({ width: 600, height: 400 })).toEqual({ width: 600, height: 400 })
  })

  it('leaves an image already at the target alone', () => {
    expect(fitWithin({ width: MAX_IMAGE_EDGE, height: 900 })).toEqual({ width: 1600, height: 900 })
  })

  it('rounds to whole pixels and never to zero', () => {
    // A 1px-tall image at a large scale would round to 0 and become undrawable.
    const tiny = fitWithin({ width: 8000, height: 1 })
    expect(tiny.height).toBeGreaterThanOrEqual(1)
    expect(tiny.width).toBe(MAX_IMAGE_EDGE)
  })

  it('handles a zero-sized image without dividing by zero', () => {
    expect(fitWithin({ width: 0, height: 0 })).toEqual({ width: 1, height: 1 })
  })
})

describe('toLuminance', () => {
  it('keeps white white and black black', () => {
    expect(toLuminance(255, 255, 255)).toBe(255)
    expect(toLuminance(0, 0, 0)).toBe(0)
  })

  it('weights green highest and blue lowest, as Rec. 601 does', () => {
    // The point of luminance rather than a flat average: a blue annotation on white paper is
    // much darker to the eye than a green one, and OCR should see it that way too.
    expect(toLuminance(0, 255, 0)).toBeGreaterThan(toLuminance(255, 0, 0))
    expect(toLuminance(255, 0, 0)).toBeGreaterThan(toLuminance(0, 0, 255))
  })
})

describe('applyContrast', () => {
  it('leaves mid-grey unchanged', () => {
    expect(applyContrast(128, 1.35)).toBe(128)
  })

  it('pushes light pixels lighter and dark ones darker', () => {
    expect(applyContrast(180, 1.35)).toBeGreaterThan(180)
    expect(applyContrast(80, 1.35)).toBeLessThan(80)
  })

  it('clamps instead of wrapping around', () => {
    // A wrap would turn near-white paper into black, which is the opposite of the intent and
    // would be maddening to debug from an OCR result.
    expect(applyContrast(250, 4)).toBe(255)
    expect(applyContrast(5, 4)).toBe(0)
  })

  it('is the identity at factor 1', () => {
    expect(applyContrast(200, 1)).toBe(200)
  })
})

describe('preparePixels', () => {
  it('greys every channel and leaves alpha alone', () => {
    // Alpha is the part that matters: zeroing it makes the image transparent, and Tesseract
    // would then be reading a blank page.
    const pixels = new Uint8ClampedArray([255, 0, 0, 200, 0, 255, 0, 128])

    preparePixels(pixels, 1)

    const [r1, g1, b1, a1] = [...pixels]
    expect(r1).toBe(g1)
    expect(g1).toBe(b1)
    expect(a1).toBe(200)

    const [, , , a2] = [...pixels.slice(4)]
    expect(a2).toBe(128)
  })

  it('stops at the last whole pixel and ignores a trailing partial one', () => {
    // A buffer whose length is not a multiple of four must not read past its end.
    const pixels = new Uint8ClampedArray([10, 20, 30, 255, 99])
    expect(() => preparePixels(pixels, 1)).not.toThrow()
    expect(pixels[4]).toBe(99)
  })

  it('raises contrast at a factor above 1', () => {
    const pixels = new Uint8ClampedArray([200, 200, 200, 255])
    preparePixels(pixels, 1.5)
    expect(pixels[0]).toBeGreaterThan(200)
  })

  it('does nothing to an empty buffer', () => {
    const pixels = new Uint8ClampedArray([])
    expect(() => preparePixels(pixels, 2)).not.toThrow()
    expect(pixels).toHaveLength(0)
  })
})
