# Add a feature

Add a new feature folder, page, and route. Use for anything that gets its own screen or its own
domain concept (deck, timer, lesson, dashboard).

## 1. Read the canonical examples first

- The simplest existing page: `src/features/timer/pages/timer.page.tsx` **(pending Workflow A)**
- The router: `src/router.tsx` **(pending Workflow A)**
- The feature type file: `src/features/timer/types.ts` **(pending Workflow A)**

Do not write anything until you have read all three. Your output should be structurally
indistinguishable from them.

## 2. Create the folder

```
src/features/{name}/
├── components/     # only if this feature needs local components
├── hooks/          # use-{name}-data.ts, use-{name}-actions.ts
├── pages/          # {name}.page.tsx — Layer 1, thin
├── schemas/        # Zod schemas for any form in this feature
├── stores/         # only if there is feature-level UI state
├── lib/            # pure logic for this feature (unit-tested)
├── types.ts        # every type for this feature
└── {name}.test.ts  # tests for lib/ logic
```

Only create folders you will actually fill. An empty `stores/` is worse than no `stores/`.

## 3. Write `types.ts` first

Every interface for the feature lives here, including component prop types. No inline prop type
literals in component files.

## 4. Put pure logic in `lib/`

Anything with a rule in it (scheduling, parsing, aggregation, scoring) is a pure function in `lib/`
with a co-located test. If it needs `await`, a DOM API, or the database, it is not pure — keep it in
the hook, and make the *decision* it makes a pure function you can test.

## 5. Write the three layers

Copy the structure from the canonical page exactly:

- **Layer 1** `pages/{name}.page.tsx` — composes the hook and the view. Nothing else.
- **Layer 2** `hooks/use-{name}-data.ts` — aggregation. Talks to `src/db/repositories/*`.
- **Layer 3** `components/{name}-view.tsx` — pure JSX from typed props. No hooks, no DB calls.

## 6. Register the route

Add it in `src/router.tsx` in the same shape as its neighbours. Route components are lazy-loaded
like the rest — do not introduce a new pattern for one route.

## 7. Empty state is part of the feature

A brand-new install has no data. Build the on-theme empty state **in the same change**, in the
voice defined in `BUILD_GUIDE.md` §5. Do not ship a blank screen and "do empty states later" — they
are never done later.

## 8. Check

```bash
npm run typecheck && npm run lint:check && npm run test:run
```

Then walk the page on a phone viewport, and once with the network disabled if the feature reads or
writes data.

## Do not

- Do not add a route without an entry in the nav shell.
- Do not put card/deck/session data into a Zustand store. Dexie is the source of truth.
- Do not import `dexie` or `firebase/*` from a feature file. Go through `src/db/` and `src/sync/`.
- Do not add a feature flag. This app has one user; flags are for teams.
