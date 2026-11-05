import { isCloudSyncEnabled } from '../index'

/**
 * Whether permanently deleting a deck is allowed **in this build**.
 *
 * A hard delete is the one thing a two-device sync cannot survive: the other device still has the record,
 * pushes it back on its next pull, and the deck she deliberately destroyed reappears. That is why
 * `CLAUDE.md` says never hard-delete a synced record, and why `softDeleteDeck` exists at all.
 *
 * So the permission is not a policy anyone has to remember — it is a property of the build. Cloud sync is
 * gated on `VITE_ENABLE_CLOUD_SYNC`, which Vite replaces at build time, and the shipped value is `false`.
 * When Workflow 2b flips it, this returns `false` and the control **does not exist** in that build, rather
 * than depending on a later commit to remove it.
 *
 * The parameter is a function argument with a default, the same shape as `isCloudSyncEnabled` itself, so a
 * test can ask the question without touching the environment.
 *
 * **Not** read from `settings.cloudSync`: that field defaults to `true` and is unused until 2b, so using it
 * here would forbid the feature today while proving nothing about whether a second copy exists.
 */
export function canPurgeDecks(
  input: { syncEnabled: boolean } = { syncEnabled: isCloudSyncEnabled() },
): boolean {
  return !input.syncEnabled
}
