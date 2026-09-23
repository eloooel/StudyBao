/**
 * Time constants, in one place.
 *
 * These exist so no scheduling code contains a bare `86_400_000`. A typo in a magic number
 * is invisible in review and silently wrong in production, which is exactly the class of
 * bug this project cannot afford (docs/ai/write-tests.md).
 */

export const MS_PER_MINUTE = 60_000
export const MS_PER_HOUR = 60 * MS_PER_MINUTE
export const MS_PER_DAY = 24 * MS_PER_HOUR
