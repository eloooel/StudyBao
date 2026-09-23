# CLAUDE.md

Guidance for AI coding agents (Claude Code, Cursor, Copilot, DSH, or anything else) working in this
repository. Humans should read it too — everything here applies to you.

**Read this file, then [`docs/ai/README.md`](docs/ai/README.md), then the runbook that matches your
task.** The plan of record is [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md); open questions for the human
are in [`docs/DECISIONS.md`](docs/DECISIONS.md); the reasoning behind the plan is
[`docs/CRITIQUE.md`](docs/CRITIQUE.md).

---

## What this project is

A study companion for one person's PNLE (Philippine Nurse Licensure Examination) review. Flashcards
with SM-2 spaced repetition, a Pomodoro timer, a lesson tracker, and in-app attention nudges. Free
tools only, **no backend**. On iPad it runs as a **Home Screen Web App** — two taps in a Share sheet,
no app store — because that is the only configuration WebKit exempts from its 7-day storage deletion
([ADR 0008](docs/adr/0008-add-to-home-screen-on-ipad.md)). On the Windows laptop it is a plain tab.
Coquette pink & white visual identity.

The user is **one non-technical person**, on an **iPad** (as a Home Screen Web App) and a **Windows
laptop** (in a browser tab). That decides most trade-offs: offline-first beats server-first, a wrong
number is worse than a missing one, and anything that requires her to understand how it works is a
defect.

---

## The two AI boundaries (do not blur these)

**Boundary 1 — the shipped product contains no LLM.** No API keys, no model calls, no "AI feature".
Card generation is Tesseract.js OCR plus a deterministic pattern parser. This keeps runtime cost at
zero, keeps her notes private, works offline, and avoids inventing flashcards for a licensure exam.
Do not add a model call to the runtime. See [`docs/adr/0004-no-llm-in-runtime.md`](docs/adr/0004-no-llm-in-runtime.md).

**Boundary 2 — AI may be used to *develop* this repo, within the rules below.** You are the second
boundary. Your output is reviewed by a human before it reaches her phone.

**What you must not do without explicit approval:**

- Do not scaffold, rename, or restructure the project layout — this repo's plan is
  `docs/BUILD_GUIDE.md`, and phases are sequential by design.
- Do not add a dependency that has a paid tier, requires an API key, or phones home at runtime.
- Do not add a backend, a push service, an API key, or a server-side secret. [ADR 0006](docs/adr/0006-in-app-notifications-only.md)
  removed the backend deliberately: notifications are in-app only, and nothing fires while the app is
  closed. Reintroducing any of that needs an ADR and an explicit decision, not a quiet addition.
- Do not change the decisions closed in `BUILD_GUIDE.md` §2. If a decision is wrong, write an ADR in
  `docs/adr/` and ask — do not silently diverge.
- Do not touch the design-system palette values without checking contrast first (see below).
- Do not run the dev server, a build, or `npm install` in the background and leave it running.
- Do not commit secrets. `.env` is gitignored; `.env.example` is the contract.
- Do not use broad filesystem-wide search/exploration agents on this repository; it is small enough to
  read directly. If a task genuinely needs one, ask first.

**What you should do:**

- When asked to plan, ask about anything unanswered *before* planning, and surface improvements you
  find rather than silently applying them.
- Report failures honestly. Never work around a failing check to make output look green.
- Prefer deleting code to adding abstraction. No speculative generality.
- When a runbook exists for the task, follow it. If the runbook and the code disagree, the **code
  wins** — then open a change that fixes the runbook.

---

## Commands

```bash
npm install            # Install deps (also installs Husky hooks)
cp .env.example .env   # Fill in real values locally; never commit .env

npm run dev            # Vite dev server (http://localhost:5173)
npm run build          # tsc --noEmit + Vite production build + PWA service worker
npm run preview        # Serve the production build (required to test the service worker)
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint --fix
npm run lint:check     # ESLint, no fix (CI)
npm run format         # Prettier --write
npm run test           # Vitest watch
npm run test:run       # Vitest single run
npm run test:coverage  # Coverage (threshold enforced in vitest.config.ts)
```

Run a single test file:

```bash
npx vitest run src/features/flashcards/sm2.test.ts
```

**The service worker does not run under `npm run dev`.** Verify anything PWA-related with
`npm run build && npm run preview`, on a real device, over HTTPS (or a tunnel).

Path alias: `@` → `./src`.

---

## Architecture

### Layers

```
route (thin, Layer 1)
  └─ feature hook (Layer 2, aggregation, Dexie queries)
       └─ repository (src/db/repositories/*, all Dexie access)
            └─ Dexie (IndexedDB)  ← single source of truth
                 └─ (optional, WAN) sync → Firestore
```

Three-layer page pattern, same as any React app worth maintaining:

```tsx
// Layer 2 — data hook
function useDeckData() {
  const [decks, setDecks] = useState<Deck[]>([]);
  useEffect(() => { listDecks().then(setDecks); }, []);
  return { decks };
}

// Layer 3 — view: pure JSX, typed props, no DB calls, no hooks
function DeckView({ decks }: { decks: Deck[] }) { /* ... */ }

// Layer 1 — route component: thin composition
export default function DecksPage() {
  const { decks } = useDeckData();
  return <DeckView decks={decks} />;
}
```

### Feature folder layout

```
src/features/{name}/
├── components/   # Used only by this feature
├── hooks/        # use-*-data.ts, use-*-actions.ts
├── pages/        # Route components (Layer 1)
├── schemas/      # Zod schemas for forms (not generated)
├── stores/       # Feature-level Zustand stores (UI state only)
├── lib/          # Pure functions for this feature (sm2.ts, parser.ts)
├── types.ts      # All types for this feature, incl. component prop types
└── *.test.ts     # Co-located tests
```

Only promote a component to `src/components/ui/` once **three or more features** use it.

### State management

| Kind of state | Where |
| --- | --- |
| Card/deck/session data | **Dexie.** Never mirror it into Zustand — it will go stale. |
| Shareable/bookmarkable state | `useSearchParams()` |
| Auth (user, token) | `src/stores/auth.store.ts` |
| Global UI (modals, toasts) | `src/stores/ui.store.ts` |
| Feature UI (active tab, selection) | Feature Zustand store |
| Component-only | `useState()` |

### Hard constraints

- **All IndexedDB access goes through `src/db/`.** Feature code must not import `dexie` directly.
- **All Firestore access goes through `src/sync/`.** Feature code must not import `firebase/*`.
- **Time is epoch milliseconds in the database.** Format for display at the edge only. See
  `docs/ai/change-data-model.md`.
- **No `any`.** Use `unknown` and narrow.
- **No `console.log` in committed code.** Use the `src/lib/logger.ts` wrapper (and it must be silent
  in production builds).
- **No raw `fetch()` in feature code.** Use `src/lib/api-client.ts`.
- **The service worker only caches — it has no `push` handler.** Notifications never come from a
  server (ADR 0006), so there is no VAPID key, no subscription, and no permission prompt. If a task
  seems to need one, it is a scope change: write an ADR and ask first.

---

## Data & scheduling contracts

Full model in `BUILD_GUIDE.md` §6. The parts that are easy to get wrong:

- `nextReview` is **epoch ms**, not a date string, because learning steps are sub-day.
- `updatedAt` on every synced record; `deletedAt` for tombstones. **Never hard-delete a synced
  record** — hard deletes are resurrected by the other device.
- SM-2 grades map Again=0, Hard=3, Good=4, Easy=5. Ease factor updates on *every* grade and is
  floored at **1.3**. `q < 3` resets repetitions, records a lapse, and re-enters learning steps.
- A streak day rolls over at **04:00 local**, not midnight.
- Any new indexed field means a **Dexie version bump + migration test**. Read
  `docs/ai/change-data-model.md` first; there is no undo on her phone.

---

## Design system rules

Tokens live in `tailwind.config.ts` and `src/styles/theme.css`. The palette is **contrast-checked** —
do not "improve" a colour without re-checking WCAG AA (4.5:1 body text, 3:1 large text and icons).

- **Plum text on rose buttons.** White on `#F5A9B8` is 1.87:1 and fails. `#4A2E35` on `#F5A9B8` is
  6.49:1.
- **Sage (`#B7D7B0`) and dusty mauve (`#D9A7B0`) are fills, never text colours.** They are badge
  backgrounds with plum text on top.
- Body text ≥16px, line-height ≥1.5, never weight 300.
- Fonts are self-hosted via `@fontsource/*`. Never add a Google Fonts `<link>`.
- Bow/sparkle/ribbon icons appear on streak and achievement moments only.
- Microcopy is warm and playful, never clinical, never guilt-inducing. Read the voice section of
  `BUILD_GUIDE.md` §5 before writing user-facing strings.

---

## Testing

- Pure logic (`sm2.ts`, `parser.ts`, sync merge) is **unit-tested**. This is non-negotiable; it is the
  only defence against silently wrong scheduling.
- UI tests import from `@/test/render`, not directly from `@testing-library/react`.
- Do not test Tailwind classes, implementation details, or snapshots.
- Do not test the service worker's caching internals. Test the nudge decision instead — trigger
  evaluation, cadence caps, and quiet hours are pure functions, so test them there.
- Coverage threshold is enforced; see `vitest.config.ts`.

---

## Security rules

- `.env` is never committed. `.env.example` documents every variable.
- **There are no server-side secrets, because there is no server.** The one auth-shaped surface is
  Firestore (cloud sync, Workflow S): Firebase client config (`apiKey` etc.) is *not* a secret, so
  **the Firestore rules file is the entire security boundary**. Rules are owner-only on her
  allow-listed email, and are tested against the emulator (allowed user / anonymous / other
  authenticated user) before any deploy. Never open rules.
- Sync must stay **fire-and-forget**: Dexie is the source of truth, and a failed sync must never block
  or slow the study loop. But it is **on by default and per write** (D12) — it is the safety net if she
  skips the Home Screen prompt or works from a Safari tab. See the UX rules below, which are the
  authority.

---

## UX rules that are not negotiable

- **First run on iPadOS: prompt Share → Add to Home Screen, with a visible skip.** Framed as data
  safety — *"two taps, and it stops your notes from being cleared"* — with a screenshot of the Share
  sheet. Never the word "install", never a repeated wall. Detect standalone with
  `matchMedia('(display-mode: standalone)').matches || navigator.standalone`, and show it only on
  iPadOS. This is the one configuration WebKit exempts from its 7-day storage deletion, so it is
  functional, not decoration ([ADR 0008](docs/adr/0008-add-to-home-screen-on-ipad.md)).
- **It comes before sign-in, deliberately.** The Home Screen Web App keeps its own storage, separate
  from Safari's, so signing in first would mean signing in twice. Do not reorder these.
- **Then one tap and nothing else:** a single Google sign-in with a reason (*"sign in so your notes are
  safe and show up on your laptop too"*), straight into reviewing pre-seeded cards. No permissions, no
  tutorial wall, no empty state that asks her to create something first.
- **Tell her to use the Home Screen icon, not the Safari tab.** Separate containers mean two local
  copies that only sync reconciles, and the Safari one is the one that gets deleted.
- **Survive the local database being deleted at any time.** Empty IndexedDB plus remote data means
  restore automatically and silently, and never present it as a problem.
- **Expect to be signed out after an eviction** — ITP clears the auth session too. Detect "no local
  data, remote data exists" and lead with *"your notes are safe — tap to sign in and get them back"*.
  Never show empty-state onboarding in that situation; it reads as data loss.
- **A sync failure must be visible** ("not saved since…"). A silently broken sync is a data-loss bug,
  not an inconvenience.
- **Sync per write**, not on a timer — an eviction between writes loses whatever was not yet pushed.
- **Export/import is a first-class screen**, reachable in two taps. It is the only backup that does not
  depend on Google, the network, or a sync bug.
- **Never use a decrementing timer.** Derive elapsed time from `startedAt` and `Date.now()`.

---

## CI

GitHub Actions runs lint (tsc + eslint + prettier), test (vitest + coverage), and build. All must
pass. Deployment is manual and deliberate — this app runs on a real person's device mid-exam-prep, so
a broken deploy is not a cosmetic problem.
