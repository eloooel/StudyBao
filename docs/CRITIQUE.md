# Critique — original PNLE Study Helper build guide

Reviewed the build guide line by line, verified every technical claim that could be verified, and
traced the workflow graph for missing dependencies. **Verdict: the product thinking is good, the
phase ordering is mostly right, and the technical layer has six things that would have burned days
or quietly broken the core promise ("true background push").** All six are fixable and are already
fixed in [`BUILD_GUIDE.md`](BUILD_GUIDE.md).

Legend: 🔴 blocking · 🟠 significant · 🟡 worth fixing · ✅ verified correct

> **Status update — September 2026.** This is a dated review of the original guide and is left intact
> so the reasoning stays auditable. Two things have since changed, both noted inline where they
> appear:
>
> 1. **Closed-app push was dropped by product decision.** The push backend (old "Workflow G0") is not
>    built; notifications are in-app only. That resolves A1 and makes B2, B3, and most of B4 moot. See
>    [ADR 0006](adr/0006-in-app-notifications-only.md).
> 2. **The exam scope was verified against the official PRC program**, replacing a secondary-source
>    guess. See [`reference/pnle-scope.md`](reference/pnle-scope.md).
>
> [`BUILD_GUIDE.md`](BUILD_GUIDE.md) is the current plan; this file is the reasoning behind it.

---

## A. Blocking flaws

### 🔴 A1. The attention triggers cannot work the way they are described

The guide says:

> **Idle detection:** if no interaction for X minutes during an active Working session, fire an idle nudge.

While the app is closed, **no JavaScript is running**. There is no client to notice idleness and no
client to fire a notification. The feature as written only works while the tab is open — which is
exactly the case where the user is *not* away and the nudge is useless.

The same problem hits the daily streak reminder ("scheduled push if no session logged yet by a
configurable time of day") — that requires a server that can look up whether activity happened.

**The inversion that works:** *pre-schedule, then cancel.* At Pomodoro start, the client asks the
backend to queue a push at `startedAt + X` minutes. Any interaction cancels it. If she is genuinely
gone, the push fires from the backend — which is the behaviour you wanted. Same for session end.

**Consequence:** Workflow G needs a backend with a subscription store, a pending-push store, and a
1-minute tick. The guide never mentions this component. Added as **Workflow G0**.

> **Resolution (2026-09).** Rather than build G0, the product owner removed the requirement: there are
> no notifications while the app is closed, so delivery is in-app only and the backend disappears. The
> analysis above still stands — it is *why* in-app-only was chosen, and it is why the app can no longer
> promise a cue when she closes it. See [ADR 0006](adr/0006-in-app-notifications-only.md); the
> pre-schedule design is preserved in [ADR 0002](adr/0002-push-architecture-and-scheduler.md) as the
> path back.

Also: there is no client-side fallback. Chrome's Notification Triggers API (`showTrigger` /
`TimestampTrigger`) — the one API that would have made local scheduling possible — is documented as
*"development … is no longer pursued"* by the Chrome team. Do not design around it.

Source: [Chrome for Developers — Notification Triggers](https://developer.chrome.com/docs/web-platform/notification-triggers)

### 🔴 A2. Cloud sync without login is self-contradictory

Decision #1 recommends Firestore sync. Decision #6 recommends "simple single-user app (no login)".
These cannot both hold. Firestore security rules need an authenticated identity to scope data to.
The only ways to ship sync with no auth are:

- open rules → her notes and review history are world-readable and world-writable; or
- a shared secret embedded in the client → not a secret, and it fails the moment anyone views source.

**Fix:** Firebase Auth with the Google provider, allow-listed to her one email address. One tap, works
on both devices, and rules become `request.auth.token.email == '<her email>'`. This is a five-minute
decision that removes an entire class of security problem later.

### 🔴 A3. Local-only + no backup = data loss by design

If storage is local (IndexedDB) and there is no export, one cleared browser, one iOS storage
eviction, or one "Clear website data" tap destroys every card, every SM-2 interval, and her streak.
Safari applies a **7-day cap on script-writable storage** unless the site is added to the Home
Screen, which exempts it. So on iPhone the data is fragile unless she installs the PWA.

**Fix:** JSON export/import in Settings, *and* word the iOS install screen as a data-safety
requirement, not just a notifications requirement.

Source: [WebKit bug 209501 — 7-Day Cap on All Script-Writable Storage](https://bugs.webkit.org/show_bug.cgi?id=209501)

### 🔴 A4. `Card` has no history, so Workflow F's headline feature is unbuildable

Workflow F promises *"weak topics auto-flagged from grading history"* and *"cards with low ease
factor or frequent 'Again' grades."* But the model in Workflow B is:

```
Card { id, deckId, front, back, easeFactor, interval, repetitions, nextReview }
```

There is no per-review record. `easeFactor` is a smoothed scalar; it cannot tell you *how often* she
graded Again, and an "Again" early in a card's life is largely erased by later successes. Any
dashboard built on this will show a number that is subtly wrong and that she will not trust.

**Fix:** add `ReviewLog { id, cardId, deckId, reviewedAt, grade, msSpent }` and compute weak topics
from it. This also unlocks time-spent analytics and any future switch to FSRS.

### 🔴 A5. The model has no `updatedAt` / `deletedAt`, so two-device sync will corrupt data

Firestore sync needs a conflict rule and tombstones. With neither, a card deleted on the phone gets
resurrected by the laptop on next sync, and two edits race with no way to pick a winner. Both fields
are free to add now and painful to retrofit. (Also: `Deck`/`Card` are missing `updatedAt`, and there
is no schema-version/migration story for Dexie, which matters once data exists on two devices.)

### 🔴 A6. `nextReview <= today` cannot express learning steps

Date-only scheduling means the minimum interval is one day. That means a brand-new card graded
"Again" vanishes for 24 hours — the worst possible behaviour for a cram-style app, and the reason
most home-grown SR apps feel bad. ANSI-standard behaviour is sub-day steps (1 min → 10 min) before
graduation to 1 day → 6 days.

**Fix:** store `nextReview` as **epoch milliseconds**, query `nextReview <= Date.now()`, and model
`learningStep`. Everything about "due today" then becomes an explicit local-timezone computation
instead of a string comparison that breaks at midnight and across timezones.

---

## B. Significant issues

### 🟠 B1. Firebase Cloud Functions requires Blaze — the free-tier claim is not quite true

"Firebase Cloud Messaging (free)" is true of FCM itself, but FCM needs a *sender*, and the
scheduled-sender is Cloud Functions. Deploying Cloud Functions requires the **Blaze (pay-as-you-go)
plan with a card on file**. At this scale the bill is genuinely $0, but "free tools only, no billing
account" quietly becomes "free but with a credit card on file", and budget alerts do not hard-stop
spending.

**Fix:** use **Cloudflare Workers Cron Triggers** (1-minute granularity, free plan, no card) as the
tick, or accept Blaze with a $0 budget alert. Comparison table in `BUILD_GUIDE.md` §3.

Verified against Cloudflare's own plan-limits table: Workers **Free** allows **5 cron triggers per
account** and **10 ms CPU per Cron Trigger invocation** (Paid: 250 triggers, 30 s CPU). 10 ms is
ample for signing and sending one or two pushes — WebCrypto runs natively and `fetch()` wait time is
not counted as CPU — but it rules out any batch fan-out, which is irrelevant for a single user. Note
that at least one widely-circulated community "skills" document claims Cron Triggers require the
$5/month Workers Paid plan; Cloudflare's documentation does not say that.

Source: [Cloudflare Workers — Limits](https://developers.cloudflare.com/workers/platform/limits/)

### 🟠 B2. FCM is an unnecessary layer

"Web Push API + Service Worker + Firebase Cloud Messaging" — FCM adds an SDK, a second service, and a
service-worker dependency, and buys nothing for a single user. **Plain Web Push with VAPID** is
simpler: a public key in the client, a private key in one server secret, and `web-push` (Node) or
`@block65/webcrypto-web-push` (Workers) on the send side. Fewer moving parts on the one feature that
is hardest to debug.

> **Moot (2026-09).** [ADR 0006](adr/0006-in-app-notifications-only.md) dropped server-sent
> notifications, so neither FCM nor VAPID is used. Kept as a record of why the original stack was
> heavier than it needed to be.

### 🟠 B3. `vite-plugin-pwa`'s default strategy is the wrong one here

The guide says "configure as installable PWA (manifest.json, icons, service worker registration)".
The default `generateSW` strategy generates a Workbox service worker you do not control — you cannot
add `push` / `notificationclick` handlers to it cleanly. Use **`injectManifest`** with a custom
service worker from the start; retrofitting it later means rewriting the SW and re-testing the whole
offline path.

> **Reversed (2026-09).** With no push handlers to add, `generateSW` is now sufficient and Workflow A
> specifies it — one fewer custom file to maintain. This finding applied only while push was in scope.

### 🟠 B4. iOS specifics that decide whether push works at all

> **Mostly moot (2026-09).** With in-app notifications only, the Web Push and permission items below no
> longer apply. The **storage-eviction item still does** and is now the single reason to ask her to
> install the app: Safari's 7-day script-writable-storage cap exempts installed web apps. The
> `beforeinstallprompt` item also still applies, because the install screen must be hand-written.

- Requires **iOS 16.4+** *and* the app added to the Home Screen. Push from a Safari tab does not work.
- The manifest needs `"display": "standalone"` (or `fullscreen`); ship `apple-mobile-web-app-capable`
  and `apple-touch-icon` too, because iOS ignores parts of the manifest.
- **iOS never fires `beforeinstallprompt`** — there is no install button. Without a hand-written
  "Share → Add to Home Screen" screen with screenshots, push will never reach her, and she will have
  no idea why. Workflow H says "confirm PWA installability on iOS 16.4+", which understates this to
  the point of missing it.
- Deleting the home-screen app invalidates the subscription; the push service then returns
  `404`/`410`. Handle it by deleting the stored subscription instead of retrying forever.
- Permission must be requested from a user gesture while installed. The guide's "after she's used the
  timer once" is correct — keep it.

Source: [Apple — Sending web push notifications in web apps and browsers](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)

### 🟠 B5. The Pomodoro timer will drift and lie

The guide's "timer state machine" implies a tick-decremented counter. Background tabs are throttled,
and iOS suspends them outright, so a `setInterval` counter accumulates error and then reports a
remaining time that is simply false. Store `startedAt` and derive remaining time from wall clock on
every render. Related: audio cues need a user-gesture unlock, or the very first transition is silent —
the exact one that matters.

### 🟠 B6. OCR is over-weighted and the cheapest high-accuracy path is missing

The guide's flashcard pipeline is "uploaded photos/scans → OCR". Reality: Tesseract.js is trained on
printed text; handwriting is poor and tabular schedules are worse. Also, the default Tesseract.js
build fetches WASM core + `eng.traineddata` from a CDN — 20–30 MB, and it breaks offline use unless
self-hosted.

Meanwhile the highest-accuracy ingest paths cost nothing and are absent:

- **paste text** — she almost certainly has digital notes
- **PDF text extraction via `pdfjs-dist`** — zero OCR error for digital PDFs
- **her phone's own text recognition** (iOS Live Text / Google Lens) — free, and better than
  Tesseract on handwriting; the app should tell her to use it and paste the result

**Fix:** make paste/PDF the default ingest tabs and photo OCR the third option, labelled honestly.

### 🟠 B7. The parser rules will drown her in false positives

- Colons appear in ordinary prose. `"Diagnosis: acute pain"` is a definition; `"Note: she reported:
  pain"` is not.
- Hyphens appear inside words. `self-esteem`, `bottle-feeding`, `post-operative` will all be split as
  `Term - Definition`.
- The guide offers no guard on the left-hand side. Require a short (< ~60 chars), non-sentence,
  non-period-terminated left side, and strip OCR noise before parsing.
- The "Needs Review" queue is the right idea. It just needs a sane precision target (aim for
  precision over recall) or it becomes a second job.

### 🟠 B8. SM-2 details that implementations routinely get wrong

- The 4-button UI (Again/Hard/Good/Easy) must be mapped explicitly to SM-2 quality 0/3/4/5 — the
  guide never says how.
- The ease-factor update must be applied on **every** grade (including failures) and **clamped to a
  floor of 1.3**. Missing the floor lets a struggling card's intervals collapse to zero.
- On `q < 3`, repetitions reset to 0 — but the card should enter learning steps, not jump to a 1-day
  interval.
- `repetitions >= 3` as the "mastered" threshold is a proxy that Easy-grading games. The standard
  "mature card" boundary is `interval >= 21 days`.

### 🟠 B9. Streak day boundary will rob her of streaks

A midnight boundary means studying at 12:30 a.m. loses the previous day's streak at the exact moment
she is working hardest. Standard practice (Anki, Duolingo) is a rollover at ~4 a.m. local.

### 🟠 B10. No quiet hours

An always-on push system for a nursing student will fire during sleep unless it is explicitly
forbidden. Quiet hours (default 22:00–06:30 local) belongs in the notification spec, not in the
polish pass.

---

## C. Design system findings

The palette is lovely and **mostly unreadable as text**. Contrast ratios below were computed from the
WCAG 2.1 relative-luminance formula (not estimated) — re-run the same check if the palette changes:

| Pair | Ratio | Required | Result |
| --- | --- | --- | --- |
| white on `#F5A9B8` (primary button) | **1.87:1** | 4.5:1 | ✘ fails even 3:1 |
| `#4A2E35` on `#F5A9B8` | **6.49:1** | 4.5:1 | ✔ |
| white on `#E88BA0` (hover) | 2.43:1 | 4.5:1 | ✘ |
| `#4A2E35` on `#E88BA0` | 4.98:1 | 4.5:1 | ✔ |
| white on `#F26D85` (accent 1) | 2.88:1 | 4.5:1 | ✘ for text; OK for icons/large |
| white on `#B2556B` (proposed strong variant) | 4.77:1 | 4.5:1 | ✔ |
| `#9C7C82` (text secondary) on `#FFF9FA` | **3.59:1** | 4.5:1 | ✘ for body text |
| `#7D5B63` on `#FFF9FA` (proposed) | 5.69:1 | 4.5:1 | ✔ |
| `#B7D7B0` (sage) as text on white | 1.57:1 | 4.5:1 | ✘ fill only |
| `#D9A7B0` (mauve) as text on white | 2.08:1 | 4.5:1 | ✘ fill only |
| `#4A2E35` on `#FFF9FA` | 11.64:1 | 4.5:1 | ✔ |
| `#4A2E35` **on** `#B7D7B0` | 7.71:1 | 4.5:1 | ✔ — the fill+plum fix works |
| `#4A2E35` **on** `#D9A7B0` | 5.83:1 | 4.5:1 | ✔ |

The three fixes that matter:

1. **Plum text on rose buttons, not white.** 6.49:1, and it reads as a more intentional coquette look
   than washed-out white-on-pastel. Reserve `#B2556B` (≈4.77:1 with white) for destructive actions.
2. **Darken text-secondary to `#7D5B63`.** The original `#9C7C82` is used for exactly the small labels
   and helper text that need the most contrast.
3. **Sage and mauve are fills, never foregrounds.** The guide's stated intent — "keeps 'mastered'
   readable, not just another pink" — is right; it just needs sage as a badge *background* with plum
   text on top.

Also:

- 🟡 **No night mode.** A `#FFF9FA` full-screen at 2 a.m. is physically unpleasant. Add a dim plum
  variant.
- 🟡 **Playfair Display is a poor body-adjacent choice.** It is a high-contrast display serif; at
  small sizes on a phone it fights dense nursing text. Quicksand (rounded, friendly, self-hostable)
  matches the stated "soft rounded" intent better.
- 🟡 **Self-host the fonts.** A Google Fonts `<link>` is a network dependency, breaks offline, and
  leaks a request per load. `@fontsource/*` is free and offline-safe.
- 🟡 **Avoid weight 300 for body copy.** Ultra-light rounded type is the classic coquette readability
  trap.

---

## D. Workflow graph verification

The original graph:

```
A → B → C
A → D ─┐
A → E ─┴→ F
          → G → H
```

What is actually true:

- ✅ B, D, E are genuinely parallel after A. Good call.
- ✅ C after B is correct.
- 🔴 **F does not only need B/D/E — it needs a history model that B does not specify.** See A4.
- 🔴 **G needs an entire backend (G0) that is not in the graph.** See A1. *(Resolved 2026-09 by
  dropping closed-app delivery rather than building G0.)*
- 🔴 **G also needs synced activity data** to answer "did she study today?" — so G depends on the sync
  half of decision #1, not just on D.
- 🔴 **There is no test harness anywhere in the plan.** SM-2 and the parser are pure functions with
  precise, verifiable behaviour and they are the two things most likely to be silently wrong. Added
  A0.
- 🟠 **H is not the only place with empty states / install UX.** The iOS install screen is not polish,
  it is load-bearing for both push and data durability. Moved into H as a first-class deliverable and
  flagged in A (manifest/meta tags).
- 🟠 `Lesson` model needs `notes` and `updatedAt`; `Session` needs `startedAt`/`endedAt`/`completed`/
  `tabHiddenCount` to support the post-session stat the guide promises.

Corrected graph is in `BUILD_GUIDE.md` §4.

---

## E. What is genuinely good (keep as-is)

- ✅ **No LLM in the product.** Client-side OCR + deterministic parsing keeps runtime cost at zero,
  keeps notes private, and works offline. It is also the right call for a study tool where a
  hallucinated flashcard is worse than no flashcard. The *dev-time* AI question is separate and is
  now governed — see [`ai/README.md`](ai/README.md).
- ✅ **"Never silently dropped" for unparsed text.** This is the single best design decision in the
  document. Keep it everywhere.
- ✅ **Mandatory confirm/edit pass after OCR.** Correct, and now extended to all three ingest paths.
- ✅ **Requesting notification permission after the first timer use, not on first load.** Exactly
  right; this is what keeps the permission grant rate from being zero.
- ✅ **Conservative notification cadence.** Right instinct; now enforced with caps and quiet hours.
- ✅ **Framing the tab-switch stat gently.** Right instinct — the *name* "tab-switch counter" was the
  only part working against it.
- ✅ **Coquette voice in microcopy, not only in colour.** Correct and rare.
- ✅ **SM-2 over a library, with the algorithm documented.** Reasonable; SM-2's failure modes are
  known and the field is small.
- ✅ **Pre-seeding PNLE content areas.** Right — a blank subject list is where study apps die.
- ✅ **Subject-level sage accent to keep "mastered" distinguishable.** The intent is right; only the
  contrast math was wrong.

---

## F. Scope check — free-tier reality

| Claim | Verified reality |
| --- | --- |
| Firebase Hosting free | ✅ Spark: 10 GB storage, 360 MB/day transfer. Fine for one user. |
| Firestore free | ✅ Spark: 1 GiB, 50k reads / 20k writes / 20k deletes per day. Orders of magnitude more than one user needs. Watch out: a query returning N docs costs N reads, so don't re-read all cards on every dashboard render — cache locally. |
| Firebase Auth free | ✅ Fine at this scale. |
| Cloud Functions free | 🟠 Requires Blaze + card on file. See B1. |
| FCM free | ✅ Free, but not needed. See B2. |
| Tesseract.js free | ✅ Free and client-side; the CDN asset weight and offline behaviour are the real costs. See B6. |
| Vercel/Firebase Hosting HTTPS | ✅ Both fine. |
| GitHub Actions cron as scheduler | 🟠 ~5 min minimum, routinely delayed, disabled after 60 days of repo inactivity. Fine for a daily reminder, not for idle nudges. |

Net: the free-tier plan holds, with one substitution (a cron host other than Cloud Functions) and one
honest caveat (a card on file if Firebase Functions is kept).

---

## G. Recommended sequencing

1. Close decisions #1–#10 (all have defaults in `BUILD_GUIDE.md` §2) — **do not start A before #3 and
   #6 are answered**, because they change the service worker, the auth flow, and the rules file.
2. A0 + A. Get an installed, offline, contrast-correct shell on her actual phone before writing
   features. Install problems found on day 1 cost an hour; found on day 20 they cost a rewrite.
3. B and D in parallel (D is the fastest win and the thing she will use on day one).
4. C and E in parallel.
5. F, then G. *(G0 was removed by ADR 0006 — G now depends on D alone.)*
6. H, then hand it over with the install instructions.

---

## H. KadaKareer AI-governance audit — what was found and what was ported

You asked me to study `D:\repos\KadaKareer\app`, `D:\repos\KadaKareer\backend` and copy their AI
implementations so AI use in this repo is controlled. Full audit done; this is the digest.

### H1. What exists over there

| Artifact | Where | Purpose |
| --- | --- | --- |
| `CLAUDE.md` | both repos | Invariants + architecture map + commands. Deliberately **not** procedure. |
| `docs/ai/*.md` (9 runbooks + README) | app only | The actual procedure. Tool-agnostic, each opens with a "Canonical examples:" block naming real files to copy. |
| `.claude/skills/*/SKILL.md` (9) | app only | ~6-line discovery shims: YAML frontmatter + "Read `docs/ai/X.md` and follow it exactly" + `$ARGUMENTS`. Zero duplicated procedure. |
| `.claude/skills/feature-flags/SKILL.md` | backend only | **Not a shim** — 4.5 KB of inline procedure with **no YAML frontmatter**, so it cannot be discovered as a skill at all. |
| `docs/adr/*.md` (6) / `ADR/*.md` (5) | backend / app | Decision records, in two different house styles and two different folders. |
| `CONTRIBUTING.md`, `README.md` | app | Human onboarding. |
| `.github/workflows/ci.yml` | both | lint (tsc + eslint + prettier) / test (coverage) / build / e2e. |
| `.github/workflows/claude*.yml` (2) | app | AI-in-CI |
| `.claude/settings.local.json` | app | Permissions |
| `.husky/pre-commit` + `lint-staged` | both | eslint --fix + prettier on staged files. |

Verified absent in both repos: `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`,
`.claude/commands/`. `monorepo/` and `app-playground/` contain no agent-instruction files.

### H2. The mechanism worth stealing (and it was stolen)

The layers have one job each, and the separation is *enforced by convention*: `CLAUDE.md` refuses to
hold procedure ("Use the `add-component` skill / `docs/ai/add-component.md` … don't duplicate that list
here, **it drifts**"), the runbook holds procedure, and the skill file is a 6-line pointer. The
directory name, the `name:` frontmatter field, and the runbook filename stem are all identical — that
identity *is* the mechanism. Only two things vary between skills: the `description`, written as a
**trigger condition** ("Use when the user says the work is done, wants to push, or asks to prep a
PR"), and a single restated invariant.

Two ground rules from their `docs/ai/README.md` are the reason the layer survives at all:

> **Copy the canonical example, don't invent.** Each runbook names the reference files. If your output
> looks structurally different from the reference, it's wrong.

> **The repo's real config wins over any doc** — if a runbook and the code disagree, trust the code
> and open a PR fixing the runbook.

Both are ported verbatim into `docs/ai/README.md`.

The third good idea: **put the rule in the error message.** Their ESLint messages state the fix *and*
name the ADR, so the constraint is machine-enforced and self-explaining at the moment it fires. That
is now a documented convention here.

### H3. What I found wrong over there (worth knowing before trusting it as a model)

1. **The AI-in-CI is inert.** `claude.yml` and `claude-code-review.yml` are commented out in full,
   every line from `# name:` down. There is no running `anthropics/claude-code-action` anywhere.
   "AI in CI" is aspirational over there, which is exactly why this repo's control lives in
   `CLAUDE.md` + `.claude/settings.json` + review discipline rather than in a workflow that looks
   reassuring and does nothing.
2. **Documented coverage threshold drifted from the real one.** `app/CLAUDE.md` says 60% in two
   places, `CONTRIBUTING.md` and two runbooks repeat it — `app/vitest.config.ts` says
   `{ lines: 50, functions: 50, branches: 50 }`. I verified this directly. Five documents, one wrong
   number. **This repo therefore states no coverage number outside `vitest.config.ts`** — `CLAUDE.md`
   and `write-tests.md` both say "see `vitest.config.ts`".
3. **A CI "gate" that cannot fail.** `app/.github/workflows/ci.yml` has a bundle-size check whose
   entire body is `echo "Bundle size check passed ✓"`. Guard theatre is worse than no guard, because
   it is trusted.
4. **`CONTRIBUTING.md` is a third, stale copy of the runbooks.** Its "How to Add a Feature / Component
   / Form" sections were superseded — one of them teaches `register()` where the runbook and skill both
   mandate `Controller`, and another shows hand-written TanStack Query that their own ESLint rule
   errors on. The duplication is the defect; the runbooks were right. **This repo's `CONTRIBUTING.md`
   is intentionally short and contains no procedure** — it points at the runbooks instead.
5. **Enforcement is mostly honour-system, even there.** Machine-checked: `no-explicit-any`,
   `no-console`, `import/no-cycle`, `no-restricted-imports` (axios/zustand/TanStack Query),
   `no-restricted-globals` (raw `fetch`), strict TS, coverage thresholds, lint-staged, CI. Honor-system:
   the Swagger decorator catalogue, "no barrel exports", "repositories are private to their module",
   controller naming, the 3-consumers-before-promotion rule, PR size limits. Their own backend
   `import/order` is `'warn'`, and warnings do not fail CI.
6. **Two ADR dialects in two folders** (`ADR/ADR-00N-*.md` vs `docs/adr/000N-*.md`), with
   contradictory structures. This repo uses one: `docs/adr/000N-*.md`.
7. **A 70 KB standards markdown file with ~1,300 lines of production source pasted into it.** Source
   code in a prose document cannot be type-checked and is guaranteed to drift. Not ported, and the
   `docs/ai/README.md` skeleton convention exists partly to prevent that here.

### H4. What was ported, and what was deliberately skipped

**Ported (adapted to this project, not copied wholesale):**

| File | Notes |
| --- | --- |
| `CLAUDE.md` | Invariants, commands, architecture, constraints. No procedure. Now also carries the two AI boundaries. |
| `AGENTS.md` | A 10-line pointer, for tools that do not read `CLAUDE.md`. KadaKareer has no equivalent; added because it is cheap. |
| `docs/ai/README.md` | Index + ground rules + the runbook skeleton + the two conventions. |
| 7 runbooks | `add-feature`, `add-component`, `write-tests`, `change-data-model`, `add-notification`, `cleanup`, `pre-pr`. Five are project-specific; two (`write-tests`, `cleanup`) are near-universal and ported in spirit. |
| `.claude/skills/*/SKILL.md` (7) | The 6-line shim mechanism, exactly. |
| `.claude/settings.json` | Permission allow/ask/**deny**, including deny-read on `.env`, `*.pem`, `vapid*.json`, and service-account files. |
| `docs/adr/README.md` + 5 ADRs | Their `Context / Decision / Consequences / Alternatives` shape, with a mandatory **Bad / cost** section. |
| `CONTRIBUTING.md` | Deliberately short. Non-negotiables + how to review an agent-authored change. No procedure duplication. |
| `.github/workflows/ci.yml` | 3 jobs, plus a **real** check that `dist/sw.js` and the manifest exist. |

**Skipped, with reasons:**

| Skipped | Why |
| --- | --- |
| `claude.yml` / `claude-code-review.yml` | Inert upstream, and they need a `CLAUDE_CODE_OAUTH_TOKEN` secret. Adding a disabled workflow that looks like governance is the exact failure mode found in H3.1. |
| Their `CONTRIBUTING.md` (18 KB) | Third stale copy of the runbooks. |
| `ADRs 001–005` from app | They argue a stack migration (styled-components → Tailwind, Formik → RHF, Orval strategy) that this repo never performs. |
| `connect-api.md`, `ui-first.md`, `add-form.md`, `add-feature-flag.md` | Each describes machinery this project does not have (codegen + MSW mock mode + a large form surface + env feature flags). A flag system for a one-user app is pure bloat. |
| `backend/KadaKareer_Backend_Developer_Standards_Updated.md` | 70 KB with production source pasted into prose. |
| Backend's NestJS-specific rules | Swagger decorator catalogue, admin-vs-REST routing duality, controller naming table. Different stack. |
| `.claude/settings.local.json` | Gitignored local state with one dead one-off permission. `.claude/settings.json` (committed, portable) replaces it. |
| Chromatic / Storybook workflows | No Storybook here. |
| Backend's `feature-flags/SKILL.md` | Broken as a skill (no frontmatter) and describes machinery this project does not need. |

Plus two things from the backend that the app lacks and that are worth having, expressed as project
rules rather than config: **`no-floating-promises` as an error** (every `await` matters when a write
may be interrupted), and **`vitest related` in lint-staged** (run the tests that touch the staged
files on every commit).

### H5. Net effect

There is now a written answer, in the repo, to "how is AI use controlled here":

- **What the AI may not touch** — `CLAUDE.md` → explicit must-not-do list (no scaffolding, no new
  paid/keyed dependency, **no backend, no push service, no server-side secret** per ADR 0006, no
  decision changes without an ADR, no secrets, no leaving servers running).
- **What the AI must be told to do** — `docs/ai/` runbooks, one per risky task, with `Done when`
  checklists and explicit "Do not" sections.
- **What is machine-checked** — CI (lint + typecheck + format + test + build + PWA-artifact check),
  husky/lint-staged, strict TS, coverage thresholds, and the `deny` list in `.claude/settings.json`.
- **What requires a human decision** — anything in `BUILD_GUIDE.md` §2, plus any ADR-shaped change.
- **What is deliberately honour-system** — design voice, microcopy, and component promotion. These are
  labelled as such rather than implied to be enforced.

The one thing this cannot do is review itself. `CONTRIBUTING.md` ends with how to review an
agent-authored change, and that review is still yours to do.
