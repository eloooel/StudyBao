# Decision Register

Every decision this repo needs, who it belongs to, and what happens if it goes the wrong way.

**Read this first:** only **six** decisions actually block you. Everything else has a working default
and can be changed later at low cost. The six are marked 🔴.

Decisions already closed with defaults live in [`BUILD_GUIDE.md`](BUILD_GUIDE.md) §2 — this file does
not restate them. It covers what still needs **your** input, plus the reasoning I used where I made a
judgement call on your behalf.

---

## A. 🔴 Blocking — answer before any code is written

These six change the service worker, the auth flow, the security rules, or the database schema.
Answering them later means rework, not a config change.

### D1. Push backend shape *(was decision #3)*

The original plan assumed Firebase Cloud Messaging, which needs a sender, which means Cloud Functions,
which requires the Blaze plan with a card on file. Pick one:

| Option | Cost | Consequence |
| --- | --- | --- |
| **Cloudflare Worker + Cron Triggers** *(recommended)* | Free, no card | Adds one small service to deploy and keep alive. 1-minute tick, 10 ms CPU per run — verified fine for a couple of pushes. |
| Firebase Cloud Functions on Blaze | $0 at this scale, **card on file** | Least new code. Budget alerts notify but do not hard-stop spending. |
| GitHub Actions cron | Free | ~5 min minimum granularity with routine 5–20 min delays, disabled after 60 days of repo inactivity. **Only good for the once-daily streak reminder.** Cannot do idle nudges. |
| **No push at all** | Free | Loses the headline feature. In-app toasts only, and only while the app is open. |

**Needs from you:** which of these, and — if Cloudflare — whether you have an account or want to make
one.

### D2. Auth model *(was decision #6)*

Cloud sync and "no login" cannot coexist: Firestore rules need an authenticated identity, otherwise
her notes are world-readable or the "secret" ships in the browser bundle.

| Option | Consequence |
| --- | --- |
| **Google Sign-In, one allow-listed email** *(recommended)* | One tap per device. Survives an iOS reinstall. Rules become a one-liner. |
| Local-only, no sync, no auth | Simplest and safest, but she studies on two devices — this loses the feature. |
| Anonymous auth | No sign-in friction, but the identity is per-install: a reinstall or cleared browser silently orphans her data. |
| Make it multi-user | Changes the rules, the data model, and the deployment. Not now. |

**Needs from you:** which option. If Google — **her email address** (do not commit it; it goes in
`.env` and the Firestore rules).

### D3. Her exam date 🔴 **— and a date problem I need you to resolve**

Drives cram mode, the dashboard countdown, and notification tone.

**The program you sent is for a sitting that has already happened.** It is the *Program of the Nurses
Licensure Examination on Feb. 26-27, 2026*, approved Dec 1, 2025. Today is **September 23, 2026** —
that exam was **210 days ago**.

Per PRC's 2026 calendar, there were exactly two NLE sittings in 2026: **February 26–27** and
**August 29–30**. Both are past. So if she is still preparing, her exam is a **2027** sitting (the NLE
runs roughly May and November), and the date is currently unknown to me.

**Needs from you:** which sitting she is actually preparing for. See the question at the end of the
last message — this is the one thing I cannot infer.

The good news: the **scope structure is unaffected**. PRC reuses the program template between sittings
(the Feb 2026 document's own footer still reads "November 4-5, 2025"), so the five-part taxonomy in
[`reference/pnle-scope.md`](reference/pnle-scope.md) remains correct. Only the date changes.

### D4. Hosting platform *(was decision #2)*

All three are free with HTTPS. Pick the one that matches where the push backend lives, so there is one
deploy surface and one set of secrets:

- **Cloudflare Pages** — pairs with a Cloudflare Worker backend *(recommended if you pick D1's first option)*
- **Vercel** — easiest DX
- **Firebase Hosting** — pairs with Firestore

**Needs from you:** a choice. Also: is this public or unlisted? (Recommend unlisted + `noindex`.)

### D5. Will she actually install it to her Home Screen?

Not a preference — a hard gate on iOS. Web Push requires the PWA be installed, and Safari's 7-day
storage cap is **exempted only for installed web apps**. If she uses it in a Safari tab, push never
works *and* her data can be evicted.

**Needs from you:** a realistic read on whether she will install it, and whether she will keep it
installed. If the answer is "probably not", the PWA install screen becomes the single most important
screen in the app, and we should consider making local export automatic rather than manual.

### D6. Does she know you're building this?

It changes the notification copy and the whole framing. A surprise gift app and a tool she asked for
need different voices:
- Surprise → the messages can be playful and sentimental; the app can reveal itself.
- Tool she requested → messages should be practical and she should be asked for feedback on cadence.

**Needs from you:** which, so I can write the message bank and microcopy in the right register.

---

## B. Needs your input, but not blocking

### D7. ~~Verify the deck taxonomy against the actual PRC program~~ — ✅ **RESOLVED**

Verified. You supplied the official 8-page program and I extracted it: the five Nursing Practice
parts, the integrated knowledge areas, and the two-day schedule are transcribed verbatim in
[`reference/pnle-scope.md`](reference/pnle-scope.md). Two findings worth keeping:

1. **No Table of Specifications and no item weights exist in the official document** — confirmed by
   reading all 8 pages (pages 4–8 are Memorandum Order No. 52 on exam conduct, not content). So the
   "don't invent percentage weights" rule stands, and it came from the primary source.
2. **A popular prep site is confidently wrong** about the exam's own structure — it maps every
   Nursing Practice part to different content than PRC does, and asserts item counts PRC never
   states. Useful proof that the app should never surface a third-party "TOS".

### D8. Notification cadence and quiet hours

Defaults I chose, all changeable in Settings: idle nudge at **+8 min** into a work session, max **1
per session**; streak reminder once daily at a time you pick; **quiet hours 22:00–06:30 local**.

**Needs from you:** the idle threshold, and the quiet-hours window. If she studies late, the default
quiet hours will suppress nudges she might want.

### D9. Night mode

I added a night variant (dim plum, not black) because a `#FFF9FA` screen at 2 a.m. is genuinely
unpleasant. It is extra work in every component.

**Needs from you:** keep it or cut it. If cut, the palette work shrinks noticeably.

### D10. Font decision

I recommended **Quicksand** over Playfair Display — Playfair is a high-contrast display serif that
fights dense nursing text at phone sizes.

**Needs from you:** confirm, or override for the aesthetic. Both are free and self-hosted.

### D11. Icon and mascot

The design system reserves bows/sparkles/ribbons for streak and achievement moments. The app icon
needs a decision: a bow, a bun/dumpling (per the "Bun-Bun Bao" idea), a plain wordmark, or something
she'd pick.

**Needs from you:** a direction, or an asset. I can generate a placeholder, but an icon she chose will
get installed and kept.

### D12. Should cloud sync default on once it exists?

Sync is opt-in in my plan. Default-on is more useful and more risky (silent conflict bugs reach her
data sooner).

**Needs from you:** default on or off. My recommendation: default **on**, but only after the merge
function has migration tests — not at first ship.

### D13. Backup behaviour

I specified manual JSON export/import. Automatic periodic export to a file is possible but the web has
no reliable "write to a folder I choose" on iOS.

**Needs from you:** is manual export enough, or should I prompt her to export monthly?

---

## C. Decisions I made for you — ratify or overturn

Five ADRs are marked `Accepted` because the build is otherwise blocked. Each is cheap to overturn
**now** and expensive later. Read one line each; the full reasoning is in the linked file.

| # | Decision | Overturn it if… |
| --- | --- | --- |
| [0001](adr/0001-local-first-with-indexeddb.md) | **Local-first IndexedDB**, Firestore as optional sync | You want server-authoritative data and accept that the app needs network for basic study. |
| [0002](adr/0002-push-architecture-and-scheduler.md) | **Pre-schedule then cancel**, own cron, plain VAPID (no FCM) | You'd rather take the Blaze card-on-file and skip writing a backend. |
| [0003](adr/0003-sm2-scheduler-and-learning-steps.md) | **SM-2 + sub-day learning steps**, epoch-ms, `ReviewLog` history | You want textbook date-only SM-2 — simpler, but the first-day experience is bad. |
| [0004](adr/0004-no-llm-in-runtime.md) | **No LLM in the shipped product** | You disagree that a hallucinated flashcard is worse than a missing one. |
| [0005](adr/0005-auth-google-single-user.md) | **Google Sign-In, one email** | D2 goes local-only, which makes this ADR moot. |

One more judgement call worth naming explicitly: I put **`ReviewLog`** (a row per review) in the data
model. It costs some storage and one extra write per card, and it is the only way "weak topics from
grading history" can work at all. If you cut it, Workflow F loses its best feature.

---

## D. Decisions I deliberately deferred

Not oversights — these are cheap to add later and expensive to guess now.

| Deferred | Why | Revisit when |
| --- | --- | --- |
| **FSRS scheduler** | Better retention-per-review than SM-2, but a bigger algorithm. The `ReviewLog` design keeps this reachable. | After a month of real review data exists to compare against. |
| **E2E tests (Playwright)** | No test surface worth automating until the app exists. | After Workflow A produces installable screens. |
| **Multi-device conflict UI** | Last-write-wins is sufficient for one user with two devices. | If she ever sees a card "come back" after deleting it — that is the signal the merge is wrong. |
| **Sharing with friends** | Would change auth (D2), the rules, and the data model. | If she asks. Say no to "just make it public" — it is a rewrite, not a flag. |
| **CSV export** | JSON is enough for backup/restore. | If she wants to open cards in a spreadsheet. |
| **Accessibility audit beyond contrast** | Contrast is done and computed. Screen-reader work matters less for a one-user app. | If the app is ever shared. |
| **Offline OCR model tuning** | Tesseract parameters matter less than telling her to paste text or use her phone's own text recognition. | If she actually relies on photo OCR. |
| **Analytics / telemetry** | Would break the privacy stance and add a network dependency. | Never, unless she asks to see her own usage. |

---

## E. Things that look like decisions but should not be made now

Worth stating explicitly, because each one is a plausible-looking detour:

- **Do not pick a component library.** Tailwind + a handful of primitives is the whole need.
- **Do not add feature flags.** There is one user. Flags are for teams shipping to strangers.
- **Do not build a settings framework.** Ship the Settings screen with hardcoded defaults and change
  them when needed.
- **Do not design for multiple users, roles, or decks-per-subject sharing.** None of it is needed.
- **Do not add a backend "properly"** (database, ORM, endpoints for cards). The backend exists to send
  pushes at a time. Nothing else belongs in it.
- **Do not switch schedulers** until there is data to justify it.

---

## Summary

**Six decisions block you** — D1 (push backend), D2 (auth + her email), D3 (**exam date — see the
problem below**), D4 (hosting), D5 (will she install it), D6 (does she know). Everything else has a
working default, and D7 is now closed.

**D3 is the urgent one.** The program you supplied is for the **Feb 26–27, 2026** sitting, which is
210 days past, and PRC's 2026 calendar shows **no NLE remaining in 2026** (the two sittings were
Feb 26–27 and Aug 29–30). If she is still preparing, her exam is a 2027 sitting and the date is
unknown to me. The scope is unaffected, but the countdown, cram mode, and urgency framing all depend on
this.

If you want to move fastest: answer those six, ratify or overturn the five ADRs in §C, and Workflow A
can start.
