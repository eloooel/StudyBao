import type { Firestore } from 'firebase/firestore'

import type { SyncedTable } from '../lib/merge'
import type { FirestoreSdk } from './client'
import { MAX_WRITES_PER_BATCH } from './transport'
import type { RemoteDocument, RemoteStore, RemoteWrite } from './transport'

/**
 * The Firestore adapter: `users/{uid}/{table}/{id}`, one document per record.
 *
 * Ids are already UUIDs (or stable seeded ids), so a document id is the record id — there is no second
 * scheme to keep in step. The body keeps the `id` field as well, which is redundant on the way out and
 * load-bearing on the way in: `pull` rejects a document whose body id and path id disagree, rather than
 * applying a record under an identity it was not stored under. It also makes the document a complete
 * record in the console, which is how a human audits a sync.
 *
 * The adapter deliberately knows nothing about validation, merging or batching. It lists raw documents
 * and commits the rows it is given; `transport.ts` decides what may be written and in what size chunks.
 * That is what keeps the untested part (Firebase) small and the tested part (the rules that decide what
 * reaches her database) free of an emulator.
 */

export interface FirestoreRemoteDeps {
  firestore: Firestore
  /** Passed in by `client.ts` for the reason stated there: one dynamic import for the whole SDK. */
  firestoreSdk: FirestoreSdk
}

export function createFirestoreRemoteStore(deps: FirestoreRemoteDeps, uid: string): RemoteStore {
  if (uid === '') throw new Error('A user id is required to build Firestore document paths')

  const { firestore, firestoreSdk: sdk } = deps
  const root = `users/${uid}`

  return {
    maxWritesPerBatch: MAX_WRITES_PER_BATCH,

    async list(table: SyncedTable): Promise<RemoteDocument[]> {
      const snapshot = await sdk.getDocs(sdk.collection(firestore, `${root}/${table}`))

      return snapshot.docs.map((document) => ({ id: document.id, data: document.data() }))
    },

    async write(table: SyncedTable, rows: readonly RemoteWrite[]): Promise<void> {
      const batch = sdk.writeBatch(firestore)

      for (const row of rows) {
        batch.set(sdk.doc(firestore, `${root}/${table}/${row.id}`), row.data)
      }

      await batch.commit()
    },
  }
}
