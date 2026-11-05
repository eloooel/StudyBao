import { describe, expect, it } from 'vitest'

import { getDb } from '@/db/schema'
import { BACKUP_TABLES } from '@/lib/backup-format'

import { SYNCED_TABLES } from './merge'

/**
 * The guard I owed from milestone 1.
 *
 * `backup.test.ts` already asserts that `BACKUP_TABLES` covers every table in the schema, because
 * `sessions` and `lessons` were added to the database after the backup format was written. Sync has the
 * same failure mode and would fail more quietly: a seventh table missing from `SYNCED_TABLES` is never
 * pulled and never pushed, so it would simply not survive a wipe — the exact thing sync exists to
 * prevent, discovered after her phone was the only copy.
 *
 * So the list is compared to the **open schema**, not to a copy of it. `db.tables` is the database's own
 * answer and cannot be edited to make this pass.
 */
describe('the synced table list', () => {
  it('covers exactly the tables the database declares', async () => {
    const db = await getDb()

    const declared = db.tables.map((table) => table.name).sort()

    expect([...SYNCED_TABLES].sort()).toEqual(declared)
  })

  it('matches the backup table list, so the two cannot disagree', () => {
    // Backups and sync have different jobs, but they cover the same records. If one grows a table the
    // other lacks, that table is either unrestorable or unsynced — both invisible until it matters.
    expect([...SYNCED_TABLES].sort()).toEqual([...BACKUP_TABLES].sort())
  })
})
