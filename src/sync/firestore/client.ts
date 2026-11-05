import type { FirebaseApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import type * as FirestoreModule from 'firebase/firestore'

import { readFirebaseConfig, type FirebaseConfig } from './config'

/**
 * Firebase initialisation, and the **only module in the app that imports the Firebase SDK**.
 *
 * ## Everything here is a dynamic import, on purpose
 *
 * The three `import()` calls below are the single door the SDK comes through. Nothing statically
 * imports `firebase/*` — not this file at runtime, not the adapter, not the entry. With
 * `VITE_ENABLE_CLOUD_SYNC` off, `startCloudSync()` returns before it ever reaches this module, so the
 * browser never requests the SDK at all. That matters on her 3 GB iPad: Firestore is large, and a lazy
 * chunk that gets precached is not lazy (see `src/pwa.config.ts`).
 *
 * ## Absent config is not an error
 *
 * Locally there is no `.env`, so every variable is empty and `createFirebaseClient` resolves `null`.
 * It never throws for missing values: a thrown error at startup is a broken app, and an app with sync
 * switched off is the intended state. A real initialisation failure still rejects, and
 * `startCloudSync()` turns it into a value.
 *
 * The client is memoised because `initializeApp` with a repeated name throws and `connect*Emulator`
 * may only be called once per instance. One module-level promise is enough for one user.
 */

/** The name of the Firebase app, so a second initialisation reuses this one rather than throwing. */
const APP_NAME = 'studybao-sync'

/**
 * The Firestore SDK module's type, without a value import.
 *
 * `import type * as` is erased, so naming the module here cannot pull it into the bundle — which is the
 * whole point. A value import for the type (`import * as FirestoreModule`) would do exactly what this
 * module exists to prevent.
 */
export type FirestoreSdk = typeof FirestoreModule

export interface FirebaseClient {
  app: FirebaseApp
  auth: Auth
  firestore: Firestore
  /**
   * The Firestore SDK module itself.
   *
   * Handed to the adapter instead of letting it `import 'firebase/firestore'` statically, so the claim
   * above ("one door for the SDK") stays true rather than becoming a comment that is only mostly right.
   */
  firestoreSdk: FirestoreSdk
}

async function initialize(config: FirebaseConfig): Promise<FirebaseClient> {
  const [appSdk, firestoreSdk, authSdk] = await Promise.all([
    import('firebase/app'),
    import('firebase/firestore'),
    import('firebase/auth'),
  ])

  const existing = appSdk.getApps().find((app) => app.name === APP_NAME)
  const app =
    existing ??
    appSdk.initializeApp(
      {
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        appId: config.appId,
      },
      APP_NAME,
    )

  const firestore = firestoreSdk.getFirestore(app)
  const auth = authSdk.getAuth(app)

  if (config.emulator !== undefined) {
    firestoreSdk.connectFirestoreEmulator(firestore, config.emulator.host, config.emulator.port)
    authSdk.connectAuthEmulator(auth, config.emulator.authUrl, { disableWarnings: true })
  }

  return { app, auth, firestore, firestoreSdk }
}

let pending: Promise<FirebaseClient | null> | null = null

/**
 * The client, or `null` when the config is absent or incomplete.
 *
 * A failed initialisation clears the memo so a later attempt can retry — a permanently rejected promise
 * would make one transient failure look like "sync is impossible on this device".
 */
export function createFirebaseClient(
  config: FirebaseConfig | null = readFirebaseConfig(import.meta.env),
): Promise<FirebaseClient | null> {
  if (config === null) return Promise.resolve(null)

  pending ??= initialize(config).catch((error: unknown) => {
    pending = null
    throw error
  })

  return pending
}
