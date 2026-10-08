# Prompt — the reveal-scoped first run, and the Home Screen prompt

Hand this to a fresh agent. It is **Workflow H, scoped to what the reveal needs** — not all of H.

Written at commit `98713e9`. Do not trust that hash — run `git log --oneline -6`.

---

You are picking up **StudyBao**, a study companion for one person's PNLE review. Workflows A–E are
committed and verified: the shell, flashcards with real SM-2, an ingest pipeline, a Pomodoro timer, and
a lesson tracker. Her exam is **Friday 26 February 2027**, and **she is being given the app within
weeks** — so this brief is on the critical path and nothing else in H is.

## Read these first

1. `CLAUDE.md` — constraints, and **the UX rules are the spec for this task**
2. `docs/adr/0008-add-to-home-screen-on-ipad.md` — why the prompt exists at all
3. `docs/HANDOFF.md` §8 — where this sits in the order
4. `src/router.tsx`, `src/features/dashboard/`, `src/features/flashcards/pages/flashcards.page.tsx`

## Why this is first, and what it is not

The prompt is not decoration. Safari's ITP deletes a site's storage after **seven days without
interaction**, and adding the app to the Home Screen is the **only** configuration WebKit exempts. So
the prompt is what stops her notes being cleared — the functional reason, not a growth tactic.

**This is not all of Workflow H.** Do not build the polish pass. There is a list of what is out of scope
at the end, and it is longer than the list of what is in scope.

## Part 1 — the Home Screen prompt

### The detection, and the trap that will bite you

**iPadOS 13 and later reports itself as `MacIntel`.** A user-agent check for "iPad" fails on every
modern iPad, which is exactly the device this is for. The check that works:

```ts
navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 // iPadOS
```

Requirements:

- **Show it on iPadOS in a Safari tab.** That is the case where installing matters.
- **Do not show it inside the Home Screen app.** Standalone is
  `matchMedia('(display-mode: standalone)').matches || navigator.standalone` — the second half is the
  iOS-specific one and is not covered by the media query on older iPadOS.
- **Do not show it on the Windows laptop**, and **do not show it on an iPhone.** She has a phone; the
  app is not for it, and a prompt there is noise.

**Make the decision a pure function in `lib/` and unit-test it** — something like
`shouldPromptInstall({ platform, maxTouchPoints, standalone, alreadySeen })`. You cannot open a browser,
so a pure function with stubbed inputs is the only way this gets tested at all. Put the four cases above
in as tests, including the iPhone one. Do not test it through `window`.

### Persistence

Add an **optional** field to `AppSettings` — `installPromptSeenAt?: number`. Optional fields need no
Dexie version bump and no migration; `AppSettings` already carries `examDate?` and `seededAt?` on that
basis, and the doc comment there shows the convention.

Show it **once**. If she skips, do not show it again on the next open — `CLAUDE.md` says "never a
repeated wall". But she must be able to find it later, so **Settings gets a quiet, permanent entry
point** ("Keep your notes safe" or similar) that opens the same explanation. That is the honest
compromise between protecting her data and not nagging.

### The copy

Follow `CLAUDE.md` and `BUILD_GUIDE.md` §5. The framing is **data safety**:

- Lead with the guideline's own words: _"two taps, and it stops your notes from being cleared."_
- Then say why, in one sentence she can act on: Safari clears a site's saved data after a week of not
  visiting; the Home Screen icon is the one exception.
- The steps: **Share → Add to Home Screen → Add.**
- A **visible skip**. Not a disguised one.
- **Never the word "install".**

### The screenshot

ADR 0008 asks for a screenshot of the Share sheet. **You cannot take one** — it needs a real iPad.
Build the layout with a clearly-labelled placeholder and say so in your report; a human drops the real
image in before the reveal. Adding one PNG will enter the service worker precache (the `globPatterns`
allowlist includes `png`), so **report the precache delta** — `node scripts/report-precache.mjs`.

## Part 2 — a first run with no sign-in

Workflow S, which owns the Google sign-in, is **not built**. So the first run is **prompt → straight
into the app.** Verify there is nothing auth-shaped in the way: no sign-in button, no account form, and
no dead end.

**`CLAUDE.md`'s UX rules describe the post-S flow** ("one tap and nothing else: a single Google sign-in
…"). They are now inaccurate for the interim. **Fix that in the same change** — say plainly that sign-in
arrives with S, and that until then the first run is the prompt and then the app.

## Part 3 — the dead end you must fix

The index route renders the dashboard, and the dashboard is **Workflow F, which is unbuilt**. Its
current no-history state says _"Your review queue will show up here."_ It is deliberately honest and
refuses to invent numbers — that part is right, and keep it.

But **it is a dead end on the one screen she sees first.** She is one tap from five seeded PRC decks and
an "Add from your notes" button, and nothing on that screen says so. `CLAUDE.md` is explicit: first run
goes _"straight into reviewing pre-seeded cards … no empty state that asks her to create something
first."_

**Give that state a primary action** that leads to the seeded decks — one button, one route, the same
`EmptyState` pattern already in use. Do **not** redirect the index route on first run: that needs a new
first-run flag and puts a routing concern in a component, and this fixes the dead end on every fresh
install instead of only the first.

## Out of scope — do not build these

- **Workflow S**: auth, Firestore, sync, the sign-in screen.
- **Workflow F**: any real dashboard aggregate, streak, or progress chart. The placeholder's honesty is
  the point.
- **Workflow G**: nudges, quiet hours, the notification message bank.
- **Export/import**: that is a separate brief, running in parallel.
- **The full polish pass**: empty states everywhere, the microcopy sweep, the complete click-through.

If you find something outside this list, **write it down rather than fixing it.**

## Verify

```bash
npm install --cache .npm-cache        # workspace-local cache; the global one fails with EPERM
npm run typecheck && npm run lint:check && npx prettier --check .
npm run test:coverage
npm run build && npm run preview
node scripts/report-precache.mjs
```

All must pass. **When you add a test, reintroduce the bug and confirm it goes red** — this repository has
shipped tests that passed under both the fix and the regression, and the detection logic here is exactly
the kind of thing that reads as covered while proving nothing.

## What you cannot verify, and must hand back

Say this plainly rather than implying otherwise. **No agent in this project has a browser or a device:**

- whether the prompt actually appears on an iPad in a Safari tab;
- whether the iPadOS detection is right **on the device** — the `MacIntel` check is the fix for a real
  trap, but you are asserting it, not observing it;
- whether it correctly does **not** appear inside the Home Screen app;
- whether the Share sheet in your copy matches the real one;
- on iOS, where a download actually lands. (That last one matters for the other brief, not this one.)

## Before you write code

Reply with: **(1)** your plan, **(2)** the exact detection predicate and where it lives, **(3)** your
copy for the prompt and for the Settings entry point, **(4)** what you would do about the screenshot, and
**(5)** anything in ADR 0008 or `CLAUDE.md`'s UX rules you think is wrong or unbuildable.

Then **stop and wait for a go-ahead.**
