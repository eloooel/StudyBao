# Prompt — stop sending her to a phone

Hand this to a fresh agent. It is a **copy and framing fix**, not a feature. It is spent once it ships.

Written at commit `5f07df5`. Do not trust that hash — run `git log --oneline -6`.

---

You are picking up **StudyBao**, a study companion for one person's PNLE review. Her exam is **Friday
26 February 2027** and she is being given the app within weeks.

## Read these first

1. `CLAUDE.md` — the UX rules and the voice rules
2. `docs/DECISIONS.md` **D14** — the decision this implements, including why the OCR fallback is _not_
   being built
3. `docs/BUILD_GUIDE.md` §3 (the OCR reality check) and §4 Workflow C's three ingest paths
4. `src/features/ingest/components/ingest-view.tsx` — every string you are changing is in this file

## The defect

Three user-facing strings tell her to **open the file on her phone**. She has an **iPad** and a
**Windows laptop**, and nothing in the ingest feature is platform-aware.

| Where                 | What it says now                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| the scanned-PDF state | _"Open it on your phone, use Live Text (iPhone) or Google Lens (Android) to copy the words…"_  |
| a handwriting note    | _"copy it with Live Text on your phone…"_                                                      |
| the photo tab's note  | _"your phone is better at this than we are: use Live Text (iPhone) or Google Lens (Android)…"_ |

It is wrong in **both** directions she will meet it, which is why this is worth fixing before the reveal:

- **On her iPad** it sends her to a phone she does not need — the iPad has Live Text itself. That is an
  extra step she has already told us she will not take, added to the device she will actually be holding.
- **On her laptop** it sends her to a phone when the local tool is right there: **Windows' Snipping Tool
  has a _Text actions_ → _Copy all text_ step**, and PowerToys _Text Extractor_ is the equivalent. Neither
  needs the app to change, and neither needs a second device.
- **"Google Lens (Android)"** is a path for a platform she does not own.

This is D14's item 2 — _"recalibrate the copy"_ — which was decided and never implemented.

## Do NOT add platform detection

The obvious-looking fix is to read `navigator.platform` and branch the copy. **Do not.**

- A single sentence naming **both** local options is correct on every device, cannot misfire on an
  unknown one, needs no browser global, and needs no new module.
- It would mean importing the iPad predicate from `src/features/first-run/lib/home-screen.ts`, and
  **features must not import from each other.** That predicate also carries real subtlety — iPadOS 13+
  reports itself as `MacIntel`, and the legacy `'iPad'` string must still be accepted — so a second copy
  of it is exactly the drift this repository keeps paying for. Do not copy it and do not import it.
- `CLAUDE.md`: _"Prefer deleting code to adding abstraction. No speculative generality."_ A platform
  predicate in service of one sentence is speculative machinery.

**So the rule for this change: name the local tools, never a second device.**

## The copy, and you may improve the wording

Structure, not script — keep the voice, and say what you actually wrote in your report.

**Scanned-PDF state.** It must (a) say plainly there is no text in the file, (b) name Live Text for an
iPad and a screenshot tool's text action for a laptop, (c) never mention a phone, and (d) still end by
telling her to paste into the first tab, which is the thing that actually works.

**Handwriting note.** Keep it honest — handwriting is genuinely where Tesseract is weakest, and that
caveat is right. Just move the reference from "your phone" to the local options. **Do not claim the
screenshot tools are as good as Live Text**; you cannot verify that, and neither can I.

**Photo-tab note.** Same substitution. Keep _"Printed text works best — flat, bright, straight on."_ —
that line is already scoped correctly and is the honest framing.

## Sweep the whole repository, not just this file

The same assumption may live elsewhere. Search all of `src/` for user-facing strings naming a phone or a
phone-only tool — `phone`, `iPhone`, `Android`, `Lens` — and fix any that are advice to her. Report what
you found even where nothing needed changing.

## The framing recalibration, which is the second half of D14 item 2

`BUILD_GUIDE.md` §4 labels the photo path **"Last resort; see §3 for limits."** That was calibrated for
**handwriting**, and §3 is explicit that it is: _"Tesseract.js is trained on printed text. Handwriting
accuracy is poor."_

**Her material is digital PDFs and screenshots, and never handwriting.** So on her actual input the photo
path is not a last resort — it is a first-class path for anything rasterized. Adjust that guide line to
scope the caveat rather than dropping it: wrong for handwriting, good for printed text. **Do not
overpromise** — the honest claim is narrower, not louder.

Leave §3's reality check alone. It is accurate.

## Tests

- `src/features/ingest/pages/ingest-pdf.test.tsx` asserts the scanned alert contains `/Live Text/`. That
  should still hold — **check rather than assume, and do not weaken the assertion to make it pass.**
- **Add a property test, because the same wrong advice was in three places and one would be missed
  again:** no ingest state's rendered copy matches `/phone|iPhone|Android|Google Lens/i`. A property
  cannot rot the way three copy assertions can.
- **Confirm it goes red** by putting "your phone" back into one of the three strings. A green test that
  cannot go red is worse than none, and this repository has shipped two of those.
- Layer 3 stays pure: `ingest-view.tsx` must not read `navigator`. If your solution needs the platform,
  the solution is wrong — see above.

## Out of scope

- **Any OCR work.** No PDF→OCR fallback, no canvas rendering, no Tesseract changes. D14 explains why:
  the reveal is iPad-first and the iPad path already works through Live Text.
- **The measurement** in `INGEST-TEXT-MEASUREMENT.md`. That is a separate pass and it decides whether the
  fallback is ever built.
- Any change to `src/features/first-run/`, `src/features/flashcards/`, `tracker`, or `timer`.

If you find something outside this list, **write it down rather than fixing it.**

## Verify

```bash
npm install --cache .npm-cache        # only if node_modules is missing; no dependency changes
npm run typecheck && npm run lint:check && npx prettier --check .
npm run test:coverage
npm run build && npm run preview
```

All must pass. **Check `git status` first and stage only your own files by path** — never `git add -A`.
Get your staged files lint-clean; the pre-commit hook will reject you otherwise, and **never use
`--no-verify`**.

## What you cannot verify, and must hand back

**No agent in this project has a browser or a device.** So say plainly that you did not verify:

- that **Windows' Snipping Tool actually offers "Text actions" on her version** — you are naming a tool
  from documentation, not from use. If you are unsure of the exact menu wording, say so rather than
  inventing a label she will hunt for;
- whether PowerToys is installed (it usually is not, so lead with the built-in tool);
- that either path's recognition is good enough for a scanned handout.

**Naming a tool wrongly is worse than not naming it**, because she will look for a menu that does not
exist. If you cannot confirm the wording, phrase it as the capability rather than the exact path.

## Before you write code

Reply with: **(1)** your plan, **(2)** your exact copy for all three strings plus anything the sweep
found, **(3)** the guide line you changed and why, **(4)** your property test and how you confirmed it
goes red, and **(5)** anything you think is wrong with D14 or with forbidding platform detection here.

Then **stop and wait for a go-ahead.**
