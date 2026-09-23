# Architecture Decision Records

Short, dated records of decisions that are expensive to reverse. One file per decision, in the format
of [`0001-local-first-with-indexeddb.md`](0001-local-first-with-indexeddb.md).

| # | Decision | Status |
| ---------------------------------------------------------------- | -------- |
| [0001](0001-local-first-with-indexeddb.md) | Local-first storage with IndexedDB, optional Firestore sync | Accepted |
| [0002](0002-push-architecture-and-scheduler.md) | Push architecture: pre-schedule then cancel, with our own cron | Superseded by 0006 |
| [0003](0003-sm2-scheduler-and-learning-steps.md) | SM-2 with sub-day learning steps, epoch-ms scheduling | Accepted |
| [0004](0004-no-llm-in-runtime.md) | No LLM in the shipped product | Accepted |
| [0005](0005-auth-google-single-user.md) | Auth: Google Sign-In, one allow-listed email | Accepted |
| [0006](0006-in-app-notifications-only.md) | In-app notifications only: no backend, no push | Accepted |
| [0007](0007-browser-only-no-install.md) | Browser-only, no installation — sync + export as the safety net | Accepted |

## When to write one

Write an ADR when a decision is **expensive to reverse** or **likely to be re-litigated**:

- adding, removing, or replacing a dependency that the architecture leans on
- changing the data model's shape or its sync contract
- anything that changes the security boundary
- anything that changes the notification contract (trigger shape, cadence, quiet hours)
- any decision recorded in `docs/BUILD_GUIDE.md` §2 that you believe is wrong

Do **not** write an ADR for: a component's props, a styling choice, a folder name, or a refactor.
Those are just code.

## Format

```markdown
# ADR 000N — Title in the imperative or as a noun phrase

- **Status:** Proposed | Accepted | Superseded by ADR 000M
- **Date:** YYYY-MM
- **Supersedes:** what this replaces, if anything

## Context
What is true about the situation that forces a decision. Facts, constraints, and the options on the
table. No conclusion yet.

## Decision
One or two sentences, in bold, then the specifics that follow from it.

## Consequences
### Good
### Bad / cost
Both sections are mandatory. An ADR with no downsides is an advertisement, not a decision record.

## Alternatives considered
Each with the reason it was rejected.
```

## Rules

- ADRs are **immutable once accepted**. To change a decision, add a new ADR with status `Accepted` and
  mark the old one `Superseded by ADR 000N`. Never rewrite history.
- Number sequentially. Never renumber.
- The **Consequences → Bad / cost** section is the most valuable part. Do not skip it.
- Cross-link the ADR from `CLAUDE.md` or the relevant runbook so it is actually found.
