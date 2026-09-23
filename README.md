# StudyBao

A study companion for PNLE review: flashcards with real spaced repetition, a Pomodoro timer, a lesson
tracker, and in-app attention nudges. Free tools only. Coquette pink & white.

Built for one person, on an iPad and a Windows laptop, with limited attention span and a real exam
date. No backend. On iPad it runs as a Home Screen Web App (two taps — no app store) because that is
the only configuration WebKit exempts from its 7-day storage deletion.

## Status

**Workflow A complete: the app shell is built.** It installs, works offline, has the contrast-checked
design system and all the shared primitives, and every check is green (typecheck, lint, format, 76
tests at ~97% line coverage, production build with a service worker).

**No features are wired up yet.** Cards, the timer and the lesson tracker are honest empty states
waiting on Workflows B–G. See the DAG in [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md) §4.

```bash
npm install
npm run dev          # http://localhost:5173
npm run test:coverage
npm run build && npm run preview   # required to exercise the service worker
```

## Read these

| Document                                                       | What it is                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)                       | **Start here.** Every decision the repo needs, with the six that actually block work marked.                     |
| [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md)                   | The plan of record. Feature set, closed decisions, tech stack, workflows A–H, data model, design system.         |
| [`docs/reference/pnle-scope.md`](docs/reference/pnle-scope.md) | The official PRC five-part exam scope, transcribed from the primary source. Drives the deck taxonomy.            |
| [`docs/CRITIQUE.md`](docs/CRITIQUE.md)                         | Line-by-line review of the original plan: six blocking flaws, verified technical corrections, and what was kept. |
| [`CLAUDE.md`](CLAUDE.md)                                       | Constraints for anyone (human or AI) changing this repo.                                                         |
| [`docs/ai/README.md`](docs/ai/README.md)                       | Task runbooks.                                                                                                   |
| [`docs/adr/`](docs/adr/README.md)                              | The five decisions that are expensive to reverse.                                                                |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                           | The non-negotiables, and how to review an agent-authored change.                                                 |

## What it does

- **Flashcards** — manual CRUD by subject/topic, SM-2 with sub-day learning steps, Again/Hard/Good/Easy
  grading, cram mode driven by her exam date.
- **Ingest** — paste text, PDF, or a photo of her notes; a deterministic parser proposes cards and
  routes everything it could not parse to a "Needs Review" queue. Nothing is silently dropped.
  No LLM (see [ADR 0004](docs/adr/0004-no-llm-in-runtime.md)).
- **Pomodoro** — configurable intervals, auto-cycling, session logging, wall-clock accurate.
- **Lesson tracker** — subjects, deadlines, status; calendar and list views.
- **Push notifications that arrive with the app closed** — session-end and idle nudges, a daily streak
  reminder, quiet hours, and a rotating bank of warm messages.
- **Dashboard** — streaks, cards mastered per subject, weak topics surfaced from review history.

## Non-negotiables

1. Works offline. IndexedDB is the source of truth; the network is optional.
2. No LLM in the shipped product.
3. Free tools only — no paid tier, no API key, no billing account.
4. Warm and encouraging, never clinical, never guilt-inducing.
5. Backups exist. Local-first without export is one cleared browser away from losing everything.

## Getting started

Requires Node 22+.

```bash
npm install
cp .env.example .env   # only needed once cloud sync or push is wired up
npm run dev
```

Service workers and push notifications do **not** work under `npm run dev`. Use
`npm run build && npm run preview`, on a real device over HTTPS, to test anything PWA-related.

## License

Private, personal use. Not for redistribution.
