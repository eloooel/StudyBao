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

### D1. ~~Push backend shape~~ — ✅ **RESOLVED: there is no backend**

You chose: **no notifications while the app is closed; only when she is idle or has switched tabs.**

That removes the question rather than answering it. There is no scheduler, no subscription store, no
VAPID key, no Cloud Functions, no FCM, and no Cloudflare Worker. The app is a static bundle. Recorded
as [ADR 0006](adr/0006-in-app-notifications-only.md), which supersedes
[ADR 0002](adr/0002-push-architecture-and-scheduler.md). The free-tier analysis in ADR 0002 is kept
because it is the map back if this is ever revisited.

**The honest consequence, so it is not a surprise later:** nothing fires when the app is closed. The
specific case that suffers is the common one — start a 25-minute Pomodoro, switch to a PDF or notes
app, and the break cue never arrives. On mobile, switching apps suspends the page, so the idle nudge
becomes a "welcome back" on return rather than a nudge while she is away. The timer screen will say
plainly that the tab must stay open.

If that turns out to be unacceptable in practice, the fix is already scoped (ADR 0002) and the cost is
one small service. It is not a rewrite.

### D1b. Cascade: is cloud sync still wanted? — ✅ **RESOLVED: yes**

She will use a phone and a laptop, so **cloud sync is in scope**. That means Google Sign-In on one
allow-listed email, Firestore, owner-only rules, and a last-write-wins merge with tombstones — see
[ADR 0001](adr/0001-local-first-with-indexeddb.md) and [ADR 0005](adr/0005-auth-google-single-user.md).

The sync work was originally bundled into the deleted push backend (old G0); it is now restored as its
own **Workflow S** in `BUILD_GUIDE.md` §4. It is the half of G0 that survives.

Remaining sub-decision: **D12** — should sync default on at first ship, or become default-on only once
the merge tests pass? (Recommendation: off at first ship, on after.)



### D2. Auth model — ✅ **RESOLVED: Google Sign-In, one allow-listed email**

Confirmed alongside sync (D1b). Cloud sync and "no login" cannot coexist: Firestore rules need an
authenticated identity, otherwise her notes are world-readable or the "secret" ships in the browser
bundle.

Anonymous auth is rejected: the identity is per-install, so a reinstall or a cleared browser silently
orphans her data — and on iOS, reinstalling is a routine event.

**Still needed from you:** **her email address.** Put it in `.env` as `VITE_ALLOWED_EMAIL` and mirror
it in the Firestore rules file — do not send it to me, and do not commit it. Both files will carry a
placeholder and a one-line instruction. (`VITE_ALLOWED_EMAIL` ends up in the client bundle either way,
which is fine; the *protection* is the rules file, not secrecy.)

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

Now that there is no backend (D1), this is a static bundle and the choice is pure preference — all
three give free HTTPS. **GitHub Pages is also viable**, which removes one more account entirely.

**Needs from you:** a choice. Also: is this public or unlisted? (Recommend unlisted + `noindex` —
her study data lives on-device, but the deployment does not need to be discoverable.)

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

Six ADRs exist; five are `Accepted` and in force. Each is cheap to overturn **now** and expensive
later. Read one line each; the full reasoning is in the linked file.

| # | Decision | Status / overturn it if… |
| --- | --- | --- |
| [0001](adr/0001-local-first-with-indexeddb.md) | **Local-first IndexedDB**, Firestore as optional sync | Accepted. Overturn if you want server-authoritative data and accept the app needing network for basic study. |
| [0002](adr/0002-push-architecture-and-scheduler.md) | Pre-schedule then cancel, own cron, plain VAPID | **Superseded by 0006.** Kept as the map back if closed-app notifications are ever wanted. |
| [0003](adr/0003-sm2-scheduler-and-learning-steps.md) | **SM-2 + sub-day learning steps**, epoch-ms, `ReviewLog` history | Accepted. Overturn if you want textbook date-only SM-2 — simpler, but the first-day experience is bad. |
| [0004](adr/0004-no-llm-in-runtime.md) | **No LLM in the shipped product** | Accepted. Overturn if you disagree that a hallucinated flashcard is worse than a missing one. |
| [0005](adr/0005-auth-google-single-user.md) | Google Sign-In, one email | **Conditional** — only applies if D1b says yes to cloud sync. |
| [0006](adr/0006-in-app-notifications-only.md) | **In-app notifications only: no backend, no push** | Accepted. Overturn if losing the closed-app cue turns out to matter (then see 0002). |

Two judgement calls worth naming explicitly:

1. **`ReviewLog`** (a row per review) is in the data model. It costs some storage and one extra write
   per card, and it is the only way "weak topics from grading history" can work at all. Cut it and
   Workflow F loses its best feature.
2. **No feature flags, no component library, no settings framework.** One user, so all three would be
   pure overhead. If you want any of them, say so now rather than after they are missing.

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

**Three decisions block you now** (down from six):

| # | Status |
| --- | --- |
| D1 — push backend | ✅ **Closed.** No backend; notifications are in-app only ([ADR 0006](adr/0006-in-app-notifications-only.md)). |
| D1b — cloud sync | ✅ **Closed: yes.** So Google Sign-In, Firestore, owner-only rules. Sync restored as **Workflow S**. |
| D2 — auth | ✅ **Closed: Google, one email.** You supply the email into `.env` + the rules file. |
| D7 — deck taxonomy | ✅ **Closed.** Verified against the official PRC program. |
| **D3 — exam date** | 🔴 **OPEN — the one I cannot infer.** |
| **D4 — hosting** | 🔴 OPEN (pure preference now). |
| **D5 — will she install it** | 🔴 OPEN. Still matters: installing is what exempts her data from Safari's 7-day eviction. |
| **D6 — does she know** | 🔴 OPEN. Sets the notification voice. |
| D8–D13 | Has defaults; answer whenever. |

**D3 is the only one that changes what I build next**, because cram mode, the dashboard countdown, and
the whole urgency framing depend on it.

If you want to move fastest: give me the 2027 exam date, answer D4/D5/D6, ratify or overturn the ADRs
in §C, and Workflow A can start.
