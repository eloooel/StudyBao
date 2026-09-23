# Cleanup

A review pass over a branch or a folder that **only deletes and simplifies**. Use it when a feature
has landed and the code around it has accumulated leftovers.

**Do not add features, rename for taste, or reformat during a cleanup pass** — mixing cleanup with
behaviour changes makes both unreviewable. If a deletion would change behaviour, it was not cleanup:
revert it and raise it as a bug or a feature discussion instead.

## What to hunt, in order of payoff

### 1. Dead code

- Exports nothing imports. Run `npx ts-prune` or just grep each export name.
- Files nothing routes to or imports.
- Props, params, and state fields nothing reads.
- Branches that cannot be reached (`if (x)` where `x` is a constant or a type-level guarantee).

### 2. Speculative abstraction

This is the main disease of AI-authored code. Hunt for:

- A function with one caller, extracting behaviour that has not varied twice yet.
- A config object with one field, or an options bag with one option ever passed.
- A generic `<T>` used with exactly one type.
- A wrapper that only forwards its arguments.
- A "strategy"/"provider"/"factory" with a single implementation.
- A Zustand store holding one boolean.

Rule: **the third consumer justifies the abstraction, not the imagined second.**

### 3. Duplication that should collapse

- The same date/day-boundary logic in two files — the 04:00 streak boundary in particular. It must
  live in exactly one place, because two copies will disagree and her streak will be wrong.
- Two components that differ only by the words in them.
- A type declared in three places.

### 4. Leftovers from the last change

- Commented-out code. Delete it; git remembers.
- `TODO` / `FIXME` without an owner or an issue.
- Unused imports and unused dependencies (`npx depcheck`).
- Empty folders, empty files, placeholder components.
- Console logs, debug flags, test-only branches in production paths.

### 5. Comment noise

Delete comments that restate the code. Keep comments that explain **why**: a non-obvious constraint, a
platform workaround, a decision a reader would otherwise "fix". The comment on the iOS storage cap or
the SM-2 floor is load-bearing; `// increment counter` is not.

## Do not

- Do not delete anything you do not understand. Read the callers first.
- Do not "clean up" a file you are about to rewrite anyway.
- Do not touch `docs/` except to delete docs describing code you just deleted.
- Do not sweep the whole repo in one pass. One folder, or one branch's diff, per pass.

## Done when

- [ ] Deletions only — no behaviour changed, and the diff proves it.
- [ ] `npm run typecheck && npm run lint:check && npm run test:run` all still pass.
- [ ] Deleted code that had tests → deleted the tests too.
- [ ] No new files added.
- [ ] The diff is small enough to read in one sitting. If it is not, it was too many things.
