# ADR 0007 — Browser-only, no install: what that means for data durability

- **Status:** ⚠️ **Superseded by [ADR 0008](0008-add-to-home-screen-on-ipad.md)** — "no install" turned
  out to mean "no app-store download", and Add to Home Screen is two taps in a Share sheet, which
  WebKit exempts. Retained because its analysis of the eviction mechanism is the reference for _why_
  this mattered, and because it corrected two of my own errors (the browser-switch workaround and
  `navigator.storage.persist()`).
- **Date:** 2026-09
- **Related:** [ADR 0001](0001-local-first-with-indexeddb.md) (local-first), [ADR 0005](0005-auth-google-single-user.md) (auth), [ADR 0006](0006-in-app-notifications-only.md) (no push)

## Revision note

The first version of this ADR accepted browser-only usage and proposed two mitigations: tell her to
use a non-Safari browser, and call `navigator.storage.persist()`. **Both were wrong**, and further
research corrected them:

1. **"Use a different browser" does not work on iPad.** Every browser on iOS/iPadOS is required to use
   WebKit, and ITP is a WebKit feature — so Chrome, Firefox, Edge, and `WKWebView` on iPad all apply
   the same 7-day deletion. The advice would have given false safety on her primary risk device.
2. **`navigator.storage.persist()` does not protect against ITP.** It resolves successfully and changes
   nothing. WebKit explicitly rejected a 2025 pull request that would have exempted persistent origins,
   on the grounds that "`StorageManager.persist()` should not override ITP policy" (WebKit PR #48369).

The remaining facts, and the resulting plan, are below.

## Context

Decision D5: **the app will be used in a browser tab. She will not install it.**

Her devices: **a Windows laptop and an iPad.** That distinction is the whole story.

### The mechanism

From WebKit's ITP announcement and the tracking-prevention documentation:

> ITP has aligned the remaining script-writable storage forms with the existing client-side cookie
> restriction, **deleting all of a website's script-writable storage after seven days of Safari use
> without user interaction on the site**. These are the script-writable storage forms affected:
> **Indexed DB, LocalStorage, Media keys, SessionStorage, Service Worker registrations and cache.**

Precision that matters:

1. The counter is **seven days of browser use without interacting with the site** — not seven calendar
   days. Not opening the browser at all does not advance it.
2. **The service worker and its cache go too**, so after deletion the app is not merely empty: it no
   longer works offline and needs the network to load.
3. **It is not Safari-specific.** ITP is implemented in WebKit, so it applies equally to Chrome,
   Firefox, and Edge on iOS/iPadOS, and to any `WKWebView`. On iPad there is no browser to switch to.
4. **`navigator.storage.persist()` does not exempt an origin.** See the revision note above.
5. **A Home Screen Web App on iOS/iPadOS is exempt.** WebKit: _"Web applications added to the home
   screen are not part of Safari and thus have their own counter of days of use … we do not expect the
   first-party in such a web application to have its website data deleted."_ This is the only reliable
   exemption, and it is the mitigation D5 declines.
6. **Chrome and Edge on Windows have no such timer.** Their best-effort storage is evicted only under
   storage pressure, which Chrome's own research finds is very rare for a regularly visited site. **Her
   laptop is safe. Her iPad is not.**

This is not theoretical: 1Password, Dashlane, Simplenote, and Element have all reported real data-loss
incidents from this behaviour (WebKit bug 209563).

## Decision

**Accept browser-only usage. Make cloud sync mandatory-in-practice and design the app to survive having
its local database deleted at any time.**

Concretely:

1. **Cloud sync is ON by default** (decision D12, revised). It is not a convenience feature; it is the
   only thing standing between the iPad and total data loss. First open includes a single one-tap
   Google sign-in, framed as _"sign in so your notes are safe."_
2. **Sync runs on open and immediately after every write**, not on a timer and not on an explicit
   action.
3. **Recovery must be automatic, silent, and non-alarming.** If local storage is empty and remote data
   exists, the app restores it without asking for confirmation and without presenting it as a problem.
   A post-eviction open should feel like a normal open.
4. **Assume she is signed out after an eviction.** ITP deletes the storage that Firebase Auth persists
   its session in, so a wiped iPad also loses the sign-in. The app must detect "no local data, but
   remote data exists" and lead with _"your notes are safe — tap to sign in and get them back"_, never
   with an empty-state onboarding flow that implies her work is gone.
5. **Export/import stays a first-class screen.** It is the only backup that does not depend on Google,
   the network, or a sync bug.
6. **A sync failure must be VISIBLE** ("not saved since…"). With no install, a silently broken sync is
   a data-loss bug.
7. **No install prompt.** Settings carries one dismissible line explaining the iPad situation and
   linking to Export. If she ever asks how to make it permanent, the answer is Share → **Add to Home
   Screen** in Safari — two taps, not an app download. Offer it only on request.
8. **Keep the service worker** for offline use in a tab, knowing it is deleted along with everything
   else.

## Consequences

**Good**

- No install friction, no `beforeinstallprompt`, no iOS install screen, no app-store surface. Workflow
  H loses a deliverable.
- Reachable by URL alone, which suits a surprise gift: she can be sent a link.
- Sync being load-bearing forces the merge function and the Firestore rules to be right early — which
  is where the real risk was anyway.
- **The laptop is completely unaffected.** Offline work there is durable.

**Bad / cost**

- **On iPad her data is not durable, and there is no browser workaround.** This is the accepted cost. A
  week away from the app, with the iPad browser used for other things, deletes everything locally. If
  she is offline during that period, whatever she did since the last successful sync is gone for good.
- **She will occasionally be signed out** and see a sign-in screen instead of her decks. Handled by
  item 4 above, but it is a recurring rough edge that no amount of polish removes.
- **A failed sync is now a data-loss event**, so sync health has to be surfaced and tested. This is
  more UI surface than a local-only app would need.
- **Export is user education we would rather not need**, and it depends on a non-technical user's
  diligence, which will fail exactly once at the worst moment.
- **Reinstalling the app is not the fix she has** — the fix is Add to Home Screen, which D5 rules out.

## Alternatives considered

- **Tell her to use a browser other than Safari.** **Rejected — it does not work on iPad.** All iOS and
  iPadOS browsers are WebKit, and ITP is a WebKit feature. This was the first version of this plan and
  it was wrong.
- **Rely on `navigator.storage.persist()`.** **Rejected.** It resolves successfully and protects
  nothing against ITP; WebKit declined to change that.
- **Ask her to Add to Home Screen from Safari.** Rejected by D5, but it is worth being precise about
  what was rejected: this is a two-tap action in the Share sheet, not an app download or an App Store
  install. It is the only mechanism that makes local data durable on iPad. If the recurring sign-out
  and the residual offline-loss window prove annoying in practice, this is the lever to revisit — and
  it costs nothing to reverse.
- **Warn her to open the app at least once a week.** Rejected: a backup strategy that depends on
  remembering is not a strategy, and it silently fails on the busiest week — which is the week before
  the exam.
- **Local-only with export as the only backup.** Rejected: it makes a non-technical user's diligence
  the sole protection for months of study history.
- **A native or wrapped app.** Rejected: app-store surface, build tooling, contradicts "free tools
  only".
