# Add a push trigger

Add a notification trigger, a message-bank entry, or a change to push behaviour. This is the
second-highest-risk area after data migration, because it is the one feature that reaches her when
the app is closed.

## 0. The rule that everything else follows from

**Nothing runs on the device while the app is closed.** There is no client-side scheduled-notification
API — Chrome's Notification Triggers (`showTrigger` / `TimestampTrigger`) was abandoned by the Chrome
team, and Periodic Background Sync is not available on iOS. Therefore every timed notification is:

1. **pre-scheduled** by the client at session start (`POST /schedule`), and
2. **cancelled** by the client the moment she interacts (`POST /cancel`), or
3. **fired by the backend cron** if she never came back — which is the desired outcome.

If your design requires the client to notice something and *then* notify, the design is wrong. See
`docs/adr/0002-push-architecture-and-scheduler.md`.

## 1. Classify the trigger

| Trigger | Mechanism | Cancel on interaction? |
| --------------- | -------------------------------------- | ---------------------- |
| Session end | pre-scheduled at `startedAt + plannedMs` | yes (early end/pause) |
| Idle nudge | pre-scheduled at `startedAt + idleNudgeMin` | yes (any interaction) |
| Welcome back | **in-app toast only** (`visibilitychange`) | n/a — no push |
| Streak reminder | backend cron, daily, at a fixed local hour | n/a |

A new trigger must fit one of these shapes, or it needs an ADR first.

## 2. Respect the cadence caps

- Max **1 idle nudge per session**.
- Max **1 streak reminder per day**.
- **No push at all between 22:00 and 06:30 local** (quiet hours). This is a nursing student's sleep;
  a study app that pings at 1 a.m. is a net negative. Quiet hours are enforced **server-side**, not
  just skipped client-side.
- Never send two pushes within `idleNudgeMin` of each other.

Compute the local hour from the subscription's stored timezone, not the server's clock.

## 3. Add the message bank entry

Message bank lives in `src/features/notifications/lib/messages.ts` **(pending Workflow A)** as a pure
data structure, tagged by trigger:

```ts
{ id: 'idle-03', tag: 'idle', body: 'Still there? Your notes miss you 🎀' }
```

Rules:

- Warm and supportive. Never "You are inactive." Never guilt. Never a streak-shaming message.
- Short enough to read on a lock screen without expanding.
- No two messages with the same `tag` back-to-back — the picker is a pure function, so **unit-test
  that invariant**.
- Emoji is fine here (and only here, plus streak moments).

## 4. Wire the payload

- Notification payload handling must be a **pure function** `payloadToNotificationOptions(payload)`
  so it can be unit-tested without a service worker. The `push` handler in `src/sw.ts` calls it and
  does nothing else.
- Include a `tag` so a newer notification replaces an older one from the same trigger instead of
  stacking.
- Include a deep link (`/timer`, `/flashcards/review`) and handle `notificationclick` by focusing an
  existing window if one exists, otherwise opening a new one.
- Never include study content in the notification body — lock screens are public. "Your notes miss
  you" is fine; a card front is not.

## 5. Handle the failure modes

- Push service returns **`404` / `410`** → delete the stored subscription. Do not retry.
- Permission revoked → clear the local "notifications on" flag and show the re-enable path in Settings.
- iOS: permission requires the PWA to be **installed to the Home Screen** and requested from a user
  gesture. If she is not installed, show the install explainer instead of a permission prompt.
- Subscription must be refreshed on `pushsubscriptionchange` if the browser rotates it.

## 6. Never

- Never hardcode the VAPID **private** key in client code. Only the public key is client-side.
- Never add a mutating backend endpoint without Firebase ID-token auth.
- Never send a push to "test" against her real device without asking. Test against a dev subscription.
- Never schedule an unbounded number of pending pushes; cancel before scheduling a new one for the
  same session.

## 7. Check

Service workers and push **do not work under `npm run dev`**:

```bash
npm run build && npm run preview
```

Then, on a real device over HTTPS:

1. Complete one Pomodoro and confirm the session-end push arrives with the app **fully closed**.
2. Start a session, interact after 2 minutes, and confirm the idle nudge was cancelled.
3. Confirm nothing arrives during quiet hours (temporarily set the window to cover "now" to test).
4. Confirm a deep link opens the right screen.

If you cannot test on a real iOS device, say so plainly — do not claim iOS works.
