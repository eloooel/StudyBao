import { describe, expect, it } from 'vitest'

import { FIREBASE_ENV_VARS, parseEmulatorHost, readFirebaseConfig } from './config'

/**
 * Configuration is data, so it is tested as data — no SDK, no network, no emulator.
 *
 * The property that matters most is the negative one: locally there is no `.env`, and the client must be
 * **unconstructable** rather than half-built. A half-filled config would initialise an SDK that fails on
 * first use, and the first failure she would see looks like a bug in her data.
 */

function complete(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [FIREBASE_ENV_VARS.apiKey]: 'api-key-value',
    [FIREBASE_ENV_VARS.authDomain]: 'studybao.firebaseapp.com',
    [FIREBASE_ENV_VARS.projectId]: 'studybao',
    [FIREBASE_ENV_VARS.appId]: '1:2:web:3',
    ...overrides,
  }
}

describe('readFirebaseConfig', () => {
  it('is null when nothing is configured — the normal local case', () => {
    expect(readFirebaseConfig({})).toBeNull()
  })

  it.each([
    FIREBASE_ENV_VARS.apiKey,
    FIREBASE_ENV_VARS.authDomain,
    FIREBASE_ENV_VARS.projectId,
    FIREBASE_ENV_VARS.appId,
  ])('is null when %s is missing', (name) => {
    const env = complete()
    delete env[name]

    expect(readFirebaseConfig(env)).toBeNull()
  })

  it('is null when a value is empty or whitespace', () => {
    expect(readFirebaseConfig(complete({ [FIREBASE_ENV_VARS.apiKey]: '   ' }))).toBeNull()
  })

  it('reads and trims a complete config', () => {
    expect(
      readFirebaseConfig(
        complete({
          [FIREBASE_ENV_VARS.apiKey]: '  api-key-value  ',
          [FIREBASE_ENV_VARS.projectId]: ' studybao ',
        }),
      ),
    ).toEqual({
      apiKey: 'api-key-value',
      authDomain: 'studybao.firebaseapp.com',
      projectId: 'studybao',
      appId: '1:2:web:3',
    })
  })

  it('adds the emulator target when a host is configured', () => {
    const config = readFirebaseConfig(complete({ [FIREBASE_ENV_VARS.emulator]: '127.0.0.1:8080' }))

    expect(config?.emulator).toEqual({
      host: '127.0.0.1',
      port: 8080,
      authUrl: 'http://127.0.0.1:8080',
    })
  })

  it('refuses to build a config from an unparseable emulator host', () => {
    // Silently ignoring the bad host would point the client at the real project — the one outcome worse
    // than not starting at all.
    expect(readFirebaseConfig(complete({ [FIREBASE_ENV_VARS.emulator]: 'not a host' }))).toBeNull()
    expect(
      readFirebaseConfig(complete({ [FIREBASE_ENV_VARS.emulator]: '127.0.0.1:not-a-port' })),
    ).toBeNull()
  })

  it('ignores non-string values rather than coercing them', () => {
    expect(readFirebaseConfig(complete({ [FIREBASE_ENV_VARS.apiKey]: 42 }))).toBeNull()
  })
})

describe('parseEmulatorHost', () => {
  it('defaults the port to 8080 when only a host is given', () => {
    expect(parseEmulatorHost('localhost')).toEqual({
      host: 'localhost',
      port: 8080,
      authUrl: 'http://localhost:8080',
    })
  })

  it('accepts host:port', () => {
    expect(parseEmulatorHost('10.0.0.5:9099')).toEqual({
      host: '10.0.0.5',
      port: 9099,
      authUrl: 'http://10.0.0.5:9099',
    })
  })

  it.each(['', ':', ':8080', 'host:', 'host:0', 'host:65536', 'host:80:80', 'host:8.5'])(
    'rejects %j',
    (value) => {
      expect(parseEmulatorHost(value)).toBeUndefined()
    },
  )
})
