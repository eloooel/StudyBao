import { describe, expect, it } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('joins class names in order', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy values so `cond && cls` needs no fallback', () => {
    expect(cn('a', false, null, undefined, '', 0, 'b')).toBe('a b')
  })

  it('flattens nested arrays', () => {
    expect(cn(['a', ['b', false, ['c']]])).toBe('a b c')
  })

  it('lets the last conflicting Tailwind utility win', () => {
    // This is the whole reason tailwind-merge is a dependency: with plain
    // concatenation, the winner would be decided by Tailwind's generated CSS
    // order instead of by the caller.
    expect(cn('bg-primary', 'bg-sage')).toBe('bg-sage')
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })

  it('returns an empty string for no input', () => {
    expect(cn()).toBe('')
  })
})
