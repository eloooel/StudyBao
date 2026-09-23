# ADR 0007 — Browser-only: no installation, and what replaces it as a safety net

- **Status:** Accepted
- **Date:** 2026-09
- **Related:** [ADR 0001](0001-local-first-with-indexeddb.md) (local-first), [ADR 0005](0005-auth-google-single-user.md) (auth), [ADR 0006](0006-in-app-notifications-only.md) (no push)

## Context

Decision D5: **the app will be used purely in a browser tab. She will not install it to a home
screen, and we will not ask her to.**

That sounds like a trivial packaging choice. It is not, because installation is what exempts a site
from Safari's storage eviction, and eviction would delete her entire card history.

From WebKit's own ITP announcement:

> ITP has aligned the remaining script-writable storage forms with the existing client-side cookie
> restriction, **deleting all of a website's script-writable storage after seven days of Safari use
> without user interaction on the site**. These are the script-writable storage forms affected:
> **Indexed DB, LocalStorage, Media keys, SessionStorage, Service Worker registrations and cache.**

And on the exemption:

> Web applications added to the home screen are not part of Safari and thus have their own counter of
> days of use… **We do not expect the first-party in such a web application to have its website data
> deleted.**

Three details matter for how bad this is:

1. The counter is **seven days of Safari use without interacting with the site** — not seven calendar
   days. If she does not open Safari at all for a month, nothing is deleted. If she uses Safari daily
   for other things and does not open StudyBao for seven of those days, everything is.
2. **The service worker registration and its cache are deleted too.** So after eviction the app is not
   merely empty — it no longer works offline and needs the network to load at all.
3. **This is Safari-specific.** Chrome and other Chromium browsers have no 7-day timer; their
   best-effort storage is evicted only under storage pressure, which Chrome's own research finds
   happens very rarely for regularly-visited sites.

`navigator.storage.persist()` is the standards-track way to ask for protection. MDN notes that Safari
and Chromium both auto-decide based on interaction history and show no prompt — so it is worth
calling, but it is **not a guarantee**, and it must not be the only defence.

## Decision

**Accept browser-only usage, and treat cloud sync plus export — not installation — as the durability
mechanism.**

Concretely:

1. **Cloud sync (Workflow S) is promoted from convenience to backup.** It is no longer "nice for two
   devices"; it is how her data survives Safari eviction. This is the reason it must be reliable
   rather than merely present.
2. **Sync runs on open and after writes**, not only on an explicit user action. A session's history
   that exists only in IndexedDB is one eviction away from gone.
3. **First run has zero friction; the sync prompt comes after the first study session.** She is being
   given this as a surprise and did not ask for it, so a sign-in wall on first open is the most likely
   way to lose her before she sees any value. Local-only first, then: *"want to keep this safe and
   open it on your laptop too?"*
4. **JSON export/import is a first-class screen**, not a hidden setting, and the app nudges an export
   periodically. On Safari without installation it is the only user-controlled backup.
5. **Call `navigator.storage.persist()` once she has measurable engagement** (a few completed
   sessions), and surface the result. Do not promise the user anything based on it.
6. **One dismissible line in Settings** explains the iOS situation and offers export. It is
   information, not a nag — a study app that lectures her about browser storage is a defect.
7. **Keep the service worker.** Offline still matters (bus, airplane, no data), and it works in a
   browser tab. Just do not assume it survives.

## Consequences

**Good**

- No install friction, no `beforeinstallprompt` handling, no iOS install-screen screenshots, no
  app-store surface. Workflow H loses a deliverable.
- The app is reachable from any browser on any device by URL alone, which suits a surprise gift: she
  can be sent a link.
- Sync being genuinely load-bearing forces the merge function and the rules to be correct early,
  which is where the real risk was anyway.

**Bad / cost**

- **On iPhone, her data is not durable by default.** This is the accepted cost, and it is real: a
  week away from the app, with Safari used for other things, deletes everything locally. Sync is not
  optional in practice for an iOS user — it is the safety net. If she never signs in, an eviction
  loses her history.
- **Offline capability degrades over time.** After eviction the service worker and cache are gone, so
  the app needs the network to load once before it can work offline again. An offline study session
  that starts from a cold, evicted browser will fail.
- **A failed or disabled sync is now a data-loss risk rather than an inconvenience.** Any bug that
  silently stops sync is much more serious than it would be for an installed app. Sync failure must be
  visible in the UI, not swallowed.
- **Export becomes a feature she has to be told about**, which is user education we would rather not
  need.
- Store-and-forward thinking: because a session's data may exist on only one device briefly, the
  "fire-and-forget" sync of ADR 0001 needs a visible degradation state ("not synced since…") rather
  than silent failure.

## Alternatives considered

- **Ask her to install anyway.** Rejected by decision D5. Note the cost is asymmetric: on Android it
  barely matters, on iPhone it is the whole ballgame. **Confirm her device before relying on this
  analysis** — if she is on Android, most of this ADR is moot and the export/backup emphasis can drop.
- **Local-only, no sync, export as the only backup.** Rejected: relies on her remembering to export,
  and a manual backup that depends on a non-technical user's diligence will fail exactly once, at the
  worst time. Sync is automatic; export is the belt to its braces.
- **Ship as an installable-capable PWA and let her discover it.** Rejected as passive-aggressive: it
  means maintaining the install path while pretending we do not need it, and it leaves the iOS risk
  in place for anyone who does not discover it.
- **A native or wrapped app.** Rejected: app-store surface, build tooling, and it contradicts
  "free tools only".
- **`navigator.storage.persist()` as the primary defence.** Rejected as sole mechanism: the grant is
  automatic and undocumented, so it cannot be relied on or verified across her devices.
