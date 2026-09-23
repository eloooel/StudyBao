# ADR 0002 — Push architecture: pre-schedule then cancel, with our own cron

- **Status:** ⚠️ **Superseded by [ADR 0006](0006-in-app-notifications-only.md)** — the product no longer
  delivers notifications while the app is closed, so the backend this ADR specifies is not built.
  Retained because the analysis of _why_ client-side scheduling is impossible remains correct and is
  the reason ADR 0006 scopes what it does.
- **Date:** 2026-02 (planning)
- **Supersedes:** the "Firebase Cloud Messaging + attention triggers" design in the original build guide

## Context

The original plan asked for notifications that arrive when the app is closed, driven by "attention
triggers": an idle nudge if she stops interacting mid-session, a session-end cue, and a daily streak
reminder.

Three facts break the original design:

1. **Nothing runs on the device while the app is closed.** There is no client that can notice idleness
   and fire a notification. The original design only worked while the tab was open — the case where
   the nudge is unnecessary.
2. **There is no client-side scheduled-notification API to fall back on.** Chrome's Notification
   Triggers (`showTrigger` / `TimestampTrigger`) is documented as no longer being pursued, and
   Periodic Background Sync is unavailable on iOS.
3. **FCM needs a sender.** Cloud Functions is the natural sender, and deploying Cloud Functions now
   requires the Blaze plan with a card on file — which conflicts with the "free tools only, no billing
   account" constraint.

## Decision

**Invert the trigger: pre-schedule then cancel, with a self-hosted scheduler.**

- At Pomodoro start, the client calls `POST /schedule` with the session's start time, planned
  duration, and idle threshold. The backend stores these as pending pushes.
- Any interaction, pause, or early end calls `POST /cancel` for that session.
- A **1-minute cron tick** on the backend (Cloudflare Workers Cron Triggers) fires whatever is due.
- **Plain Web Push with VAPID**, not FCM. Public key in the client, private key only as a deploy
  secret; `web-push` on Node or `@block65/webcrypto-web-push` on Workers.
- The **welcome-back** cue is an in-app toast only (`visibilitychange`) — it is a UX affordance, not a
  notification.
- The **streak reminder** is a backend cron that checks the synced activity record before sending.
- **Quiet hours (22:00–06:30 local, enforced server-side)** and hard cadence caps apply to everything.
- Every mutating endpoint requires a Firebase ID token.

## Consequences

**Good**

- Notifications work with the app fully closed, on both platforms.
- No card on file, no Cloud Functions, no FCM SDK, no second service worker dependency.
- The trigger vocabulary becomes small and testable: _schedule, cancel, tick_.
- Idle nudges are inherently rate-limited, because a nudge only exists if a session created it.

**Bad / cost**

- There is a backend to run, deploy, and keep alive. It is small (three endpoints and a tick) but it is
  a new operational surface, and it holds the only server-side secret.
- Pending pushes must be garbage-collected; abandoned sessions would otherwise leave stale schedules.
  The tick prunes anything past its window.
- iOS still requires the PWA to be installed to the Home Screen, and the subscription dies if she
  deletes the app (`404`/`410` → delete the stored subscription).
- Cancel-on-interaction is a race: if she interacts exactly as the tick fires, one stray nudge is
  possible. Accepted — the copy is gentle enough that a single stray nudge is not a failure.

## Alternatives considered

- **Detect idle client-side, then notify.** Impossible when closed. Rejected.
- **FCM + Cloud Functions + Cloud Scheduler.** Works, but requires Blaze and a card, and adds two
  services for one user. Rejected.
- **GitHub Actions cron as the tick.** Free and no card, but ~5-minute minimum granularity with
  routine delays of 5–20 minutes, and scheduled workflows are disabled after 60 days of repo
  inactivity. Kept as an acceptable fallback for the once-daily streak reminder only.
- **Vercel Cron on Hobby.** Once-per-day granularity with imprecise timing. Streak reminder only.
- **Local notifications only (no push).** Fails the core requirement: reaching her when the app is
  closed.
