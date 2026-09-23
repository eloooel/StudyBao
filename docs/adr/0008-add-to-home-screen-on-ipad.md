# ADR 0008 — Add to Home Screen on the iPad (not an app install)

- **Status:** Accepted
- **Date:** 2026-09
- **Supersedes:** [ADR 0007](0007-browser-only-no-install.md) (browser-only, no install). ADR 0007's
  analysis of _why_ storage is evicted remains the reference for the mechanism — and it corrected two
  of my own errors, which is worth preserving.
- **Related:** [ADR 0001](0001-local-first-with-indexeddb.md), [ADR 0005](0005-auth-google-single-user.md), [ADR 0006](0006-in-app-notifications-only.md)

## Context

ADR 0007 accepted "no installation, ever" and concluded that the iPad's data would therefore be
deleted by ITP whenever she went seven days of browser use without visiting. The mitigation was
"cloud sync on by default, plus export", and the residual risk was listed as the top risk in the
project.

That conclusion rested on a misunderstanding of the word _install_. **"No install" meant "I don't want
to make her download an app."** Add to Home Screen is not that:

- It is **two taps in the Share sheet** (Share → Add to Home Screen → Add).
- Nothing comes from an app store, nothing is downloaded, there is no signing, no update cycle, and
  no app-store surface to maintain.
- It creates a bookmark that opens without browser chrome, in its own container.

Critically, that container is exactly what WebKit exempts:

> Web applications added to the home screen are not part of Safari and thus have their own counter of
> days of use. Their days of use will match actual use of the web application which resets the timer.
> **We do not expect the first-party in such a web application to have its website data deleted.**

So the one action that eliminates the eviction risk is also the cheapest and least invasive one
available. With the misunderstanding resolved, the product owner has approved prompting her to do it.

## Decision

**Prompt Add to Home Screen on iPadOS, and treat the Home Screen Web App as her primary home for the
app. The Windows laptop stays a plain browser tab.**

1. **Prompt on iPadOS only**, when the app is _not_ already running standalone. Detect with
   `window.matchMedia('(display-mode: standalone)').matches || navigator.standalone`.
2. **The prompt comes before sign-in, with a visible "skip for now".** Order matters, and not for
   cosmetic reasons: the Home Screen Web App **keeps its own storage, separate from Safari's** ("not
   part of Safari", above). So if she signs in inside a Safari tab and _then_ adds it to the home
   screen, the new app starts empty and **she has to sign in a second time**. Installing first means
   one sign-in, in the container her data will actually live in.
3. **Tell her why, in one sentence** — _"two taps, and it stops your notes from being cleared"_ — with
   a screenshot of the Share sheet. No jargon, no "PWA", no "install".
4. **After she installs, tell her to use the Home Screen icon rather than the Safari tab.** They are
   separate storage containers, so using both creates two divergent local copies that sync has to
   merge. It works (last-write-wins), but it is needless confusion, and the Safari copy is the one
   that gets deleted.
5. **If she skips, nothing breaks.** Sign-in and sync proceed exactly as before, and the ADR 0007
   posture applies: sync is the safety net, export is the user-controlled backup, and the app must
   survive having its local database deleted at any time.
6. **On Windows, change nothing.** Chrome and Edge have no eviction timer, so a tab is durable. Do not
   suggest installing on the laptop; it adds a maintenance surface for no benefit.
7. **Reconcile the two containers with sync, not with hope.** Because the Home Screen app and the
   Safari tab are separate stores, sync is what makes them converge. The per-write sync and the
   automatic silent restore required by ADR 0007 remain mandatory.

## Consequences

**Good**

- **The project's top risk is essentially eliminated** for any session she runs from the Home Screen
  icon. Local data is durable, offline work is safe, and the seven-day timer no longer applies.
- **Zero distribution cost.** No app store, no download, no build tooling, no update mechanism, no
  review process. It remains a static site on Vercel.
- **Two taps is a smaller ask than signing in**, so it is not a meaningful addition to first-run
  friction — and it now arrives _before_ the Google button rather than after it.
- **It makes offline genuinely reliable.** ADR 0007 had to accept that a post-eviction cold start
  needed the network once. In the Home Screen app that failure mode is gone.
- Android and desktop are unaffected, and the same code path degrades to "no prompt" there.

**Bad / cost**

- **Eviction risk is reduced, not eliminated.** If she ignores or dismisses the prompt and keeps using
  the Safari tab, ADR 0007's analysis applies in full: seven days of browser use without a visit
  deletes everything, and sync is her only protection. The prompt can be skipped and cannot be forced.
- **The install prompt is platform-specific UI** — standalone detection plus an iPad-only screen with
  a screenshot. Small, but not free.
- **A second sign-in is possible** if she installs later from Settings rather than following the
  first-run prompt, because the containers are separate. The ordering in item 2 prevents the common
  case; it cannot prevent every path.
- **Two storage containers can coexist** if she uses both entry points, and only sync reconciles them.
  This makes the merge function load-bearing for a second reason beyond two devices.
- **Her data now lives in a container she cannot easily inspect or clear deliberately**, which is fine
  until she wants to reset — Export becomes the mechanism for that too.

## Alternatives considered

- **Never mention Add to Home Screen (ADR 0007's position).** Rejected once the terminology was
  clarified: it accepted a top-tier data-loss risk to avoid a two-tap action that carries no app-store
  or download implications.
- **Prompt after the first study session instead of before sign-in.** Rejected: it guarantees a second
  sign-in, because the Home Screen app starts with empty storage.
- **Prompt on every platform.** Rejected: pointless on Windows, where storage is durable and there is
  no eviction timer.
- **Make it a blocking gate — no use until installed.** Rejected: hostile for a surprise gift, and
  unnecessary, since sync covers the gap if she declines.
- **Use a native wrapper so installation is "proper".** Rejected: app-store surface and build tooling
  for zero functional gain over two taps.
