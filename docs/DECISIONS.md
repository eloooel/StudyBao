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
which is fine; the _protection_ is the rules file, not secrecy.)

### D3. Her exam date — ✅ **RESOLVED: Friday, February 26, 2027**

**156 days from today (2026-09-23) — 22.3 weeks, ~5.1 months.** That is a real runway, and it changes
the build _order_ rather than the scope. Full reasoning in `BUILD_GUIDE.md` §9; the three consequences
worth knowing here:

1. **The app must be usable long before it is complete.** Spaced repetition pays off over time, so a
   working flashcard system in October is worth far more than a perfect one in January. B and D land in
   the first three weeks; C, E, F, S, and G follow without reducing what she gets — _provided the data
   model is right from day one_.
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

### D5. Will she install it? — ✅ **RESOLVED: yes, via Share → Add to Home Screen (iPad only)**

**This reversed twice, so here is the sequence, because the reasoning is the useful part.**

1. **First answer: "no, purely browser based."** That looked fine until I checked what it implied.
2. **The problem.** Safari's ITP deletes a site's script-writable storage — IndexedDB, `localStorage`,
   `SessionStorage`, **and the service worker with its cache** — after seven days of browser use without
   interacting with the site. Three facts, all verified: it applies to **every** browser on iPadOS
   (all WebKit, so switching browsers does not help); `navigator.storage.persist()` **does not** exempt
   an origin (WebKit rejected a PR that would have); and a **Home Screen Web App is exempt**. Devices
   are a Windows laptop (Chrome/Edge have no eviction timer — completely safe) and an iPad (the risk).
3. **The miss was mine as much as yours: "install" was ambiguous.** You meant "I don't want to make her
   download an app", which is a reasonable thing to refuse. Add to Home Screen is not that: it is **two
   taps in the Share sheet**, nothing downloads, nothing comes from an app store, and there is no build
   tooling or update cycle. It is a bookmark that opens in its own container — and that container is
   precisely what WebKit exempts.

**Resolution:** prompt **Share → Add to Home Screen on iPadOS**, first thing, with a skip. Recorded as
[ADR 0008](adr/0008-add-to-home-screen-on-ipad.md), which supersedes [ADR 0007](adr/0007-browser-only-no-install.md).

Four details that matter:

- **The prompt comes before sign-in.** The Home Screen app keeps its **own storage, separate from
  Safari's** ("not part of Safari"). Signing in inside a Safari tab and _then_ installing means the new
  app starts empty and **she signs in twice**. Install first, then one sign-in in the container her data
  will live in.
- **Tell her to use the Home Screen icon, not the Safari tab.** Separate containers mean two local
  copies that only sync reconciles; the Safari one is the one that gets deleted.
- **Framed as data safety, not software.** _"Two taps, and it stops your notes from being cleared."_
  With a screenshot of the Share sheet. No jargon, never the word "install".
- **It is skippable and non-repeating.** One reminder in Settings at most. If she skips, sync and export
  carry the risk exactly as ADR 0007 described.

**Windows: change nothing.** A plain browser tab on Windows is durable; suggesting an install there adds
a maintenance surface for no benefit.

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

### D8. Notification cadence and quiet hours — ✅ **RESOLVED: +10 min, max 2, quiet hours OFF**

Your call, and the quiet-hours half turned out to be the important one.

| Setting         | Was         | Now          | Why                                                                                     |
| --------------- | ----------- | ------------ | --------------------------------------------------------------------------------------- |
| Idle nudge      | +8 min      | **+10 min**  | Your call.                                                                              |
| Max per session | 1           | **2**        | Your call — she often procrastinates, and one nudge does not bring her back.            |
| Quiet hours     | 22:00–06:30 | **disabled** | **She studies late, so the default would have silenced every nudge she could receive.** |

The quiet-hours reasoning is worth keeping, because it is counter-intuitive: nudges are **in-app only**
([ADR 0006](adr/0006-in-app-notifications-only.md)), so one can only ever fire while she is already
looking at the app. A quiet window covering her actual study hours therefore does not make the app less
intrusive — it disables the feature outright. The setting stays available; it is off by default.

### D9. Night mode — ✅ **RESOLVED: keep**

Kept. The per-component cost was already paid in Workflow A, so it is sunk, and the benefit stands — no
`#FFF9FA` screen at 2 a.m., which matters more than usual given she studies late (D8).

### D10. Font decision — ✅ **RESOLVED: Quicksand**

Confirmed as recommended. Playfair Display is a high-contrast display serif and would have fought dense
nursing text at the sizes she actually reads. Both are free and self-hosted, so the decision was
reversible; it is now closed.

### D11. Icon and mascot — ✅ **RESOLVED: a generated bow placeholder**

A bow, generated from the same geometry as `public/favicon.svg` by `scripts/generate-icons.mjs`, exactly
as the other icons already are. **Swap it if she ever says what she would want** — an icon she chose gets
installed and kept, which is why this is deliberately the cheapest possible placeholder rather than a
design direction.

### D12. Should cloud sync default on? — ✅ **RESOLVED: ON, by your call. And it turned out to be necessary.**

You overrode my recommendation, on the grounds that you do not want to risk her data. **That was the
right call, and for a stronger reason than either of us had at the time.**

I had proposed "off on first open, offered after the first session" to protect the surprise-gift first
impression. That reasoning assumed the iPad risk could be dodged by using a different browser. It
cannot — every browser on iPad is WebKit, and ITP is a WebKit feature ([ADR 0007](adr/0007-browser-only-no-install.md)).
So on her iPad, **default-on sync is not a preference, it is the only protection her data has.**

Resolution:

1. **Sync is ON by default.** First open is a **single one-tap Google sign-in**, with a warm, honest
   reason attached: _"sign in so your notes are safe and show up on your laptop too."_
2. **Sync per write, not on a timer** — an eviction between writes would lose whatever had not been
   pushed.
3. **Post-eviction restore is automatic and silent.** Empty local storage plus remote data means
   restore without confirmation. If ITP also cleared the auth session (it will), lead with _"your notes
   are safe — tap to sign in and get them back"_, never with empty-state onboarding that looks like
   data loss.
4. **A sync failure is visible** ("not saved since…").

**The trade-off accepted:** first open now has one required tap. That is the cost of protecting her
data, and it is worth it. The mitigation is framing: one prominent button with a reason, not an account
form or a feature tour.

### D13. Backup behaviour — ✅ **RESOLVED: manual export only**

No monthly nag. The web has no reliable "write to a folder I choose" on iOS, so a reminder she cannot
complete is worse than none. Export/import is still its own step ahead of the reveal, and it is the only
backup that does not depend on Google, the network, or a sync bug
([ADR 0007](adr/0007-browser-only-no-install.md)).

### D14. Ingest: the OCR fallback for rasterized PDFs — ✅ **RESOLVED: not needed for the reveal; build only if the measurement says so**

**The gating test has been run, and it splits the answer by device.** Selecting all and copying from the
same rasterized BoardPal PDF:

| Device             | Result                                                                       | Consequence                                                                     |
| ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **iPad**           | Text comes out. Preview runs **Live Text** invisibly over image-only pages.  | **Solved, zero code.** The paste tab works today.                               |
| **Windows laptop** | **Nothing comes out.** The PDF viewer has no OCR, and there is no Live Text. | A dead end on that device **unless the copy changes or the fallback is built.** |

**This reverses my own recommendation a second time, and the evidence arrived after I made it.** I first
proposed building the fallback; the watermark test showed the iPad path already works without it; and now
the laptop is confirmed as the only device that actually needs it.

**The reveal is not blocked, because the reveal is iPad-first.** The install prompt is iPadOS-only, the
Home Screen Web App is the target, and the laptop is a plain tab
([ADR 0008](adr/0008-add-on-home-screen-on-ipad.md)) — so a laptop-only gap is not on the critical path.
Adding a feature now would put the rehearsal and the reveal at risk for a secondary device.

**Three things to do, in this order, and only the first is pre-reveal:**

1. **Fix the copy — and this is the already-decided item 2 below, which was never implemented.** The
   scanned-PDF message still reads _"Open it on your phone, use Live Text (iPhone) or Google Lens
   (Android)"_ on **every** device, and nothing in the ingest feature is platform-aware. That is wrong in
   both directions she will meet it: on her **iPad** it sends her to a phone she does not need, adding a
   step she has already said she will not take; on her **laptop** it sends her to a phone, when the
   built-in alternative is a screenshot tool's text action (Windows Snipping Tool's _Text actions_, or
   PowerToys _Text Extractor_) — neither of which needs the app to change. **This is a copy fix, not a
   feature, and it is worth doing before the reveal because the wrong advice appears on the iPad path.**
2. **Then measure, and let the measurement decide whether to build anything.** The BoardPal paste is
   itself what OCR output looks like, because Live Text already did the OCR — so
   [`INGEST-TEXT-MEASUREMENT.md`](INGEST-TEXT-MEASUREMENT.md) answers "is this document type usable at
   all?" **without building OCR.** If the parse is mostly watermark junk and 87% leftovers, then an
   in-app fallback for the laptop would be plumbing noise into a pipeline that cannot use it, and the
   honest answer becomes: rasterized handouts work on the iPad, and need manual conversion on the laptop.
3. **Only then consider building it.** If the measurement is favourable it is a plumbing task rather
   than research — pdfjs renders to canvas, and `image-prep` → Tesseract → `normalize` → `parse` all
   exist and are tested.

**One design note that inverted.** The constraint was written for a 3 GB iPad — persist each page as it
completes, show partial results. But the fallback's real user is the **laptop**, so the default design
pressure is much lighter. It must still be safe if she runs it on the iPad, but the iPad is the device
that does _not_ need it.

**Why the PDF tab reached nothing in the first place.** Her material is **digital PDFs and screenshots,
and never handwriting**, and a watermark-bearing subset — BoardPal among them — has **no text layer at
all**: 21 pages, 21 full-page images, **zero text operators**. That one fact invalidates the guide's
framing of photo OCR as a _last resort_, because §3's warning is specifically about handwriting and
Tesseract is trained on printed text.

**The proof that the iPad path is Live Text rather than a text layer.** The same watermark reads
`Marbie Jade` on one line and `Marble Jade` on another; body text carries recognition errors (`four` →
`tour`, `before` → `betore`, `feet` → `teet`, `infection` → `intection`); and the diagonal watermark
arrives letter-spaced as `e j a d e m e n d i o l a @ g m a i l . c o m`, in a dozen different
fragmentations. A PDF text layer cannot render one watermark a dozen ways.

**Screenshots already work** through the photo tab, so the gap is specifically rasterized PDFs.

**And the noise problem is now the real one, not OCR.** Two things no parser rule can fix from reading
order alone:

- **the watermark is interleaved _within_ body lines**, in a dozen fragmentations per page — so a
  repeated-**line** filter cannot catch it (that was my earlier proposal, and it is wrong). A
  token-or-frequency approach is the shape that would work;
- **multi-column tables are serialised column-wise** — `Point / Why it is called the silent killer /
Primary (essential) hypertension / …` is a three-column table flattened into a false reading order.
  PDF.js exposes x and y per item, so the app can beat the reader's own copy here, but only once
  `contentItemsToLines` looks at x.

### D15. The reveal moves to mid-October / early November — and it reorders everything left

Stated plainly because the gap is large: a mid-October reveal gives her **~19 weeks** of spaced
repetition before the exam. A mid-January reveal — which is where `export/import → F → S → G → H` puts it
— gives her **~6**. §9.1 exists precisely because the app should be usable long before it is complete.

**So the reveal moves ahead of F, S and G.**

| #   | Task                                                   | Why it is on the critical path                                                                                                                        |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Parser join fix                                        | Her first week is ingest. A parser that merges unrelated sections into one card is a bad first impression and a real risk.                            |
| 2   | Export/import                                          | Her only backup that does not depend on Google, the network, or a sync bug.                                                                           |
| 3   | H, reveal-scoped: install prompt, no-sign-in first run | The prompt is what exempts her local data from ITP ([ADR 0008](adr/0008-add-to-home-screen-on-ipad.md)). Without it her data is at risk from day one. |
| 4   | PDF→OCR fallback (D14)                                 | Conditional on how much of her library is rasterized. Her first attempt at her own notes should not hit a dead end.                                   |
| 5   | **Reveal**                                             |                                                                                                                                                       |

**What this costs, stated honestly:**

- **No laptop sync until S lands.** She is iPad-only, and moving cards between devices is manual
  export/import — which is what makes step 2 load-bearing rather than a nicety.
- **No dashboard until F lands**, so no streak or progress view. The core loop is complete without it:
  notes become cards, cards get spaced, blocks get timed, and her plan lives in the tracker.
- **First run has no sign-in**, because S is unbuilt. D12's one-tap Google sign-in is part of S and
  arrives with it; until then the first run is the install prompt and then straight in. `CLAUDE.md`'s UX
  rules describe the post-S flow and need that caveat.

None of these argues for waiting: they are all things she can be given while already using the app, which
is the same trade §9.1 already made.

---

## C. Decisions I made for you — ratify or overturn

Six ADRs exist; five are `Accepted` and in force. **"Cheap to overturn now, expensive later" was too
loose a thing for me to have written.** Here is the concrete version: a reversal is expensive when
either (a) data has already been written under the decision and cannot be reconstructed, or
(b) every feature is built on top of it. Before code exists, every one of these is free to change.

Ranked by what a reversal actually costs, **assuming five months of her using the app**:

| #                                                    | Decision                            | Reverse it today | Reverse it in Feb 2027                       | Why                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------- | ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [0003](adr/0003-sm2-scheduler-and-learning-steps.md) | SM-2 + learning steps + `ReviewLog` | Free             | **Brutal**                                   | **Not backfillable.** If `ReviewLog` and `lapses` are not recorded from the first review, that history is gone forever — you cannot reconstruct which cards she struggled with, and FSRS becomes impossible without starting over. Same for `nextReview` as epoch-ms: switching to date-only means migrating every card. |
| [0001](adr/0001-local-first-with-indexeddb.md)       | Local-first IndexedDB               | Free             | **Expensive**                                | Every feature's data layer, every query, and the UI's assumption that reads never fail are built on it. Server-first later means rewriting B, E, F _and_ handling offline, which the UI currently assumes away.                                                                                                          |
| [0005](adr/0005-auth-google-single-user.md)          | Google Sign-In, one email           | Free             | **Moderate**                                 | Changing the _email_ is trivial. Changing the _provider_ means re-keying every synced document, because ownership is stamped on each one.                                                                                                                                                                                |
| [0006](adr/0006-in-app-notifications-only.md)        | In-app notifications only           | Free             | **Cheap — by design**                        | Deliberately additive: [ADR 0002](adr/0002-push-architecture-and-scheduler.md) is the preserved path back and costs one small service plus a permission UX. Nothing in the data model blocks it.                                                                                                                         |
| [0004](adr/0004-no-llm-in-runtime.md)                | No LLM in the shipped product       | Free             | **Cheap technically, costly in consequence** | Adding an LLM ingest path later is _additive_ — a third tab next to paste and PDF. But it ends the offline guarantee, adds a key and a per-request cost, and puts generated content in front of someone memorising for a licensure exam. Reverse this one knowingly, not accidentally.                                   |

**The practical rule:** the decisions worth agonising over now are the ones that involve **recording
history** — `ReviewLog`, `lapses`, `updatedAt`, `deletedAt`, epoch-ms timestamps. Fields that capture
_when_ something happened cannot be added retroactively. Everything else is refactoring, and 22 weeks
is enough runway to refactor.

Two judgement calls worth naming explicitly:

1. **`ReviewLog`** (a row per review) is in the data model. It costs some storage and one extra write
   per card, and it is the only way "weak topics from grading history" can work at all. Cut it and
   Workflow F loses its best feature — and by the time you want it back, the history will not exist.
2. **No feature flags, no component library, no settings framework.** One user, so all three would be
   pure overhead. These are all cheap to add later, so the cost of omitting them is genuinely low.

### Added during Workflow B — ratify or overturn

**Two dependencies** (`dexie` runtime, `fake-indexeddb` dev), both MIT, neither with a network call or a
paid tier. You approved both before they were added.

**Eight data-model decisions**, each of which existed as an ambiguity in the written contract. All are
in `BUILD_GUIDE.md` §4 with their reasoning, and each has a test that fails if it is changed:

| Decision                                                       | Why it was needed                                                                                                                                   | Cost to reverse later                                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `repetitions` counts **graduated** reviews only                | Otherwise the Workflow B definition of done ("Good four times → ~15 days") is false, and the two readings of §6 disagree                            | **Free now, moderate later** — it is derived state, but changing it re-schedules every card in her database         |
| A lapse **zeroes `intervalDays`**                              | Mastery is `intervalDays >= 21`, so a stale 38 would report a just-failed card as mature                                                            | **Free** — one line, and the next review corrects everything                                                        |
| Mastery is `learningStep === null && intervalDays >= 21`       | Cannot be true mid-learning by any route                                                                                                            | **Free** — derived on read, never stored                                                                            |
| **Hard repeats the step; Easy graduates immediately**          | The contract fixed the steps but not how q=3 and q=5 traverse them. Easy must diverge from Good on a _fresh_ card or the fourth button is arbitrary | **Free-ish** — changes only future reviews, not history                                                             |
| A new card is **due immediately** (`nextReview = now`)         | Waiting a minute to review a card she just wrote is a bad first thirty seconds, and it disagreed with `resetCardProgress`                           | **Free** — one line in `createCard`, but it changes the first thing she sees                                        |
| Day-scale intervals **snap to the 04:00 study day**            | `now + n days` silently gains a day for an evening studier                                                                                          | **Free** — a constant in one function, but it changes what she sees tomorrow                                        |
| `learningStep` names the step being **waited on**              | Keeps `schedule` a pure function of `(state, grade, now)`; the alternative needed a clock comparison inside the scheduler                           | **Free** — internal meaning only                                                                                    |
| Review session is a **route**, not mode state                  | A hard refresh mid-session is realistic on iPad; a route resumes from the database                                                                  | **Cheap** — it is a UI shape, not data                                                                              |
| The queue **freezes membership but chooses against the clock** | Deciding "is it due again" at grade time always answers no (`nextReview > now` is guaranteed), so a 1-minute learning step never arrived            | **Free** — internal to the session, no stored state                                                                 |
| **`ReviewLog` has no `updatedAt`/`deletedAt`** (append-only)   | It is never mutated, so both fields would be lies — and a last-write-wins merge on it would lose history                                            | **Free now, expensive later** — Workflow S must merge it union-only, and it is the kind of rule that gets forgotten |

**One correction:** `CLAUDE.md` and `docs/ai/change-data-model.md` said "`updatedAt` on every synced
record". That was wrong once an append-only table existed, so both now say "every **mutable** synced
record" and name `ReviewLog` as the exception. If you would rather `ReviewLog` carried the fields for
uniformity, say so — but the union-only merge rule has to stay either way.

**One thing I did not decide, and should flag:** the request described the shipped EF formula as
producing **Again −0.90**, but `EF + (0.1 − (5−q) × (0.08 + (5−q) × 0.02))` gives **−0.80** (it is the
standard SM-2 expression, and the other three grades match your figures exactly: Hard −0.14, Good 0.00,
Easy +0.10). The formula as written in `BUILD_GUIDE.md` §6 and ADR 0003 is implemented, and the tests
assert its actual output: 2.5 → 1.7 → 1.3 (floored). If you intended −0.90, the inner term has to
change, and that is an ADR-level change to a scheduling constant — so it is your call, not mine.

---

## D. Decisions I deliberately deferred

Not oversights — these are cheap to add later and expensive to guess now.

| Deferred                                | Why                                                                                                         | Revisit when                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **FSRS scheduler**                      | Better retention-per-review than SM-2, but a bigger algorithm. The `ReviewLog` design keeps this reachable. | After a month of real review data exists to compare against.                                   |
| **E2E tests (Playwright)**              | No test surface worth automating until the app exists.                                                      | After Workflow A produces installable screens.                                                 |
| **Multi-device conflict UI**            | Last-write-wins is sufficient for one user with two devices.                                                | If she ever sees a card "come back" after deleting it — that is the signal the merge is wrong. |
| **Sharing with friends**                | Would change auth (D2), the rules, and the data model.                                                      | If she asks. Say no to "just make it public" — it is a rewrite, not a flag.                    |
| **CSV export**                          | JSON is enough for backup/restore.                                                                          | If she wants to open cards in a spreadsheet.                                                   |
| **Accessibility audit beyond contrast** | Contrast is done and computed. Screen-reader work matters less for a one-user app.                          | If the app is ever shared.                                                                     |
| **Offline OCR model tuning**            | Tesseract parameters matter less than telling her to paste text or use her phone's own text recognition.    | If she actually relies on photo OCR.                                                           |
| **Analytics / telemetry**               | Would break the privacy stance and add a network dependency.                                                | Never, unless she asks to see her own usage.                                                   |

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

| #                  | Status                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1 — push backend  | ✅ Closed. No backend; notifications in-app only ([ADR 0006](adr/0006-in-app-notifications-only.md)).                                                                                                                                            |
| D1b — cloud sync   | ✅ Closed: yes. Google Sign-In, Firestore, owner-only rules, **Workflow S**.                                                                                                                                                                     |
| D2 — auth          | ✅ Closed: Google, one email. You put the email in `.env` + the rules file.                                                                                                                                                                      |
| D3 — exam date     | ✅ Closed: **Fri Feb 26, 2027 — 156 days.** Ordering in `BUILD_GUIDE.md` §9.                                                                                                                                                                     |
| D4 — hosting       | ✅ Closed: **Vercel**.                                                                                                                                                                                                                           |
| D5 — install       | ✅ Closed: **yes — Share → Add to Home Screen on iPadOS**, prompted first, with a skip. Two taps, no app store, no download; the only ITP-exempt configuration. Laptop: plain tab. ([ADR 0008](adr/0008-add-to-home-screen-on-ipad.md))          |
| D6 — does she know | ✅ Closed: **no, it's a surprise.** Reveal is a deliverable (`BUILD_GUIDE.md` §9.5).                                                                                                                                                             |
| D7 — deck taxonomy | ✅ Closed. Verified against the official PRC program.                                                                                                                                                                                            |
| D12 — sync default | ✅ Closed: **ON**, per your call — and it stays the safety net if she skips the Home Screen prompt or uses a Safari tab.                                                                                                                         |
| D8 — cadence       | ✅ Closed: idle nudge **+10 min**, max **2** per session, **quiet hours off** — she studies late, so the default would have silenced every nudge she could receive.                                                                              |
| D9 — night mode    | ✅ Closed: **keep**.                                                                                                                                                                                                                             |
| D10 — font         | ✅ Closed: **Quicksand**.                                                                                                                                                                                                                        |
| D11 — icon         | ✅ Closed: **generated bow placeholder**, swappable if she ever picks one.                                                                                                                                                                       |
| D13 — backup       | ✅ Closed: **manual export only**, no nag.                                                                                                                                                                                                       |
| D14 — OCR fallback | ✅ **Resolved, split by device.** iPad: solved by Live Text, no code. **Laptop: nothing copies out**, so it is the only device needing a fix. Not needed for the reveal (iPad-first). Order: fix the copy, then measure, then consider building. |
| D15 — reveal       | ✅ Closed: **mid-October / early November**, which moves the reveal ahead of F, S and G.                                                                                                                                                         |

**The next thing I need is a go-ahead.**

The iPad risk is now handled at the source rather than mitigated: the Home Screen install is exempt from
ITP, so her local data becomes durable instead of relying on sync to repair the damage. Sync and export
stay in the plan for the cases where she skips the prompt or works from a Safari tab.
