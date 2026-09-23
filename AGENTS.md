# AGENTS.md

Tool-agnostic entry point for AI coding agents. **If your tool reads `CLAUDE.md`, read that instead —
it is the canonical file and this one is only a pointer.**

- [`CLAUDE.md`](CLAUDE.md) — project overview, the two AI boundaries, commands, architecture,
  constraints, design rules, security rules.
- [`docs/ai/README.md`](docs/ai/README.md) — index of task runbooks and the ground rules that apply to
  all of them.
- [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md) — the plan of record, including the closed decisions in
  §2. Do not silently diverge from them.
- [`docs/CRITIQUE.md`](docs/CRITIQUE.md) — why the plan looks the way it does, including the six
  blocking flaws that were fixed. Read once before making architectural suggestions.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — the non-negotiables, and how to review an agent-authored
  change.

## The short version

1. **The shipped product has no LLM.** OCR plus a deterministic parser. Do not add a model call.
2. **Local-first.** IndexedDB is the source of truth; the network is optional.
3. **Timestamps are epoch milliseconds. Never hard-delete a synced record.**
4. **Any data-model change gets a Dexie version bump and a tested migration.** There is no undo on her
   phone.
5. **Never weaken a check to make the run green.** Report failures honestly.
6. **When a runbook exists, follow it. When the code and a doc disagree, the code wins** — then fix
   the doc.

## Claude Code users

Slash commands mirror the runbooks: `/add-feature`, `/add-component`, `/write-tests`,
`/change-data-model`, `/add-notification`, `/cleanup`, `/pre-pr`.
