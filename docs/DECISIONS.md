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

### D3. Her exam date — ✅ **RESOLVED: Friday, February 26, 2027**

**156 days from today (2026-09-23) — 22.3 weeks, ~5.1 months.** That is a real runway, and it changes
the build *order* rather than the scope. Full reasoning in `BUILD_GUIDE.md` §9; the three consequences
worth knowing here:

1. **The app must be usable long before it is complete.** Spaced repetition pays off over time, so a
   working flashcard system in October is worth far more than a perfect one in January. B and D land in
   the first three weeks; C, E, F, S, and G follow without reducing what she gets — *provided the data
   model is right from day one*.
2. **No new feature after mid-January 2027.** Weeks 17–22 are buffer, cram mode, and bug fixes. A
   feature shipped two weeks before a licensure exam is a liability.
3. **Cram mode must be finished before 2027-01-27**, which is when a 30-day window opens. On that date
   normal SM-2 becomes counterproductive — it will say a card is not due for three weeks when the exam
   is in two.

Also scheduled: **re-verify the PRC program around early December 2026** (see
[`reference/pnle-scope.md`](reference/pnle-scope.md)), before she has thousands of cards filed under
the current taxonomy.

**Origin of the confusion worth noting:** the program you sent was for the Feb 26–27, **2026** sitting.
Her date is Feb 26, **2027** — the same seasonal sitting, one year later, and PRC ran no NLE between
Sept 2026 and then. If that program had been assumed to be hers, the app would have been built around
a date seven months past.

### D4. Hosting platform — ✅ **RESOLVED: Vercel**

Static bundle, no backend, free HTTPS. Nothing else to configure.

### D5. Will she install it? — ✅ **RESOLVED: no. Browser-only — and the obvious workaround does not exist**

**Devices: a Windows laptop and an iPad.** That split decides this whole topic.

Recorded as [ADR 0007](adr/0007-browser-only-no-install.md). The short version, all verified:

- On **iPad**, ITP deletes a site's script-writable storage — IndexedDB, `localStorage`,
  `SessionStorage`, **and the service worker with its cache** — after **seven days of browser use
  without interacting with the site**.
- **Every browser on iPad is WebKit**, and ITP is a WebKit feature. So Chrome, Firefox, and Edge on
  iPad behave the same. **"Just tell her to use another browser" does not work on iPad.** I checked
  this specifically because it was the proposed mitigation, and it would have created false confidence
  on the one device that has the problem.
- **`navigator.storage.persist()` does not exempt an origin.** It resolves successfully and changes
  nothing — WebKit explicitly rejected a 2025 PR that would have exempted persistent origins.
- **The Windows laptop is completely safe.** Chrome and Edge on Windows have no such timer.
- The **only** exemption is a Home Screen Web App (Share → Add to Home Screen — two taps, not an app
  download). D5 declines it, so it is documented as a fallback, and offered only if she asks.
- This is not theoretical: 1Password, Dashlane, Simplenote, and Element have reported real data loss
  from it (WebKit bug 209563).

Consequences in the plan: **sync on by default and per write** (D12, below), **export as a first-class
screen**, **automatic silent restore** after an eviction, **visible sync-failure state**, and no install
prompt ever.

### D6. Does she know you're building this? — ✅ **RESOLVED: no. It's a surprise.**

Recorded because it changes the copy and, more importantly, the onboarding:

- **Voice can be personal and playful** — the message bank may read like something from you, not from
  an app. That is the charm budget this project has, and it should be spent here rather than on the bow
  decorations.
- **The reveal is a deliverable, not an afterthought.** She did not ask for this, so the first thirty
  seconds decide whether she ever opens it again: one tap, then value.
- **Nobody can give feedback on cadence or tone**, so defaults stay conservative and copy must read
  well on day 40 as well as day 1.
- **A URL is the entire distribution channel** — no home-screen icon, no notification to bring her
  back. Make it short and memorable.
- **Adoption is the real risk**, and it is listed in `BUILD_GUIDE.md` §7. A surprise study tool that is
  even slightly annoying mid-prep gets quietly abandoned, and there is no feedback loop to catch that.

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

### D12. Should cloud sync default on? — ✅ **RESOLVED: ON, by your call. And it turned out to be necessary.**

You overrode my recommendation, on the grounds that you do not want to risk her data. **That was the
right call, and for a stronger reason than either of us had at the time.**

I had proposed "off on first open, offered after the first session" to protect the surprise-gift first
impression. That reasoning assumed the iPad risk could be dodged by using a different browser. It
cannot — every browser on iPad is WebKit, and ITP is a WebKit feature ([ADR 0007](adr/0007-browser-only-no-install.md)).
So on her iPad, **default-on sync is not a preference, it is the only protection her data has.**

Resolution:

1. **Sync is ON by default.** First open is a **single one-tap Google sign-in**, with a warm, honest
   reason attached: *"sign in so your notes are safe and show up on your laptop too."*
2. **Sync per write, not on a timer** — an eviction between writes would lose whatever had not been
   pushed.
3. **Post-eviction restore is automatic and silent.** Empty local storage plus remote data means
   restore without confirmation. If ITP also cleared the auth session (it will), lead with *"your notes
   are safe — tap to sign in and get them back"*, never with empty-state onboarding that looks like
   data loss.
4. **A sync failure is visible** ("not saved since…").

**The trade-off accepted:** first open now has one required tap. That is the cost of protecting her
data, and it is worth it. The mitigation is framing: one prominent button with a reason, not an account
form or a feature tour.

### D13. Backup behaviour

I specified manual JSON export/import. Automatic periodic export to a file is possible but the web has
no reliable "write to a folder I choose" on iOS.

**Needs from you:** is manual export enough, or should I prompt her to export monthly?

---

## C. Decisions I made for you — ratify or overturn

Six ADRs exist; five are `Accepted` and in force. **"Cheap to overturn now, expensive later" was too
loose a thing for me to have written.** Here is the concrete version: a reversal is expensive when
either (a) data has already been written under the decision and cannot be reconstructed, or
(b) every feature is built on top of it. Before code exists, every one of these is free to change.

Ranked by what a reversal actually costs, **assuming five months of her using the app**:

| # | Decision | Reverse it today | Reverse it in Feb 2027 | Why |
| --- | --- | --- | --- | --- |
| [0003](adr/0003-sm2-scheduler-and-learning-steps.md) | SM-2 + learning steps + `ReviewLog` | Free | **Brutal** | **Not backfillable.** If `ReviewLog` and `lapses` are not recorded from the first review, that history is gone forever — you cannot reconstruct which cards she struggled with, and FSRS becomes impossible without starting over. Same for `nextReview` as epoch-ms: switching to date-only means migrating every card. |
| [0001](adr/0001-local-first-with-indexeddb.md) | Local-first IndexedDB | Free | **Expensive** | Every feature's data layer, every query, and the UI's assumption that reads never fail are built on it. Server-first later means rewriting B, E, F *and* handling offline, which the UI currently assumes away. |
| [0005](adr/0005-auth-google-single-user.md) | Google Sign-In, one email | Free | **Moderate** | Changing the *email* is trivial. Changing the *provider* means re-keying every synced document, because ownership is stamped on each one. |
| [0006](adr/0006-in-app-notifications-only.md) | In-app notifications only | Free | **Cheap — by design** | Deliberately additive: [ADR 0002](adr/0002-push-architecture-and-scheduler.md) is the preserved path back and costs one small service plus a permission UX. Nothing in the data model blocks it. |
| [0004](adr/0004-no-llm-in-runtime.md) | No LLM in the shipped product | Free | **Cheap technically, costly in consequence** | Adding an LLM ingest path later is *additive* — a third tab next to paste and PDF. But it ends the offline guarantee, adds a key and a per-request cost, and puts generated content in front of someone memorising for a licensure exam. Reverse this one knowingly, not accidentally. |

**The practical rule:** the decisions worth agonising over now are the ones that involve **recording
history** — `ReviewLog`, `lapses`, `updatedAt`, `deletedAt`, epoch-ms timestamps. Fields that capture
*when* something happened cannot be added retroactively. Everything else is refactoring, and 22 weeks
is enough runway to refactor.

Two judgement calls worth naming explicitly:

1. **`ReviewLog`** (a row per review) is in the data model. It costs some storage and one extra write
   per card, and it is the only way "weak topics from grading history" can work at all. Cut it and
   Workflow F loses its best feature — and by the time you want it back, the history will not exist.
2. **No feature flags, no component library, no settings framework.** One user, so all three would be
   pure overhead. These are all cheap to add later, so the cost of omitting them is genuinely low.

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

**Every decision is closed. Nothing blocks Workflow A.**

| # | Status |
| --- | --- |
| D1 — push backend | ✅ Closed. No backend; notifications in-app only ([ADR 0006](adr/0006-in-app-notifications-only.md)). |
| D1b — cloud sync | ✅ Closed: yes. Google Sign-In, Firestore, owner-only rules, **Workflow S**. |
| D2 — auth | ✅ Closed: Google, one email. You put the email in `.env` + the rules file. |
| D3 — exam date | ✅ Closed: **Fri Feb 26, 2027 — 156 days.** Ordering in `BUILD_GUIDE.md` §9. |
| D4 — hosting | ✅ Closed: **Vercel**. |
| D5 — install | ✅ Closed: **no, browser-only.** Devices: **Windows laptop (safe) + iPad (at risk)**. Browser-switching does **not** help on iPad. ([ADR 0007](adr/0007-browser-only-no-install.md)). |
| D6 — does she know | ✅ Closed: **no, it's a surprise.** Reveal is a deliverable (`BUILD_GUIDE.md` §9.5). |
| D7 — deck taxonomy | ✅ Closed. Verified against the official PRC program. |
| D12 — sync default | ✅ Closed: **ON**, per your call — and it is the only thing protecting her iPad data. |
| D8–D11, D13 | Defaults exist; answer whenever. None blocks anything. |

**The next thing I need is a go-ahead.**

One thing worth knowing before we start: the iPad risk is real and unfixable within D5. The lever that
would eliminate it is **Share → Add to Home Screen in Safari** — two taps, not an app download, and the
only WebKit-exempted configuration. I am not going to prompt her to do it, and it is not in the plan.
I am noting it because if she ever asks *"how do I make this stick"*, that is the answer, and because
it is a zero-cost thing to reverse if the occasional sign-out screen turns out to annoy her.
