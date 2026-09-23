/**
 * The only place in the app that touches `console`. `no-console` is an error
 * everywhere else (see eslint.config.js), so that a stray debug log cannot ship.
 *
 * Levels below `warn` are dropped in production builds, which is also what keeps
 * debug output out of her browser console on a device we cannot inspect.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const isProduction = import.meta.env.PROD

const PREFIX = '[studybao]'

function emit(level: LogLevel, args: unknown[]): void {
  if (isProduction && (level === 'debug' || level === 'info')) return

  switch (level) {
    case 'warn':
      console.warn(PREFIX, ...args)
      break
    case 'error':
      console.error(PREFIX, ...args)
      break
    default:
      // debug and info are development-only, so routing them through
      // console.warn is intentional: it keeps `no-console` meaningful.
      console.warn(PREFIX, ...args)
  }
}

export const logger = {
  debug: (...args: unknown[]): void => emit('debug', args),
  info: (...args: unknown[]): void => emit('info', args),
  warn: (...args: unknown[]): void => emit('warn', args),
  error: (...args: unknown[]): void => emit('error', args),
}
