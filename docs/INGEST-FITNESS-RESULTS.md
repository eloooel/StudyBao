# Ingest fitness test — results, and what they mean

The record of running [`INGEST-FITNESS-TEST.md`](INGEST-FITNESS-TEST.md) against two real board-review
PDFs at `0f80e5c` (2026-10-07). The harness was local, untracked and has been deleted; **nothing in
`src/` was changed by the test**, and no fixture was added (reason in §4).

Read §3 for what to fix. Read §5 before repeating the mistake in §0.

---

## 0. The pre-check was wrong, and the reason is not the one first given

Before the test, a whole-file scan for standard PDF dictionary keys predicted that `BoardPal` had fonts
but no `/ToUnicode` CMap, and would therefore extract garbled text. **Both halves were wrong.**
BoardPal has no text layer at all — 21 pages, 21 `paintImageXObject` operators, zero `showText`
operators, zero text items, `looksScanned: true`.

The first explanation recorded for this was that the keys the scan found were inside **compressed object
streams**. That is not possible, and the file proves it: `BoardPal` contains **no `/Type /ObjStm` at
all**, and a plaintext scan cannot match a string inside a Flate-compressed stream anyway.

The accurate reason, and the one worth remembering:

> **A plaintext dictionary scan can see what a PDF _defines_, never what it _uses_.** Font objects and
> resource dictionaries sit uncompressed in the object graph — `BoardPal` genuinely has `/Type /Font`
> dictionaries and `/BaseFont` entries — while the operators that actually draw text
> (`showText`, `paintImageXObject`) live inside Flate-compressed content streams and are invisible to
> the scan. So the scan found real, unused font definitions and could not tell that no page draws with
> them.

The scan did report `/ToUnicode` as absent for BoardPal, which was correct — but by luck, not by method.
**Do not use this technique again to decide whether a PDF has a text layer.** Ask PDF.js: count text
items, or read `looksScanned`.

Two further traps from the same episode, both worth knowing:

- A `-match`/`-eq` comparison on a Latin-1-decoded PDF, or printing UTF-8 text through a console that
  decodes it as Latin-1, produces convincing **mojibake that is not in the data**. The extracted bytes
  were verifiably correct on disk while the console showed garbage. Both the pre-check and a first look
  at the output fell into this.
- `[System.IO.File]::ReadAllBytes` returns `null` in a confined sandbox, so any check built on .NET
  static calls fails silently rather than erroring.

## 1. Measurements

| Measurement                        | BoardPal                             | Sir Rocky                                             |
| ---------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| Bytes / sha256 (first 8)           | 21,480,015 / b87c39f6                | 86,366,941 / 22910619                                 |
| Pages                              | 21                                   | 133                                                   |
| Text layer                         | **none** — 0 text operators, 0 items | yes — 11,625 `showText` ops                           |
| `looksScanned`                     | true                                 | false                                                 |
| Extraction wall-clock              | 257 ms                               | 1,071–1,702 ms (3 runs)                               |
| Progress callbacks                 | 21/21                                | 133/133                                               |
| Parse time                         | —                                    | 22 ms                                                 |
| Characters after extraction        | 0                                    | 97,649                                                |
| Lines after `contentItemsToLines`  | 0                                    | 3,215                                                 |
| Lines after `normalize`            | 0                                    | 3,215 (0 collapsed)                                   |
| Cards produced                     | 0                                    | 523                                                   |
| Leftover entries                   | 0                                    | 215 (190 no-separator, 27 prose)                      |
| Leftover rate, by line             | n/a                                  | 6.75% (217/3,215)                                     |
| Draft bytes vs 1 MiB ceiling       | 374 (persisted)                      | 541,598 — 52%, persisted                              |
| Peak RSS during extraction         | 173 MB                               | 424 MB (+77 MB over baseline)                         |
| Provenance invariant               | trivial (0 lines)                    | **holds**: 3,215/3,215 claimed, 0 double, 0 unclaimed |
| Replacement runs / ligature damage | 0 / 0                                | 0 / 0                                                 |
| Private-use codepoints             | 0                                    | 104 (icon font)                                       |

Nothing threw. Nothing was truncated. **The provenance invariant held on real input for the first
time** — it had only ever been asserted over fixtures.

Text-layer quality on Sir Rocky is excellent: 13,512/13,638 tokens (99%) word-shaped, correct curly
quotes, en dashes, `→`, `é`, `μ`, `½`, section marks. **There is no encoding damage anywhere**, which
was the other half of the refuted hypothesis.

## 2. The headline, and why the flattering reading is wrong

BoardPal is a non-answer: it is a scan, so the PDF path yields nothing at all.

For Sir Rocky the flattering reading is "93.3% of lines became cards, only 6.75% left over". That
reading is misleading, and this is the most important thing the test found:

- The parser made 523 cards from 3,215 lines by performing **2,475 joins** — it absorbed 77% of all line
  breaks into cards. Only 158 of 523 cards (30%) are a single line.
- Of those joins, **1,483 (60%) came from the "previous line does not end a sentence" trigger**, which
  needs no lexical evidence. 2,939 of 3,215 lines (91%) lack terminal punctuation, so that trigger is
  effectively always on.
- The cost reappears **inside** the cards: 116/523 cards contain a mid-text bullet and 88/523 a mid-text
  ALL-CAPS heading, i.e. text belonging to a different list item or section. The longest card spans 109
  source lines and 3,109 characters.
- **523 cards but only 402 distinct fronts.** 158 cards (30%) share a front with another; 27 cards are
  just the running page header; 24 of those share one identical front.
- 34 cards have a front of ≤3 characters (`N`, `WOF`, `DOC`, `C1`).

**Honest answer to "how much typing does this save her":** for Sir Rocky it removes the transcription
and hands her roughly 500 cards to audit, a substantial minority of which need repair or discarding, and
34 of which are unusable. For BoardPal it saves nothing inside the app.

## 3. Findings, ranked by impact on her use

1. **Over-joining merges unrelated sections into one card.** The `!endsASentence` fallback fires 1,483
   times. Smallest repro: `Term: definition one` then `NEXT SECTION HEADING` — the heading joins the
   card above because the first line has no period. Fix: require **positive** evidence, cap the span,
   and stop at a boundary. **`docs/ai/write-tests.md` case 7 has been corrected** — this was a defect in
   the written spec, faithfully implemented, not an implementation error.
2. **BoardPal is a scan and the pre-check cannot tell.** The app's own handling is good: the scanned
   state points her at Live Text and the paste tab. No code fix. But the fact that **half of the sample
   material cannot go through the PDF path at all** changes what "PDF ingest" is worth to her, and it
   belongs in the handoff.
3. **Multi-column and table rows are concatenated into one line.** `contentItemsToLines` reads only
   `item.str` and `item.hasEOL`; it has no notion of x-position. 117 rows contain two runs on one
   baseline separated by >80 pt and 13 paste back together — `Lithium Nephrotoxic`, `Mania Depression`,
   `Serotonin Dopamine`. A line like this often _starts_ a card, so the damage propagates into the back.
   Fix: break when the horizontal gap exceeds a threshold or x decreases, which means exposing x/y on
   `PdfTextItemLike`. That is a `pdf-lines.ts` change and needs its own go-ahead.
4. **One table row becomes one card**, so tabular notes are unusable. Six columns emit one line and one
   card. Genuinely hard; the honest answer may be "tables do not work, convert those by hand" rather
   than a parser rule. Needs an explicit decision either way.
5. **`looksScanned` and the "0 lines" outcome are two different measures that can disagree.**
   `looksScanned` is `text.trim().length === 0` on the **raw** extracted text, while the empty-review
   outcome is decided **after** `normalize`. So input that survives the first and not the second
   produces a silent dead end: "0 lines ready — tap Find my cards", then an empty review. The originally
   stated premise for this finding ("whitespace-only text is not caught") is arithmetically wrong —
   whitespace-only text trims to empty and _is_ caught — and the attempted repro came back
   `looksScanned: true`. The narrower, real gap is the disagreement between the two measures. Fix: gate
   on normalized line count so there is one emptiness test.
6. **Duplicate fronts and header cards.** 402 distinct fronts for 523 cards; `RN Interventions` ×22,
   `Priority` ×13, `Position` ×10; 27 running-header cards. The parser has no dedup by design and should
   not gain one. Fix belongs in the review screen (a "these look the same" grouping) or a
   repeated-line header filter.
7. **Private-use and mangled glyphs.** 104 PUA codepoints from an icon font survive into lines as
   invisible characters, and one card reads `cranial ( 1o973 : X, IX, VII, III)` where `1o973` is a
   mangled arrow. `normalize`'s `\c` rule does not cover the PUA plane. Fix: extend the noise set to
   `\p{Co}`. Low volume, but exactly the "looks fine, is subtly wrong" class.

## 4. What was not tested, and the test deliberately not added

Not tested, named plainly: the file picker on a real iPad; how an 82 MB upload feels over her
connection; whether extraction looks frozen (1–1.7 s in Node, materially slower in iPad Safari and
unmeasured); whether the review screen is pleasant for 523 cards; **whether the photo tab actually
rescues BoardPal** — it was proven to be a scan and therefore to need that path, but Tesseract was never
run on photographed pages; whether 424 MB peak would be killed by Safari (the measured numbers are given
rather than a guessed device budget); and whether any of this made her faster.

**The test deliberately not added.** The fitness test permitted a synthetic fixture locking in confirmed
behaviour. The one candidate shape found was "a table row with several terms becomes one card" — and it
was declined, because its only assertion would have certified finding 4 as intended behaviour and made
the eventual fix look like a regression. That is the rule in `docs/ai/write-tests.md` applied correctly:
a green test that cannot legitimately go red is worse than none.

## 5. Proposed order

Not a rewrite. Ranked, cheapest and highest-effect first:

1. **Decide what her scanned material should do.** BoardPal cannot use the PDF path at all, and it is
   half the sample. Either the iOS Live Text → paste route is the answer (`BUILD_GUIDE.md` §3 already
   argues it is the best path for scans), or the PDF tab should render pages to canvas and OCR them with
   the Tesseract worker the app already ships. That is a scope decision, not a bug fix, and everything
   else is cheaper than getting it wrong.
2. **Fix the join rule** (finding 1) against the corrected case 7, with the failing repro written first.
   Highest effect on card quality of any single change.
3. **Gate `looksScanned` on normalized line count** (finding 5), one line in `extract-pdf.ts`, so the
   zero-line outcome says something honest.
4. **Break lines on a horizontal gap** (finding 3), a `pdf-lines.ts` change with its own decision.
5. **Defer dedup and table handling** (findings 4, 6) until 1–3 have landed and she has used the result.
   Two documents is not enough evidence to design either.
