import fs from 'node:fs'
import path from 'node:path'

/**
 * The PNGs in public/ are generated from icon.svg by this script so they are
 * reproducible and reviewable rather than opaque binaries nobody can regenerate.
 *
 * Run with: node scripts/generate-icons.mjs
 *
 * It uses only Node built-ins: a minimal PNG encoder (zlib + CRC32) and a small
 * rasteriser for the shapes in the icon. No image dependency, nothing to keep
 * patched, and no network access.
 */
import zlib from 'node:zlib'

const OUT_DIR = path.join(process.cwd(), 'public')

// --- Palette (mirrors src/styles/theme.css) --------------------------------
const ROSE = [0xf5, 0xa9, 0xb8]
const PLUM = [0x4a, 0x2e, 0x35]
const CREAM = [0xff, 0xf9, 0xfa]

/** Signed distance to a rounded rectangle, negative inside. */
function roundedRectSdf(x, y, halfW, halfH, radius) {
  const dx = Math.abs(x) - (halfW - radius)
  const dy = Math.abs(y) - (halfH - radius)
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - radius
}

/** Signed distance to a circle, negative inside. */
function circleSdf(x, y, r) {
  return Math.hypot(x, y) - r
}

/**
 * The bow: two circular loops that only just meet, plus a knot in the middle.
 *
 * The loop radius and offset are tuned so the loops do NOT overlap: overlapping
 * them merges the two shapes into a single peanut silhouette. A small gap bridged
 * by the knot is what makes it read as a bow.
 */
function bowSdf(x, y, scale) {
  const loopR = 0.205 * scale
  const offset = 0.219 * scale
  const knotR = 0.072 * scale
  const left = circleSdf(x + offset, y, loopR)
  const right = circleSdf(x - offset, y, loopR)
  return Math.min(Math.min(left, right), circleSdf(x, y, knotR))
}

/**
 * `safeZone` is the fraction of the canvas the artwork must stay inside.
 * Maskable icons are cropped to a circle on Android, so their artwork is inset
 * to the 80% safe zone and the background bleeds to the edges.
 */
function renderIcon(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 3)
  const safeZone = maskable ? 0.62 : 0.82
  const plateRadius = maskable ? 0.5 : 0.235 // maskable plate fills the circle

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      // Normalised coords in [-0.5, 0.5]
      const x = (px + 0.5) / size - 0.5
      const y = (py + 0.5) / size - 0.5

      let colour = CREAM

      // Rounded-square plate (or full bleed for maskable).
      const plate = maskable
        ? circleSdf(x, y, 0.5) - 0.01
        : roundedRectSdf(x, y, 0.5, 0.5, plateRadius)

      if (plate < 0) colour = ROSE

      // The bow, in plum, inside the safe zone.
      const bow = bowSdf(x, y, safeZone)
      if (bow < 0 && plate < 0) colour = PLUM

      const idx = (py * size + px) * 3
      pixels[idx] = colour[0]
      pixels[idx + 1] = colour[1]
      pixels[idx + 2] = colour[2]
    }
  }

  return pixels
}

// --- Minimal PNG writer -----------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(width, height, rgb) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Each scanline is prefixed with a filter byte (0 = None).
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- Emit -------------------------------------------------------------------
const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  // iOS reads this exact size and ignores the manifest icons.
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
]

fs.mkdirSync(OUT_DIR, { recursive: true })

for (const { file, size, maskable } of TARGETS) {
  const png = encodePng(size, size, renderIcon(size, { maskable }))
  fs.writeFileSync(path.join(OUT_DIR, file), png)
  process.stdout.write(`wrote public/${file} (${size}x${size}, ${png.length} bytes)\n`)
}
