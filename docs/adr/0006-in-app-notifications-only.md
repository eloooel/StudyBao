# ADR 0006 — In-app notifications only: no backend, no push

- **Status:** Accepted
- **Date:** 2026-09
- **Supersedes:** [ADR 0002](0002-push-architecture-and-scheduler.md) (pre-schedule-then-cancel push with our own cron)

## Context

The original build guide's headline feature was *"true background push notifications — nudges arrive
even when the app is closed."* Delivering that requires a server that holds the push subscription and
fires on a schedule, because nothing runs on the device while the app is closed (see ADR 0002's
analysis, which remains correct).

The product owner reviewed that trade-off and decided against it: **notifications should fire only
while she is using the app** — on idleness, and on switching tabs and coming back. No notification
should arrive when the app is closed.

That decision removes the requirement for a backend entirely.

## Decision

**All notifications are generated client-side, in the running page. There is no push service, no
backend, no VAPID keypair, no cron, and no service-worker `push` handler.**

Four triggers, all of which require a live page:

| Trigger | Mechanism | Fires when |
| --- | --- | --- |
| **Idle nudge** | no interaction for `idleNudgeMin` during an active Working session | the page is alive and foregrounded |
| **Welcome back** | `visibilitychange` → hidden increments `tabHiddenCount`; on return, if a session is still active, show remaining time | she returns to the tab |
| **Session end** | wall-clock timer reaches zero → sound + visual + in-app banner | the page is alive (see caveat below) |
| **Streak reminder** | on app open, if no activity today and it is past her usual study hour | she opens the app |

Removed from the architecture as a direct result:

- the entire push backend (Workflow G0): subscription store, pending-push store, cron tick, endpoints
- VAPID keys and all server-side secrets
- service-worker `push` / `notificationclick` handling
- FCM, Cloud Functions, Blaze plan, or a Cloudflare Worker
- iOS Home Screen installation as a *notifications* prerequisite
- Firebase Auth when it existed only to authenticate the push backend

**Still retained:** the service worker itself, for offline caching (that is a PWA installability and
offline requirement, unrelated to notifications).

## Consequences

**Good**

- **Zero infrastructure.** The app is a static bundle. Hosting is trivial, there is nothing to keep
  alive, nothing to pay for, and no secret to leak or rotate.
- **Zero permissions.** In-app toasts need no notification permission at all — which removes the
  entire permission-prompt UX, the "notifications are off, here is how to re-enable" state, and the
  iOS requirement that permission be requested from a user gesture while installed.
- **Fewer failure modes.** Notification delivery, subscription expiry (`404`/`410`), permission
  revocation, and quiet-hours enforcement server-side all cease to exist. Quiet hours become a trivial
  client-side check.
- **Much less to build and test.** Workflow G0 disappears; Workflow G shrinks to a small UI module.

**Bad / cost — read this part**

1. **Nothing fires when the app is closed or terminated.** This is the accepted trade-off, stated
   plainly. If she closes the app mid-session, she gets no session-end cue.
2. **On mobile, switching apps usually suspends the page.** So the idle nudge does not fire while she
   is in another app; it fires when she comes back. The "welcome back" trigger is therefore the
   *reliable* mobile behaviour, and the idle nudge is the desktop/foreground behaviour. This should be
   reflected in what the UI promises.
3. **Background tabs are throttled** (roughly once per minute, and unthrottled only when visible). A
   session-end sound or banner may fire up to about a minute late while the tab is hidden. Mitigation:
   never tick a counter — derive everything from `startedAt` and `Date.now()`, and on
   `visibilitychange` → visible, immediately recompute and fire any cue that was missed.
4. **The most common real-world pattern is the one that suffers.** Start a 25-minute Pomodoro, switch
   to a PDF or notes app, and the break cue never arrives. This is the specific scenario worth telling
   her about in the UI: *"keep this tab open for the timer cue."*
5. **Partial recovery is available for the desktop case.** When the tab is open but behind another
   window, an OS-level notification created by the *live page* (`new Notification(...)`, no push, no
   server) is the only way to get her attention. Offered as an opt-in extra, not a default, because it
   reintroduces a permission prompt.

## Alternatives considered

- **Pre-schedule-then-cancel push with our own cron (ADR 0002).** Rejected by the product owner: too
  much infrastructure for the benefit.
- **Firebase Cloud Functions + FCM.** Rejected: requires Blaze and a card on file, and is more
  machinery than ADR 0002 was.
- **Client-side scheduled notifications (`showTrigger` / `TimestampTrigger`).** Does not exist —
  Chrome abandoned the API. See ADR 0002.
- **`setInterval` in a service worker to poll a timer.** A service worker is not kept alive by the
  browser and cannot run a long-lived timer; it is terminated when idle. Not viable.
- **Periodic Background Sync.** Not supported on iOS, and its minimum interval is far coarser than a
  Pomodoro session.
- **A local-only Android/iOS wrapper instead of a PWA**, which would allow real local notifications.
  Rejected: abandons the free, installable, cross-platform PWA and adds app-store surface.
