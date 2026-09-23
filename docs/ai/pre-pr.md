# Pre-PR / hand-off check

Run before pushing a branch, before asking a human to review, and before any deploy. "Done" means
this list passed, not that the code looks right.

## 1. Run the checks — all of them, in order

```bash
npm run typecheck      # tsc --noEmit
npm run lint:check     # ESLint, no fix
npm run format -- --check || npx prettier --check .
npm run test:run
npm run build          # must produce a service worker and a manifest
```

Every one must pass. If one fails, fix the cause. **Never** disable a rule, add `@ts-ignore`, skip a
test, or lower a threshold to make the run green. If a check is genuinely wrong, say so and propose
changing the check in a separate, explicit change.

## 2. Walk the self-review checklist **against the actual diff**

Run `git diff main...HEAD` and read it. Do not answer from memory.

- [ ] Every changed file is one I intended to change. No stray edits, no debug leftovers, no
      commented-out code.
- [ ] No `console.log`, no `debugger`, no `TODO` without an issue.
- [ ] No secrets, tokens, or private keys. `.env` untouched and gitignored.
- [ ] No new dependency without justification — and none that requires an API key, has a paid tier, or
      makes a runtime network call.
- [ ] No runtime LLM call (see `CLAUDE.md`, Boundary 1).
- [ ] New/changed pure logic has tests, including the failure cases.
- [ ] If the data model changed: Dexie version bumped, migration written **and tested** with
      pre-existing data.
- [ ] If the data model changed: `updatedAt` / `deletedAt` handled, and no hard deletes introduced.
- [ ] If push behaviour changed: quiet hours and cadence caps still hold, endpoints still authenticated.
- [ ] Empty states exist for any new screen.
- [ ] User-facing strings match the voice in `BUILD_GUIDE.md` §5.
- [ ] Colour values used are existing theme tokens, and any new token meets 4.5:1 body / 3:1 large.
- [ ] Nothing newly requires the network to function on the study surfaces.

## 3. Test it like she will

- Phone viewport (375px), one-handed.
- **With the network disabled** — the study surfaces must work.
- Production build via `npm run preview`, not `npm run dev` (service worker behaviour differs).
- If the change touches push, the timer, or install: on a real device.

## 4. Report honestly

In the hand-off message, state:

1. What changed and why (one paragraph, no marketing).
2. What you verified, and **how**.
3. What you did **not** verify — and why. (e.g. "not tested on real iOS hardware")
4. Any check you could not run.

Claims must be traceable to something you actually ran. "Should work" is not a verification.

## 5. Update the docs in the same change

- New pattern or a changed constraint → update `CLAUDE.md` or the matching runbook.
- Non-obvious decision → add an ADR in `docs/adr/`.
- Data model change → `BUILD_GUIDE.md` §6.
- If a runbook is now wrong, fix it here. Stale runbooks are worse than none, because agents trust
  them.
