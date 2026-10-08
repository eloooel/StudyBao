/**
 * The browser plumbing for a backup: naming the file, and getting it out of the page and onto her
 * device.
 *
 * Kept apart from the format rules so the rules stay pure, and apart from the screen so it can be
 * tested by stubbing two globals rather than rendering anything. What it cannot prove is where the
 * file lands — that depends on the browser and the device, and nothing here has one. See
 * docs/EXPORT-IMPORT.md.
 */

/**
 * How long the blob URL is kept alive after the click.
 *
 * Revoking it synchronously is the tidier-looking thing and the wrong one: a browser that has only
 * just been handed the URL may not have read the blob yet, and a revoked URL is a failed download
 * she would experience as "the backup button does nothing". A second is far longer than any browser
 * needs to take the reference and far shorter than anything she would notice.
 */
const BLOB_URL_LIFETIME_MS = 1000

/**
 * `studybao-backup-2026-10-08.json` — named for the day she saved it, in her own zone.
 *
 * Deliberately not `toISOString().slice(0, 10)`. That is UTC, and she is in the Philippines (UTC+8),
 * so a backup saved at 00:30 would be named for the *previous* day — the one case where a filename
 * she reads is simply wrong. `./backup-file.tz.test.ts` pins the zone and asserts exactly that.
 *
 * Also deliberately not the 04:00 study day: a file saved at 01:00 belongs to the day she is living
 * in, not to the study day that began at 04:00 yesterday.
 */
export function backupFilename(now: number): string {
  const date = new Date(now)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `studybao-backup-${String(date.getFullYear())}-${month}-${day}.json`
}

/**
 * Offer `text` to the browser as a download called `fileName`.
 *
 * The anchor is put in the document before the click because iOS Safari ignores `download` on an
 * element that is not in the tree — and iOS Safari is one of the two devices this must work on. The
 * document is injectable so the test owns the element it inspects.
 */
export function downloadTextFile(fileName: string, text: string, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))

  const link = doc.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'

  doc.body.appendChild(link)
  link.click()
  link.remove()

  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LIFETIME_MS)
}
