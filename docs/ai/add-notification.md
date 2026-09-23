# Add or change an in-app notification

Add a notification trigger, a message-bank entry, or change nudge behaviour.

## 0. The rule everything follows from

**There is no backend and no push.** Notifications are generated inside the running page
([ADR 0006](../../docs/adr/0006-in-app-notifications-only.md)). Therefore:

- **Nothing fires when the app is closed or terminated.** Ever. Do not design a trigger that assumes
  otherwise.
- No service-worker `push` handler, no VAPID keys, no cron, no subscription, no permission prompt.
- On mobile, switching apps usually **suspends** the page, so a nudge does not fire while she is away —
  it fires when she comes back. Treat "welcome back" as the reliable mobile behaviour.
- Background tabs are throttled to roughly once per minute. Never tick a counter; derive state from
  `startedAt` and `Date.now()`, and recompute on `visibilitychange` → visible.

If a trigger genuinely requires reaching her with the app closed, that is a scope change — it needs an
ADR and a backend, and [ADR 0002](../../docs/adr/0002-push-architecture-and-scheduler.md) is where the
analysis lives. Do not smuggle it in.

## 1. Classify the trigger

| Trigger         | Mechanism                                                         | Can fire when                               |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| Idle nudge      | `now - lastInteractionAt > idleNudgeMin` during a Working session | page alive, foregrounded                    |
| Welcome back    | `visibilitychange` hidden → visible while a session is active     | on her return                               |
| Session end     | wall-clock timer reaches zero                                     | page alive; may be ~1 min late while hidden |
| Streak reminder | evaluated on app open                                             | she opens the app                           |

A new trigger must fit one of these shapes, or it needs an ADR first.

## 2. Respect the cadence caps

- Max **1 idle nudge per session**.
- Max **1 streak reminder per day**.
- **Quiet hours (22:00–06:30 local)**: show nothing. Client-side check, before rendering.
- Never two nudges within `idleNudgeMin` of each other.

## 3. Add the message-bank entry

Lives in `src/features/notifications/lib/messages.ts` **(pending Workflow G)** as pure data, tagged:

```ts
{ id: 'idle-03', tag: 'idle', body: 'Still there? Your notes miss you 🎀' }
```

- Warm and supportive. Never "You are inactive." Never guilt. Never streak-shaming.
- Short enough to read at a glance.
- No two messages with the same `tag` back-to-back — the picker is a **pure function, so unit-test
  that invariant**.
- Emoji is fine here and on streak moments, nowhere else.

## 4. Wire it as a pure function

Trigger evaluation must be testable without a browser:

```ts
shouldShowNudge({ trigger, session, lastInteractionAt, now, settings }) → boolean
```

The React layer subscribes to timers and visibility; the decision lives in `lib/` with tests. Do not
put cadence or quiet-hours logic inside a `useEffect`.

## 5. Test the behaviour, not the timer

- Inject `now`. Never assert against the real clock.
- Cover: exactly one idle nudge per session; no nudge outside a Working session; no nudge during quiet
  hours; welcome-back suppressed when the session already ended; a missed session-end cue fires on
  return rather than being lost.
- Do not test `setInterval` internals.

## 6. Check

```bash
npm run test:run
npm run build && npm run preview
```

Then in a real browser:

1. Start a session, wait out `idleNudgeMin` without touching anything → exactly one nudge.
2. Switch to another tab and back during a session → "welcome back" with correct remaining time.
3. Let a session end with the tab hidden → the cue fires on return, not never.
4. Temporarily set quiet hours to cover "now" → nothing shows.

If you cannot test on a real phone, say so plainly — mobile suspension is the behaviour most likely to
differ from desktop.

## Do not

- Do not add a service-worker `push` listener or a `Notification` permission request. The one
  permitted exception is the opt-in desktop OS notification created from the **live page**, which
  needs no push and no server.
- Do not use `setInterval` as a source of truth for elapsed time.
- Do not promise in the UI that a cue will arrive if the app is closed. The timer screen should say the
  tab must stay open.
