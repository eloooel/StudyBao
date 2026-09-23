---
name: add-notification
description: Add or change an in-app notification trigger, message-bank entry, idle nudge, welcome-back cue, or quiet hours. Use for anything a notification module touches.
---

Read `docs/ai/add-notification.md` and follow it exactly. There is **no backend and no push**: nothing
fires while the app is closed, so every trigger must work inside the running page, and elapsed time is
always derived from wall clock rather than a ticking counter. Keep quiet hours and the cadence caps
intact. The user's request: $ARGUMENTS
