import { describe, expect, it } from 'vitest'

import { canPurgeDecks } from './can-purge'

/**
 * The guard on the only hard delete in the app.
 *
 * It is a two-case function, and both cases are load-bearing: getting this wrong is not a cosmetic bug,
 * it is a deck she deliberately destroyed coming back on the other device's next pull.
 */
describe('canPurgeDecks', () => {
  it('refuses when cloud sync is compiled in, because a second copy would resurrect the record', () => {
    expect(canPurgeDecks({ syncEnabled: true })).toBe(false)
  })

  it('allows it when there is no second copy to resurrect anything', () => {
    expect(canPurgeDecks({ syncEnabled: false })).toBe(true)
  })
})
