/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * The `VITE_*` contract, as a type.
 *
 * `.env.example` is the human contract and this is the compiler's copy of the names. They are not
 * generated from each other — a variable added to one and not the other still compiles — but a typo in
 * a read is now a type error instead of an `undefined` that looks like "not configured".
 *
 * **Never add a name containing `KEY`, `SECRET` or `TOKEN` here.** `VITE_FIREBASE_API_KEY` predates the
 * rule and is not a secret (it ships in the bundle; ADR 0005). Everything new in this block is public
 * configuration by design, and the naming rule is what keeps that true.
 */
interface ImportMetaEnv {
  /** `'true'` enables cloud sync. Absent or anything else keeps it off. */
  readonly VITE_ENABLE_CLOUD_SYNC?: string

  /** Firebase client config. Safe to ship; the Firestore rules are the security boundary. */
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string

  /**
   * `host` or `host:port` of the local Firestore + Auth emulators, e.g. `127.0.0.1:8080`.
   *
   * Empty in a deployment. Deliberately not named after a credential: it is a host and a port, and a
   * name like `..._EMULATOR_TOKEN` invites putting a real secret in a client bundle.
   */
  readonly VITE_FIREBASE_EMULATOR_HOST?: string

  /** Her email. Mirrors the rules constant for display/UX only — it authorises nothing. */
  readonly VITE_ALLOWED_EMAIL?: string
}
