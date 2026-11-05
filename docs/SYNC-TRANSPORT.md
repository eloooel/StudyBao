# Prompt — Workflow S, milestone 2a: the Firestore transport and its rules

Hand this to a fresh agent. **The feature stays off.** `VITE_ENABLE_CLOUD_SYNC` stays `false`, no UI
ships, and nothing about her app may change. What is being built is the part that can be proven without
her, so that turning it on later is a switch rather than a leap.

---

You are picking up **StudyBao**, a PNLE study app for one person. Her exam is **Friday 26 February
2027**. The app is live and she uses it.

## Read first, in this order

1. [`docs/SYNC-MERGE.md`](SYNC-MERGE.md) — the merge unit's spec. It is **already built and tested**;
   your transport sits behind it and must not duplicate any of its logic.
2. `src/sync/lib/merge.ts` and its test file — the six cases, the tombstone tie-break, and the
   `seededAt` write-once rule.
3. [`docs/adr/0001-local-first-with-indexeddb.md`](adr/0001-local-first-with-indexeddb.md) (sync is the
   second copy, never the source of truth), [`docs/adr/0005-auth-google-single-user.md`](adr/0005-auth-google-single-user.md)
   (one allow-listed email), and `CLAUDE.md`'s Security rules.
4. `src/pwa.config.ts` — `globIgnores` is the pattern you will be extending.
5. `.env.example` — the contract for every `VITE_*` variable.

## The goal

Make her data survive a wipe: a Firestore transport, the security rules that are **the entire security
boundary**, and emulator tests proving both.

## Hard boundaries — read these twice

- **The flag stays off.** `VITE_ENABLE_CLOUD_SYNC=false` remains the default and the shipped value. With
  it off, the transport must be **completely inert**: no import of the Firestore SDK, no connection, no
  log line, no constructor.
- **No UI.** No status surface, no "not saved since…", no buttons. Milestone 2b owns all of that.
- **No change to `src/db/`, any component, or any route.** The study loop is untouched.
- **Sync is fire-and-forget.** It must never block or slow a review. A failed sync is reported to a
  caller, never thrown into the render path.
- **The rules are the boundary, because the client config is public.** `apiKey` in a Firebase web config
  is not a secret — that is why `CLAUDE.md` says the rules file is the whole security model.

## What to build

### 1. The dependency — and the two ways it bites this repo

Add **`firebase`** as a runtime dependency and **`@firebase/rules-unit-testing`** as a dev dependency.
This is already sanctioned: sync talks to Firestore directly from the client (ADR 0001/0006), there is no
API key, no backend, no server-side secret.

**Bite one — the install.** This repo pins Vitest to **v3 deliberately**, because v4/v5 declare optional
browser peers that make npm 10 crash with `Cannot read properties of null (reading 'edgesOut')`, and a
lockfile made with `--legacy-peer-deps` then fails `npm ci`, which is what CI runs. So:

```bash
npm install firebase --cache .npm-cache
npm install -D @firebase/rules-unit-testing --cache .npm-cache
npm ci                                  # must also succeed — CI runs this
```

**Confirm both `npm install` and `npm ci` succeed before anything else.** If the new dependency drags in
a peer that breaks the pin, stop and report; do not paper over it with `--legacy-peer-deps`.

**Bite two — the bundle.** Her device is a **3 GB iPad** and this is an offline app. Firestore is large,
and a lazy chunk that gets precached is _not_ lazy: it is downloaded on first load and cached forever.
So:

- **every** Firestore import goes behind a single dynamic `import()` reached only when the flag is on;
- add the sync chunk to **`globIgnores` in `src/pwa.config.ts`**, next to `/pdfjs/**` and `/ocr/**`.

`node scripts/report-precache.mjs` must read **88 entries** before and after. A delta of +1 or more means
the sync chunk leaked into the precache.

### 2. `src/sync/firestore/client.ts` — initialisation only

- Lazy `import('firebase/app')`, `import('firebase/firestore')`, `import('firebase/auth')`.
- Config from `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_AUTH_DOMAIN`,
  `VITE_FIREBASE_APP_ID` — already in `.env.example`.
- **Absent config must not throw.** Locally the flag is off, so absence is the normal case. The client
  should be unconstructable rather than broken.
- Support connecting to the **emulator** when a host is configured, so tests can point at it. Use a
  dedicated variable and document it in `.env.example` — and **never** give a `VITE_*` variable a name
  containing `KEY`, `SECRET` or `TOKEN`, because a name like that invites exactly the mistake of putting
  a real secret in a client bundle.

### 3. `src/sync/firestore/transport.ts` — the seam

```ts
export interface Transport {
  pull(): Promise<PulledRows>
  push(batch: MergeOutcome<unknown>[]): Promise<PushResult>
}
```

- One document per record at `users/{uid}/{table}/{id}`. Ids are already UUIDs.
- **`pull` treats remote rows as untrusted input.** Validate each row's shape against the database types
  before it can reach a repository — a row missing `updatedAt` is rejected and reported, never written.
  A remote row that would cost her data locally is the worst failure this whole workflow can produce.
- **`push` batches.** Firestore allows 500 writes per commit; use it, and report per-batch results so a
  partial failure is visible rather than reporting the whole transport as down.
- **No conflict logic here.** It calls `mergeByUpdatedAt` / `mergeReviewLogs` / `mergeSettings` and
  writes the result. If `mergeReviewLogs` returns `conflicts`, return them for the caller — do **not**
  resolve them.
- **Never stamp a timestamp.** Every `updatedAt` comes from the data, exactly as in the merge unit.

### 4. `firestore.rules` — the whole boundary

Owner-only on **one** allow-listed email. Never open, never a wildcard, never "any authenticated user".

The allow-listed email is a **rules constant or a document**, not `VITE_ALLOWED_EMAIL` — a client value
cannot authorise anything, and reading authorisation from the client is the mistake this file exists to
prevent.

### 5. The guard I owe from milestone 1

`backup.test.ts` already asserts `BACKUP_TABLES` covers every table in the schema. `sessions` and
`lessons` were added to this database after the fact, so the same drift will happen to sync.

Add a test asserting **the merge's synced-table list equals the database's table set**, so a seventh
table cannot be added to the schema and silently forgotten by sync.

## Tests — and the three that must go red

**Rules tests, against the emulator.** Java 24 and the `firebase` CLI are both present on this machine,
so `firebase emulators:exec --only firestore` works against a `demo-` project with no account and no
credentials. The three cases `BUILD_GUIDE.md` §9 names:

1. the **allow-listed** user reads and writes;
2. an **anonymous** client is denied;
3. a **different authenticated user** is denied.

**Transport tests:** a round-trip (push a set, pull it into an empty side, and assert the merged result
equals the original) including a `ReviewLog` union and a tombstone; a malformed remote row is rejected
rather than written; an empty remote is the first-sync case.

**Flag-off inertness, asserted on the built output rather than on intent:** with the flag off, the entry
chunk must not contain the Firestore SDK. Check `dist/assets` after a build.

**Red checks, each restored byte-identical and reported:**

- widen the rules to allow **any authenticated user** → case 3 must fail;
- collapse the batch loop to a single write → the batching test must fail;
- stop validating pulled rows → the malformed-row test must fail.

Each rules test must be run **once more with the rules reverted** to prove it can fail at all. A security
test that has never been red is a test you do not know the shape of.

## CI — a judgement you must make and report

The rules tests need an emulator, which needs Java and takes minutes. **Do not add them to CI in this
milestone.** Keep the gate fast and green; wire them as a separate script (`npm run test:rules`) and say
in your PR that the security boundary is currently verified locally rather than by CI.

If you believe that is wrong, say so with evidence — but do not silently add three minutes and a Java
dependency to a gate that has been green for twenty-odd PRs, because a flaky gate is worse than no gate.

## Verify

```bash
npm run typecheck && npm run lint:check && npx prettier --check .
npm run test:coverage            # must stay green, and the existing suite untouched
npm run build
node scripts/report-precache.mjs # 88 entries, delta 0
firebase emulators:exec --only firestore "npm run test:rules"
```

**One vitest run at a time** — `coverage/` is shared scratch and concurrent runs clobber it. **Check
`git status` first, stage only your own files by path, never `git add -A`, never `--no-verify`.** One
branch, one PR.

## What you cannot verify, and must say so

- **The emulator is not Firestore.** It is a faithful local emulator, not the deployed service; nothing
  here proves the real project behaves the same.
- **No real project was touched**, so the rules were never exercised against the deployed service and
  the allow-listed email was never used for real.
- **Nothing on a device.** No sync ran on her iPad, so "she switches devices and her cards are there" is
  untested — that is milestone 2b's rehearsal, and it is the point of the whole workflow.
- Whether the Firestore chunk's size is acceptable **on a 3 GB iPad** — you can measure the bytes, not
  the experience.

## Report back

1. Whether `npm install` **and** `npm ci` both still succeed — with the exact peer situation you hit.
2. The precache entry count before and after, and the built size of the sync chunk.
3. The three rules results, and the **reverted-rules** run showing each can fail.
4. Your CI judgement and its reasoning.
5. Anything you found wrong in the merge unit or the rules that you did **not** fix silently.
