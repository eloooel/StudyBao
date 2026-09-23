# AI Runbooks

Step-by-step procedures for the common tasks in this repo. They are **tool-agnostic**: use them with
any AI assistant, or follow them by hand.

| Runbook | Use when you want to… |
| ---------------------------------------------- | ------------------------------------------------------------ |
| [add-feature.md](add-feature.md) | Add a feature folder, page, and route |
| [add-component.md](add-component.md) | Add a UI component (shared or feature-local) |
| [write-tests.md](write-tests.md) | Add or fix tests, especially for pure logic |
| [change-data-model.md](change-data-model.md) | Add or change a Dexie table, field, or index |
| [add-notification.md](add-notification.md) | Add a notification trigger, message-bank entry, or nudge behaviour |
| [cleanup.md](cleanup.md) | Delete dead code, speculative abstraction, and leftovers |
| [pre-pr.md](pre-pr.md) | Get a branch ready to hand over |

> **Status note.** This repo is at the plan stage — `docs/BUILD_GUIDE.md` is the plan of record and
> the app is not scaffolded yet. Runbooks that name a canonical example file create a chicken-and-egg
> problem, so each one below names the file it expects **and** marks it `(pending Workflow A)`. The
> first thing Workflow A does is build those reference files; until then, treat the named file as the
> thing you are about to write, not the thing you are copying. Once a reference file exists, remove
> its marker.

## How to use with your AI tool

- **Claude Code** — each runbook has a matching skill in `.claude/skills/`, invocable as
  `/add-feature`, `/add-component`, `/write-tests`, `/change-data-model`, `/add-notification`,
  `/cleanup`, `/pre-pr`.
- **Cursor** — reference the file in chat: `@docs/ai/add-feature.md implement the decks page`.
- **Copilot / ChatGPT / DSH / other** — paste the runbook contents into the prompt before describing
  the task.

## Runbook skeleton (write new ones in this shape)

```
# <Imperative title>

One sentence: what this procedure produces, and when to use it.

## Canonical examples        ← named real files to copy, per case
## Rules                     ← numbered; each rule states its why
## What deserves … / order   ← priority when you cannot do everything
## Commands                  ← exact commands
## Done when                 ← checkboxes that define "finished"
## Common mistakes           ← symptom → action
## Do not                    ← the specific ways this task goes wrong
```

Sections are droppable; the shape is not. A runbook without **Done when** is a description, not a
procedure.

## Ground rules (apply to every runbook)

1. **Copy the canonical example, don't invent.** Each runbook names reference files. If your output
   looks structurally different from the reference, it is wrong.
2. **The repo's real config wins over any doc.** If a runbook and the code disagree, trust the code
   and then fix the runbook.
3. **Read [`../../CLAUDE.md`](../../CLAUDE.md) first.** Runbooks cover procedure; CLAUDE.md covers
   constraints and the AI boundaries.
4. **Never add a runtime LLM call.** Ingest is OCR + deterministic parsing, by design and by ADR.
5. **Never widen the network surface** — no new external API, no new third-party script, no CDN
   dependency — without asking first. Offline capability is a feature, not a nice-to-have.
6. **Anything that writes to the database on her phone needs a migration plan**, because there is no
   undo and no support line.

## Two conventions worth keeping

**Write the rule into the error message.** When a constraint is machine-checkable (ESLint, a test, a
build check), the failure output itself should say what to do and why, and name the ADR. A developer
or agent hitting the error should not need to find this directory. Example:

> `Don't import dexie outside src/db/. Use a repository from src/db/repositories/. See ADR 0001.`

**Restate one invariant per skill, no more.** Each `SKILL.md` in `.claude/skills/` is a discovery shim,
not a second copy of the runbook: YAML frontmatter whose `description` is a *trigger condition*, one
sentence pointing at the runbook, and at most one restated invariant. `name` must equal the directory
name and the runbook filename stem — that identity is the entire mechanism. If a skill grows past
~8 lines, the procedure has leaked into it and the two copies will drift.
