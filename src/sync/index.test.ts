import { describe, expect, it } from 'vitest'

import { isCloudSyncEnabled, startCloudSync } from './index'

/**
 * The flag, as a decision rather than a comment.
 *
 * The test that matters is the last one: with the flag off, `startCloudSync` returns before the dynamic
 * import, so not one byte of Firebase is requested. The stronger version of that claim — "the entry chunk
 * contains no Firestore SDK" — is asserted against the built output by
 * `scripts/check-sync-inert.mjs`, which runs as `postbuild`. Intent is not evidence here.
 */
describe('isCloudSyncEnabled', () => {
  it('is true only for the exact string "true"', () => {
    expect(isCloudSyncEnabled('true')).toBe(true)

    for (const value of ['false', '', 'TRUE', '1', 'yes', undefined, ' true']) {
      expect(isCloudSyncEnabled(value)).toBe(false)
    }
  })
})

describe('startCloudSync', () => {
  it('returns disabled before importing anything when the flag is off', async () => {
    // No mocks and no emulator: if this path reached the dynamic import, the test environment would
    // initialise Firebase, which is precisely the behaviour that must not happen.
    await expect(startCloudSync('false')).resolves.toEqual({ status: 'disabled' })
    await expect(startCloudSync(undefined)).resolves.toEqual({ status: 'disabled' })
  })
})
