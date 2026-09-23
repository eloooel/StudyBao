# Add a UI component

Add a component, either shared or feature-local.

## 1. Decide where it goes — this is the whole decision

| Used by | Location |
| ---------------- | ---------------------------------------------- |
| 1 feature | `src/features/{name}/components/` |
| 2 features | leave it in the first feature and import across, or duplicate it |
| **3+ features** | `src/components/ui/` |

Count real usages, not imagined ones. Promotion to `ui/` is a one-way door: once something is shared,
every feature is entitled to change it. Speculative sharing is how small apps become unfixable.

## 2. Read the reference first

`src/components/ui/Button.tsx` **(pending Workflow A)** — it is the reference for props shape,
`className` merging, `forwardRef`, variant naming, and disabled/loading handling. Mirror it.

Also read `src/components/ui/Card.tsx` for the container shape (radius, shadow, padding tokens).

## 3. Conventions

- One component per file. File name matches the component name in kebab-case
  (`progress-bar.tsx` → `ProgressBar`).
- Props interface named `{ComponentName}Props`, declared in the feature's `types.ts` (or exported
  from the component file only if it lives in `ui/`).
- No default exports except for route pages.
- Styling comes from theme tokens. **No raw hex values in component files.** If you need a colour
  that does not exist as a token, add the token (and check its contrast — see `CLAUDE.md`).
- Accept and merge `className` via the shared `cn()` helper, last.
- Every interactive element has a visible focus state and a touch target ≥44px. She uses this on a
  phone, often in the dark.

## 4. Accessibility baseline (not optional)

- Real `<button>` / `<a>` / `<input>` elements, not `<div onClick>`.
- Label every icon-only button with `aria-label`.
- Never encode meaning in colour alone — "mastered" is sage **and** a word.
- Text contrast: 4.5:1 body, 3:1 large text and icons. Sage `#B7D7B0` and mauve `#D9A7B0` are
  **fills only**; put plum text on them.

## 5. Microcopy

Any user-visible string follows the voice in `BUILD_GUIDE.md` §5: warm, playful, never clinical,
never guilt-inducing. If you write a string that sounds like a system message, rewrite it.

## 6. Check

```bash
npm run typecheck && npm run lint:check && npm run test:run
```

Visual check at 375px width (iPhone SE/13 mini class) and at desktop width.

## Do not

- Do not add a component library, a headless UI package, or a CSS-in-JS runtime.
- Do not add animation beyond what the theme already defines.
- Do not test Tailwind classes.
- Do not add a bow/sparkle/ribbon decoration to a general-purpose component — those are reserved for
  streak and achievement moments.
