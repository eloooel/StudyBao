/**
 * The Firebase client config, read from the environment and **validated as data**.
 *
 * Pure and separate from `client.ts` for one reason: this is the part with a rule to get right, so it
 * must be testable without initialising the SDK or touching the network. None of these values is a
 * secret — they ship in the browser bundle by design, and the Firestore rules file is the whole
 * security boundary (ADR 0005). That is also why this module is allowed to exist at all.
 *
 * ## Absent config is the normal case, not an error
 *
 * Cloud sync ships **off** (`VITE_ENABLE_CLOUD_SYNC=false`), so locally there is no `.env` and every
 * variable below is empty. The client must therefore be **unconstructable** rather than broken:
 * `readFirebaseConfig` returns `null`, no SDK is imported, and nothing throws. A missing value in a
 * shipped build is the same value — the flag is the switch, and this module is what stops the switch
 * being flipped before the config is filled in.
 *
 * ## The emulator variable deliberately avoids the words KEY, SECRET and TOKEN
 *
 * `VITE_FIREBASE_EMULATOR_HOST` is a host and port, not a credential. A variable named
 * `..._EMULATOR_TOKEN` would invite exactly the mistake of putting a real secret in a client bundle,
 * which is the mistake `.env.example` and ADR 0005 are trying to prevent.
 */

/** What the Firebase SDK needs to initialise, with the values narrowed to "present and non-empty". */
export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  /**
   * `host` or `host:port` of the local emulators, when one is configured.
   *
   * Absent in a real deployment, where the SDK talks to the project's own services. Kept as one value
   * because Firestore and Auth live on the same emulator host; the two ports are derived here.
   */
  emulator?: EmulatorTarget
}

export interface EmulatorTarget {
  host: string
  port: number
  /** The Auth emulator's base URL. Auth takes a URL where Firestore takes host + port. */
  authUrl: string
}

/** The variables this module reads. Named here once so the tests and `.env.example` cannot drift. */
export const FIREBASE_ENV_VARS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
  emulator: 'VITE_FIREBASE_EMULATOR_HOST',
} as const

/** `import.meta.env` plus Node's `process.env` both satisfy this; neither is exactly it. */
export type EnvSource = Record<string, unknown>

function readText(env: EnvSource, name: string): string | undefined {
  const value = env[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Parse `host` or `host:port`.
 *
 * A malformed value returns `undefined` rather than throwing, and `readFirebaseConfig` then refuses to
 * build a config at all. Silently ignoring a bad emulator host would point the client at the **real**
 * project, which is the one outcome worse than doing nothing.
 */
export function parseEmulatorHost(value: string | undefined): EmulatorTarget | undefined {
  if (value === undefined) return undefined

  const [host, portText, ...rest] = value.split(':')
  if (host === undefined || host === '' || rest.length > 0) return undefined

  // A host is a hostname or an IPv4 literal. A value with spaces or a scheme in it is a config mistake,
  // and accepting it would send a browser-invalid URL to the SDK.
  if (!/^[A-Za-z0-9.-]+$/.test(host)) return undefined

  const port = portText === undefined ? 8080 : Number(portText)
  // A port is 1–65535 and always an integer; `Number('')` is 0, hence the explicit check.
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined

  return { host, port, authUrl: `http://${host}:${String(port)}` }
}

/**
 * The client config, or `null` when it is not fully present.
 *
 * Deliberately all-or-nothing: a half-filled config would initialise an SDK that fails on first use,
 * which is a worse failure than never initialising — the first one looks like a sync bug in her data.
 */
export function readFirebaseConfig(env: EnvSource): FirebaseConfig | null {
  const apiKey = readText(env, FIREBASE_ENV_VARS.apiKey)
  const authDomain = readText(env, FIREBASE_ENV_VARS.authDomain)
  const projectId = readText(env, FIREBASE_ENV_VARS.projectId)
  const appId = readText(env, FIREBASE_ENV_VARS.appId)

  if (
    apiKey === undefined ||
    authDomain === undefined ||
    projectId === undefined ||
    appId === undefined
  ) {
    return null
  }

  const emulatorText = readText(env, FIREBASE_ENV_VARS.emulator)
  const emulator = parseEmulatorHost(emulatorText)

  // Configured but unparseable: unconstructable, never silently promoted to "talk to production".
  if (emulatorText !== undefined && emulator === undefined) return null

  return { apiKey, authDomain, projectId, appId, ...(emulator === undefined ? {} : { emulator }) }
}
