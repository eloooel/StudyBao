---
name: add-push-trigger
description: Add a push notification trigger, message-bank entry, or change notification behaviour. Use for anything touching service worker push handling, idle nudges, streak reminders, or quiet hours.
---

Read `docs/ai/add-push-trigger.md` and follow it exactly. Remember that nothing runs on the device
while the app is closed: every timed notification is pre-scheduled then cancelled, never
detected-then-sent. Keep quiet hours and cadence caps intact. Verify with `npm run build && npm run
preview` on a real device — never under `npm run dev`. The user's request: $ARGUMENTS
