# Prompt — measure the parser against a real OCR'd BoardPal sheet

Hand this to an agent, with the pasted text already saved (see §1). It is a **measurement, not a fix**:
the deliverable is numbers and a ranked list, and it must not change `src/`.

> **If you are holding the in-flight join-fix brief:** read §1 and §2 only. §1 adds one requirement to
> `scripts/ingest-fitness.mjs` — it must accept a text file as well as a PDF, because the second input it
> will be pointed at is a text file. You do not need that file to build the capability.

Written at commit `c2f770a`. Do not trust that hash — run `git log --oneline -6`.

---

## 1. The input, and why a human had to supply it

**The file is at `D:\Downloads\boardpal-ocr-paste.txt`** — note that `Downloads` is redirected to `D:` on
this machine, so `%USERPROFILE%\Downloads` is empty. A human saved it from the clipboard after running
Select All → Copy on a BoardPal sheet. Treat it as read-only and **never copy it into the repository** —
it contains a real person's name and email address on nearly every line, and it is commercial
board-review material. If a sandbox denies reading it, **say so and stop**; do not work around it by
copying the bytes somewhere the sandbox prefers.

**It has already been checked, so you do not have to:** 66,997 bytes, **1,717 lines**, UTF-8 with the
non-ASCII intact — the Arabic-Indic digits (`a٢٩`, `٠٥٣`) and the misread `¿` bullets are both present,
and there are **no U+FFFD replacement characters**, so the save mangled nothing. It runs from `Page 1`
through `Page 19` to the document's closing sentence, so it is the whole sheet rather than a truncated
clipboard.

It is worth being precise about what this file is, because it is not what it looks like:

- It is **OCR output, not a PDF text layer.** The sheet it came from has no text layer at all — measured
  at 21 pages, 21 full-page images, **zero text operators**. Apple's Live Text ran over the images
  invisibly when the human pressed Copy.
- The proof is that the same watermark appears a dozen different ways in one document: `Marbie Jade` on
  one line and `Marble Jade` on another, with body errors like `four` → `tour`, `before` → `betore`,
  `feet` → `teet`, `infection` → `intection`, and the diagonal watermark coming through letter-spaced as
  `e j a d e m e n d i o l a @ g m a i l . c o m`. A text layer cannot do that.
- So this is a fair sample of **what she will actually paste into the Paste tab** for a rasterized
  handout. That is the whole reason to measure it.

## 2. The question

> **Does the ingest parser produce anything usable from a real OCR'd, watermarked, table-heavy board
> review sheet — or does this document type defeat it?**

Background: the parser is built for `Term: Definition` pairs and was tuned against a definition-shaped
handout where it produced 523 cards from 3,215 lines. **This sheet is not shaped that way.** It is prose
and multi-column tables — `1• Ischemic heart disease`, `• Diets shift to processed food`,
`Tobacco • Raise excise taxes • RA 10351` have no separator for the term rules to match. So the leftover
rate is expected to be **document-dependent**, and this document is the counterexample.

## 3. The prediction, to confirm or refute

State plainly whether this holds, because being wrong here is itself a finding:

- **Very few usable cards.** Most lines are prose or table cells with no `Term: Definition` shape.
- **A handful of junk cards built from headers and watermark fragments.** Two lines match the dash
  separator with a short left-hand side and should become cards whose _front is a page header_:
  `PART 1 - la@gmail.com` (back is a watermark) and `PART 1 - WHAT THE PHILIPPINES ACTUALLY DIES OF`.
- **Some law-name cards that may actually be useful**, e.g. `RA 11215 (2019) - National Integrated Cancer
Control Act`, because a short left side plus a dash is exactly what the term rules accept.
- **Table cells serialised column-wise into false reading order** — `Point` / `Why it is called the
silent killer` / `Primary (essential) hypertension` is one three-column table flattened into a stream.
  No parser rule can recover that from reading order, so expect nonsense cards or leftovers from it.
- **The watermark interleaved _within_ body lines**, in many fragmentations per page.

## 4. Extend the harness, then measure

`scripts/ingest-fitness.mjs` currently takes PDF paths. **Add a text input** — a flag or a `.txt`
argument — that feeds the file straight into `normalize` → `parse`, skipping extraction. Do not
reimplement any of the pipeline; import the real modules as the existing harness does.

Report, for this one input:

| Measurement                                              | Why                                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Lines after `normalize`                                  | The real input size                                                                                      |
| Cards produced                                           |                                                                                                          |
| **Cards whose front or back contains a watermark token** | `Marbie`, `Jade`, `mendiola`, `@gmail`, or a `PART n` header. **The headline number for this document.** |
| **Leftover entries, and the leftover rate by line**      | Expect this to be far worse than the definition-shaped handout                                           |
| Cards whose front is ≤3 characters                       | The known junk shape                                                                                     |
| **Cards carrying her name or email address**             | A first-impression and privacy cost, not just noise                                                      |
| Longest card, in source lines                            | Compare against the join fix's cap                                                                       |
| Provenance invariant                                     | Every normalized line in exactly one card's span or the leftover queue — never two, never none           |
| The first 20 cards verbatim, and the first 20 leftovers  | So a human can judge whether _any_ of it is usable. Short excerpts only.                                 |

**Then do the before/after**, using the probe method this repo already uses rather than a checkout:
run once on the current `parse.ts`, then temporarily reintroduce the `!endsASentence` fallback, run
again, and restore byte-for-byte with the SHA-256 compared. Report both columns. The prediction is that
the join fix **barely moves this document** — it has few joins — and that the watermark and layout are
what dominate. If that is wrong, say so.

For the provenance invariant, note that this input is adversarial in a way fixtures are not: the OCR
text contains stray characters, Arabic-Indic digits, letter-spaced runs and bullets read as `¿`. If the
invariant fails on it, **that is the single most important thing in your report** — stop and report
rather than adjusting anything.

## 5. Constraints

- **Do not modify `src/`.** This is a measurement. Findings are reported, not fixed.
- **Do not test Tailwind classes, snapshots, or implementation details.** If you add a test, it must be
  able to go red: reintroduce the behaviour it guards and confirm it fails.
- **Do not commit the input file, or any substantial part of its text.** Short excerpts in your report
  are fine and expected; a fixture is not. It is copyrighted, and it contains a third party's personal
  contact details.
- **Do not extrapolate from one document.** One sheet is one data point. If you want to generalise about
  "her material", say what would be needed to do so instead.
- Report what you verified, how, and what you could not. "Should be better" is not a measurement.

## 6. Report, then stop

1. **The measurements table**, with the before/after columns.
2. **The prediction**: confirmed or refuted, item by item.
3. **The headline answer**: can she get anything usable out of this document type, and roughly how much
   of it?
4. **Findings ranked by impact on her use**, each with the smallest repro and the fix you would propose.
   Include whether a **token-frequency filter** is the right shape for the watermark — a token or short
   phrase appearing on most pages is noise, which would also catch the 27 running-header cards already
   measured on the other handout. A repeated-**line** filter cannot work here, because the fragments
   never form a consistent line.
5. **What you could not test and why.**
6. **A proposed next step**, with "the parser does not serve this document type and she should be told
   so" included as a legitimate answer.

**Do not start fixing.** Every fix here needs its own go-ahead, and the noise filter and the x-position
line break are separate changes with their own decisions.
