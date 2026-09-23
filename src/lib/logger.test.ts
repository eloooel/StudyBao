import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from './logger'

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('routes warn and error to their console methods', () => {
    logger.warn('careful')
    logger.error('broke')

    expect(console.warn).toHaveBeenCalledWith('[studybao]', 'careful')
    expect(console.error).toHaveBeenCalledWith('[studybao]', 'broke')
  })

  it('keeps debug and info out of console.log, which is banned app-wide', () => {
    // `no-console` allows only warn/error, so lower levels must not reach
    // console.log or the lint rule would be violated by the logger itself.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    logger.debug('trace')
    logger.info('fyi')

    expect(log).not.toHaveBeenCalled()
  })

  it('emits debug and info in a non-production build so they are visible in dev', () => {
    logger.debug('trace')

    expect(console.warn).toHaveBeenCalledWith('[studybao]', 'trace')
  })
})
