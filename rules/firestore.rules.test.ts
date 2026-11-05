import { readFileSync } from 'node:fs'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import * as firestoreSdk from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createFirestoreRemoteStore } from '@/sync/firestore/firestore-remote'
import { createTransport } from '@/sync/firestore/transport'

/**
 * The rules are the whole security boundary, so they are tested like one.
 *
 * The three cases `BUILD_GUIDE.md` §9 names are here — the allow-listed user can read and write, an
 * anonymous client is denied, a different authenticated user is denied — plus the two ways this file's
 * own rules could quietly become too broad: an allow-listed email on someone else's path, and a document
 * whose body id disagrees with its path.
 *
 * **The allow-listed email is read out of `firestore.rules` itself**, not duplicated here. A test that
 * hard-codes `owner@example.com` keeps passing after the rule is changed to a different address, which
 * is the one drift a security test must not have. If the rules stop containing a recognisable email
 * constant, the file below throws instead of silently testing nothing.
 *
 * The emulator is not Firestore. Passing here proves the rules file's logic; it does not prove the
 * deployed project behaves the same, and nothing in this milestone ran against a real project.
 */

const PROJECT_ID = 'demo-studybao'
const OWNER_UID = 'owner-uid'
const OTHER_UID = 'other-uid'

type TestEnvironment = Awaited<ReturnType<typeof initializeTestEnvironment>>

/**
 * `rules-unit-testing` types `context.firestore()` as the **compat** Firestore, but its own documentation
 * uses it directly with the modular API (`doc(alice.firestore(), …)`). At runtime it is the same
 * @firebase/firestore instance; only the declaration is the older shape, so the cast is a type bridge and
 * nothing else. If that ever stops being true the emulator tests below fail immediately — which is the
 * point of exercising the real adapter rather than a fake.
 */
type ModularFirestore = firestoreSdk.Firestore

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

const OWNER_EMAIL = (() => {
  const match = /request\.auth\.token\.email\s*==\s*'([^']+)'/.exec(RULES)
  if (match?.[1] === undefined) {
    throw new Error(
      'firestore.rules no longer contains an allow-listed email constant ' +
        "(request.auth.token.email == '…'). The rules test cannot know who is allowed without it.",
    )
  }
  return match[1]
})()

const EMULATOR = (() => {
  const value = process.env.FIRESTORE_EMULATOR_HOST
  const [host, portText, ...rest] = (value ?? '').split(':')
  const port = Number(portText)

  if (
    value === undefined ||
    host === undefined ||
    host === '' ||
    rest.length > 0 ||
    !Number.isInteger(port) ||
    port < 1
  ) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is not set. Run this suite as:\n' +
        '  firebase emulators:exec --only firestore "npm run test:rules"',
    )
  }

  return { host, port }
})()

const deck = {
  id: 'deck-1',
  subject: 'practice-i',
  name: 'Nursing Practice I',
  scope: '',
  updatedAt: 10,
}

let testEnv: TestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES, host: EMULATOR.host, port: EMULATOR.port },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

async function seedOwnedDeck(): Promise<void> {
  // Rules disabled: this is the "already in the database" state, not a write under test.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await firestoreSdk.setDoc(
      firestoreSdk.doc(
        context.firestore() as unknown as ModularFirestore,
        `users/${OWNER_UID}/decks/deck-1`,
      ),
      deck,
    )
  })
}

function ownerDb(): ModularFirestore {
  return testEnv
    .authenticatedContext(OWNER_UID, { email: OWNER_EMAIL, email_verified: true })
    .firestore() as unknown as ModularFirestore
}

describe('firestore.rules', () => {
  it('the allow-listed user can read and write her own records', async () => {
    await seedOwnedDeck()
    const db = ownerDb()

    const snapshot = await assertSucceeds(
      firestoreSdk.getDoc(firestoreSdk.doc(db, `users/${OWNER_UID}/decks/deck-1`)),
    )
    expect(snapshot.exists()).toBe(true)
    expect(snapshot.data()).toMatchObject({ id: 'deck-1', name: 'Nursing Practice I' })

    await assertSucceeds(
      firestoreSdk.setDoc(firestoreSdk.doc(db, `users/${OWNER_UID}/decks/deck-2`), {
        ...deck,
        id: 'deck-2',
      }),
    )
  })

  it('an anonymous client is denied', async () => {
    await seedOwnedDeck()
    const db = testEnv.unauthenticatedContext().firestore() as unknown as ModularFirestore

    await assertFails(firestoreSdk.getDoc(firestoreSdk.doc(db, `users/${OWNER_UID}/decks/deck-1`)))
    await assertFails(
      firestoreSdk.setDoc(firestoreSdk.doc(db, `users/${OWNER_UID}/decks/deck-3`), {
        ...deck,
        id: 'deck-3',
      }),
    )
  })

  it('a different authenticated user is denied', async () => {
    await seedOwnedDeck()
    const db = testEnv
      .authenticatedContext(OTHER_UID, {
        email: 'someone-else@example.com',
        email_verified: true,
      })
      .firestore() as unknown as ModularFirestore

    await assertFails(firestoreSdk.getDoc(firestoreSdk.doc(db, `users/${OWNER_UID}/decks/deck-1`)))
    await assertFails(
      firestoreSdk.setDoc(firestoreSdk.doc(db, `users/${OWNER_UID}/decks/deck-4`), {
        ...deck,
        id: 'deck-4',
      }),
    )
  })

  it('the allow-listed email cannot read another user’s tree', async () => {
    // The email alone is not the authorisation: the token's uid must match the path, or a second
    // account sharing the address (or a token minted elsewhere) could reach any tree.
    const db = ownerDb()

    await assertFails(firestoreSdk.getDoc(firestoreSdk.doc(db, `users/${OTHER_UID}/decks/deck-1`)))
  })

  it('a document whose body id disagrees with its path is denied', async () => {
    const db = ownerDb()

    await assertFails(
      firestoreSdk.setDoc(firestoreSdk.doc(db, `users/${OWNER_UID}/decks/deck-9`), {
        ...deck,
        id: 'some-other-id',
      }),
    )
  })

  it('a hard delete is denied — a synced record is tombstoned instead', async () => {
    await seedOwnedDeck()
    const db = ownerDb()

    await assertFails(
      firestoreSdk.deleteDoc(firestoreSdk.doc(db, `users/${OWNER_UID}/decks/deck-1`)),
    )
  })

  it('the real adapter and transport write and pull through the rules', async () => {
    // This is the half the emulator is uniquely able to prove: `users/{uid}/{table}/{id}` paths, the
    // real Firestore SDK, the real rules, and the transport's validation all at once.
    const db = ownerDb()
    const remote = createFirestoreRemoteStore({ firestore: db, firestoreSdk }, OWNER_UID)
    const transport = createTransport(remote)

    const row = { ...deck, id: 'deck-through-transport', updatedAt: 20 }
    const pushed = await transport.push([{ table: 'decks', merged: [row], push: [row] }])
    expect(pushed.ok).toBe(true)

    const pulled = await transport.pull()
    expect(pulled.rejected).toEqual([])
    expect(pulled.rows.decks).toEqual([row])
  })
})
