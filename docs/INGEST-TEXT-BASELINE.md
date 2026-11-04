# The paste-path baseline, measured

**The number ADR 0009 has to beat.** Measured with the committed harness, before any LLM work, so the
claim "the AI path is better" can be checked rather than believed.

```
node scripts/ingest-fitness.mjs D:\Downloads\boardpal-ocr-paste.txt
```

This is **not** the same measurement as the BoardPal column in
[`INGEST-FITNESS-RESULTS.md`](INGEST-FITNESS-RESULTS.md). That one is the **PDF path**, and it correctly
yields **zero cards**, because BoardPal is a scan with 21 full-page images and zero text operators. The
paste below is the reader's **Live Text** output from that same file, pasted into the first tab — the
path she would actually use today. It had never been recorded.

## Result

| Measurement                                     | Value                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Input                                           | `boardpal-ocr-paste.txt`, plain text (no extraction), 66,997 bytes, 1,717 lines      |
| Joins performed                                 | **614** — 89 into cards, 525 into leftover runs                                      |
| Joins a missing terminal mark alone would allow | 0                                                                                    |
| **Cards produced**                              | **138**                                                                              |
| Distinct fronts                                 | 115                                                                                  |
| **Cards sharing a front**                       | **35**                                                                               |
| Longest card (source lines)                     | 4                                                                                    |
| **Cards with a front ≤3 characters**            | **5**                                                                                |
| Cards at the span cap (10 lines)                | 0                                                                                    |
| Leftover entries                                | **965**                                                                              |
| **Leftover rate, by line**                      | **86.78%**                                                                           |
| Leftover by reason                              | `no-separator` **922**, `prose` 42, `unpaired-answer` 1                              |
| Draft bytes / ceiling                           | 397,858 / 1,048,576                                                                  |
| Provenance                                      | **1,717/1,717 claimed, 0 double, 0 unclaimed**                                       |
| Determinism                                     | Same input yields the same numbers, so a rerun is a check rather than a new baseline |

## What it means

**The parser is not broken. It is working exactly as designed, and that is the point.** 86.78% of lines
producing no card is not a crash: the design is deliberately conservative, it drops nothing silently,
and the provenance invariant holds perfectly — every one of the 1,717 lines is claimed exactly once.
The 965 leftovers go to the review queue, which is the honest version of that work (ADR 0004).

**But for this document it means 17 lines in 20 yield no card**, and the reason is structural rather
than a tuning problem. **`no-separator` accounts for 922 of the 965** — lines with no term/definition
separator at all. The parser's model of the input is _"a line shaped like `Term — its explanation`"_, and
this document is largely **OCR'd prose and column-serialised tables**. There is no separator to find
because the source is not written that way, and a column-flattened table has no reading order to
recover.

**So of the 138 cards, the usable count is meaningfully lower.** 35 share a front with another card, and
5 have fronts of three characters or fewer — both signatures of watermark fragments being read as
content, which is exactly the noise documented in D14.

**This is ADR 0009's case, stated numerically:** the two failures the ADR names — a watermark interleaved
_within_ body lines, and multi-column tables serialised column-wise — are what is pushing 922 lines out
of reach, and neither is reachable by a separator pattern.

## The comparison rule this baseline implies

**Compare on usable cards, not on card count.** An LLM will very probably return more than 138 rows for
this input, because it will happily turn prose into question/answer pairs. That is not automatically an
improvement: a plausible but wrong card is memorised, and on a licensure exam that is worse than a
missing one. So the metric is **cards she would keep**, measured the same way on the same input — and
the LLM path has to win on that, not on volume.

## BoardPal is a class, not an outlier — and it has _two_ problems, not one

Three more BoardPal handouts were measured on **2026-11-04**, this time through the PDF path:

| File                                              | Pages | Text layer      | Lines | Cards |
| ------------------------------------------------- | ----- | --------------- | ----- | ----- |
| Respiratory A — Upper Airway, Asthma & COPD       | 16    | **NONE (scan)** | 0     | **0** |
| Diabetes Mellitus & Endocrine Emergencies         | 14    | **NONE (scan)** | 0     | **0** |
| Immunization, Maternal & Child Health & Nutrition | 25    | **NONE (scan)** | 0     | **0** |

**Four BoardPal files out of four have no text layer.** The PDF path does not read them _badly_ — it
reads nothing at all, because there is nothing to read. So BoardPal is not the outlier that
[`INGEST-FITNESS-RESULTS.md`](INGEST-FITNESS-RESULTS.md)'s 6.75% Sir Rocky figure made it look; it is a
whole class of her material, at least 76 pages so far.

**That means there are two separate failures, and ADR 0009 only addresses the second:**

1. **No text at all.** A watermarked scan has the words in pixels. No parser and no model can fix this;
   it needs OCR. On her iPad the reader's **Live Text** does it invisibly (Select All → Copy), which is
   how the paste below exists. On the laptop nothing does it.
2. **Poor text into the parser.** Once Live Text has produced text, the watermark is interleaved within
   body lines and the tables are flattened, so the parser yields 138 cards from 1,717 lines — the 86.78%
   figure above.

**ADR 0009 is a fix for (2) and is silent about (1).** Anything built from it must not be described as
solving the BoardPal problem, because the paste step she does by hand remains — and on the laptop there
is no paste step available at all.

### Still not measured, and why it cannot be faked

The 86.78% figure comes from **one** BoardPal paste. The three files above have no paste yet, and they
cannot be substituted with Tesseract output: D14 established that Apple's Live Text reads these better
than Tesseract does, so OCR-ing them here would measure a _different input_ from the one she actually
produces. **The paste step is hers to do**, and until it exists this document says 4/4 documents fail
the PDF path and exactly one of them has a measured paste.

## Two things this run incidentally re-confirmed

- **Front-derived metrics are join-agnostic.** An earlier ad-hoc run of this same input recorded **1,434**
  joins; after the join fix it is **614**. The card count is unchanged at **138**. A join only ever
  extends a card's _back_, so every front-derived number — and therefore the card count — could not move.
  The prediction and the measurement agree.
- **The harness is deterministic**, which is what makes it usable as a before/after instrument at all.
  Re-running it is a check, not a new baseline.
