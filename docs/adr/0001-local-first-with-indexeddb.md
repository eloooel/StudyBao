# ADR 0001 — Local-first storage with IndexedDB, optional Firestore sync

- **Status:** Accepted
- **Date:** 2026-02 (planning)
- **Supersedes:** the "Firebase free tier as primary storage" recommendation in the original build guide

## Context

The app is used by one person, on an iPad and a Windows laptop, while studying — often on campus wifi,
on a bus, or with no connection at all. Two storage options were on the table:

1. **Firestore as the source of truth** (the original recommendation), with a local cache.
2. **Local-first IndexedDB** (Dexie) as the source of truth, with Firestore as an optional sync target.

The app also needs to work if the network is down, and the free tier has to hold.

## Decision

**Dexie/IndexedDB is the source of truth. Firestore is an optional, background, fire-and-forget sync
target.**

- All reads and writes hit Dexie first. The UI never awaits the network.
- Sync pushes local writes and pulls remote changes when connectivity and auth allow.
- Conflicts resolve last-write-wins on `updatedAt`; deletions are tombstones (`deletedAt`), never
  hard deletes.
- Cloud sync requires Firebase Auth (Google, one allow-listed email). Without auth there is no safe
  way to scope Firestore rules — see ADR 0005.

## Consequences

**Good**

- The study surfaces work offline, all the time. This is the whole point.
- Zero network latency in the review loop, which matters when she is grading hundreds of cards.
- Firestore free-tier usage drops to a trickle (a single user's deltas), well inside Spark limits.
- No lock-in: the data is a JSON export away from being portable.

**Bad / cost**

- Sync is now real engineering: tombstones, `updatedAt`, a merge function, and a migration path for
  both schemas. This is the most complex part of the codebase and the most dangerous to change.
- Two devices can diverge if the merge is wrong. Mitigated by unit-testing the merge function and
  never hard-deleting.
- Data durability on iOS depends on where the app runs: Safari's 7-day script-writable-storage cap
  exempts **Home Screen Web Apps**, which is why we prompt her to add it on iPadOS
  ([ADR 0008](0008-add-to-home-screen-on-ipad.md)). If she skips it, cloud sync is the automatic
  safety net and JSON export is the user-controlled one — a heavier reliance on sync than a
  local-first design would normally have.

## Alternatives considered

- **Firestore-only.** Rejected: breaks the offline study loop, which is the primary use case.
- **Local-only, no sync.** Rejected: she studies on both a phone and a laptop, and local-only without
  export is one cleared-browser away from total loss. Export alone is not enough for two devices.
- **CRDT / Automerge.** Rejected as over-engineering for one user with two devices; last-write-wins on
  a per-record basis is sufficient and far simpler to reason about.
