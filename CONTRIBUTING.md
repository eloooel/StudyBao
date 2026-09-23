# CONTRIBUTING

How to make a change in this repo without breaking someone's exam prep. This is a single-maintainer
project with a single non-technical user, so the rules are about **safety and reversibility**, not
about team process.

## Before you start

1. Read [`CLAUDE.md`](CLAUDE.md) — constraints and the two AI boundaries.
2. Read [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md) §2 — the closed decisions. Do not silently
   diverge from them.
3. Find the matching runbook in [`docs/ai/`](docs/ai/README.md) and follow it.

## The non-negotiables

| Rule | Why |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| No LLM call in the shipped runtime | Hallucinated flashcards are memorized. See [ADR 0004](docs/adr/0004-no-llm-in-runtime.md). |
| No dependency with a paid tier, API key, or runtime network call | "Free tools only" is a hard constraint, and the app must work offline. |
| All DB access via `src/db/`; all Firestore access via `src/sync/` | One place to audit persistence and sync. |
| Timestamps are epoch milliseconds; never hard-delete a synced record | Hard deletes are resurrected by the other device. |
| Any data-model change gets a Dexie version bump **and a tested migration** | There is no undo on her phone. |
| Never weaken a check to get green | A failing test is a defect report. |
| No backend, no push service, no server-side secret | [ADR 0006](docs/adr/0006-in-app-notifications-only.md) — notifications are in-app only. Adding one back is a decision, not a detail. |
| Never commit secrets; `.env` is gitignored with `.env.example` as the contract | Obvious, and still the most common way personal apps get owned. |
| Push respects quiet hours and the cadence caps | A study app that pings at 1 a.m. gets deleted. |

## The day-to-day

```bash
git switch -c feat/short-description
# ... work ...
npm run typecheck && npm run lint:check && npm run test:run && npm run build
```

Then run the full checklist in [`docs/ai/pre-pr.md`](docs/ai/pre-pr.md). It is short and it catches
most of the things that actually go wrong here.

## Commit messages

Conventional-commit prefixes, imperative mood, one logical change per commit:

```
feat(flashcards): add sub-day learning steps to SM-2
fix(timer): derive remaining time from wall clock
docs(ai): add the push-trigger runbook
chore(deps): bump dexie to 4.x
```

The body, when there is one, says **why** — the code already says what.

## Documentation debt

A change is not complete until the docs match it:

- New or changed constraint → `CLAUDE.md`
- New or changed procedure → the runbook in `docs/ai/`
- Expensive-to-reverse decision → an ADR in `docs/adr/`
- Data model change → `docs/BUILD_GUIDE.md` §6

Stale docs are worse than missing docs, because agents trust them.

## Testing expectations

- Pure logic in `lib/` — **tested**, and 100% branch coverage on the scheduling, parsing, merge, and
  stats modules.
- UI — tested only where there is behaviour worth asserting. Do not test Tailwind classes.
- Migrations — tested against seeded pre-existing data.
- Push — verified manually on a real device; say so honestly when you could not.

## Reviewing an AI-authored change

If an agent wrote it, apply the same bar as any other change, plus:

- Check the diff for **deleted or weakened tests**, disabled lint rules, `@ts-ignore`, or a lowered
  coverage threshold. These are the failure modes of agent-authored changes here.
- Check for **invented APIs** — a plausible-looking function or config key that does not exist.
- Check for **scope creep** — files touched that have nothing to do with the task.
- Verify the claims in the hand-off message rather than trusting them. "Verified" should mean a command
  was run, on a real device where relevant.

## Deploying

Manual and deliberate. Deploy only from a green `main` after the pre-PR checklist, and confirm on a
real phone afterwards — a broken deploy here is not a cosmetic problem, it is the loss of her study
tool the week before an exam.
