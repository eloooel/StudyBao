# Fitness test — does the ingest path work on her real notes?

Hand this to a fresh agent. It is an **investigation**, not a build: the deliverable is measured
numbers and a ranked list of what is wrong, not a diff. It is spent once it has been run.

Written at commit `10f18ea`. Do not trust that hash — run `git log --oneline -6`.

---

You are picking up **StudyBao**, a study companion for one person's PNLE review. Workflows A–D are
committed: a shell, flashcards with real SM-2, an ingest pipeline, and a Pomodoro timer. Workflow E
(the lesson tracker) may be uncommitted in the working tree — **do not commit it, do not rebase it, and
do not touch it.** If `git status` is dirty with `src/features/tracker/`, that is someone else's
in-flight review, not yours. Leave it exactly as you found it.

Her exam is **Friday 26 February 2027**.

## Read these first

1. `CLAUDE.md` — constraints and the two AI boundaries
2. `docs/HANDOFF.md` — current state, and §1 for how C was verified
3. `docs/BUILD_GUIDE.md` §3 ("OCR reality check") and §4 Workflow C
4. `src/features/ingest/` — **read this before writing the harness.** `lib/extract-pdf.ts`,
   `lib/pdf-lines.ts`, `lib/normalize.ts`, `lib/parse.ts`, `lib/draft-storage.ts`, `lib/batch.ts`
5. `docs/ai/write-tests.md` — especially the rule about tests that cannot go red

## The question

Workflow C was verified with **synthetic fixtures and one generated test PDF**. It has never been run
against her real study material. So:

> **Can she actually turn these two PDFs into flashcards, and how much typing does the ingest path
> actually save her?**

> **Superseded — the leftover rate is not a health number.** It read **6.75%** on the handout below
> while 80 cards were swallowing whole sections, and **75.58%** after the join fix. The alarming value
> is the correct one, because a _low_ leftover rate means the parser is absorbing lines into cards
> rather than parsing them. The measures that actually move for this defect are named in
> [`docs/ai/write-tests.md`](ai/write-tests.md) under "Verify the metric can move". Report the leftover
> rate, but never as the headline.

The original framing was: the **leftover rate** — the fraction of input lines that become cards versus
the fraction she has to convert by hand. A pipeline that parses cleanly but leaves 80% of her notes as
leftovers does not do its job, and that is a more important finding than any crash. Every other number
below is context for that one.

## The inputs

Two real board-review PDFs. **Read-only**; read them in place and do not modify them.

| File                                       | Bytes      | sha256 (first 8) |
| ------------------------------------------ | ---------- | ---------------- |
| `Non-Communicable Diseases - BoardPal.pdf` | 21,480,015 | `b87c39f6`       |
| `Sir Rocky Notes.pdf`                      | 86,366,941 | `22910619`       |

```
C:\Users\Raphael\.dsh\attachments\v1\files\b8\b87c39f6bb7ebb558b1e44ad432a1fb03ea525736cab3e470fa9b94434fb9e33\Non-Communicable Diseases - BoardPal.pdf
C:\Users\Raphael\.dsh\attachments\v1\files\22\229106196d44de674bf2b660a9e9d97bf99024e3dc0c31aeaa6d2b665f213d83\Sir Rocky Notes.pdf
```

If the sandbox refuses to read outside the workspace, copy them to the **OS temp directory** — not into
the repo. `git status --short` must show no new paths because of this work, ever.

**Do not commit either PDF, or any extracted text from them.** These are commercial board-review notes
and this repository is on GitHub. The harness stays local and untracked.

### A byte-level pre-check, to confirm or refute first

A whole-file scan for the standard dictionary keys — normally uncompressed, and therefore visible in the
raw bytes — found:

| Key               | BoardPal   | Sir Rocky | Reading                                                     |
| ----------------- | ---------- | --------- | ----------------------------------------------------------- |
| `%PDF-`           | present    | present   | Both are valid PDFs. Neither is encrypted.                  |
| `/Font`           | present    | present   | Both have fonts, so both should have a text layer.          |
| `/ToUnicode`      | **absent** | present   | The CMap that maps glyph codes back to Unicode.             |
| `/Subtype /Image` | present    | present   | Both carry images — normal, and expected for an 82 MB file. |

**BoardPal appears to have no font carrying a `/ToUnicode` CMap.** PDF.js must then fall back to
built-in encodings and glyph names, and for a subset font with a custom encoding that fallback is
frequently wrong. So there is a specific prediction on the table:

> **BoardPal extracts garbled or partially-garbled text. Sir Rocky extracts clean text.**

Test that directly. It decides whether these files are exercising the parser or exercising PDF.js's
encoding fallbacks — very different problems with very different fixes.

**Treat the table as a hypothesis, not a conclusion.** A PDF may store its dictionaries inside compressed
object streams, in which case this scan cannot see a key that is genuinely present. If BoardPal extracts
perfectly, the pre-check is wrong, and say so out loud — that would mean the method itself is
unreliable.

The pair is useful precisely because they look different. **Sir Rocky is probably an OCR'd scan** —
images plus a real text layer — so its text may carry the _original_ OCR's errors, and 82 MB of images is
the memory case. BoardPal is probably born-digital with a bad encoding map.

## What to build

A **local, untracked Node harness** that imports the real modules from `src/features/ingest/lib/` and
runs them over both files. Put it somewhere untracked (a temp dir, or a path you delete afterwards).

**Import the real functions. Do not reimplement any part of the pipeline**, not even "just the line
joining". A harness that reimplements the parser measures your code, not the app's, and this project has
already been burned twice by tests that could not go red. If a function is awkward to call in Node,
adapt the call, not the logic — and say in your report what you had to adapt, because that is itself a
finding about how coupled the pipeline is to the browser.

For each file, run the actual sequence: extract text (PDF) → `contentItemsToLines` → `normalize` →
`parse` → measure the draft via `draft-storage`'s own serialisation and ceiling.

**Practical warning, so you do not lose time:** `extract-pdf.ts` sets `GlobalWorkerOptions.workerSrc` to
a Vite `?url` import and expects a browser worker. That will not load in Node. Expect to need
`pdfjs-dist`'s legacy build, to bypass or stub the worker, and to point the wasm image decoders at the
already-vendored `public/pdfjs/wasm/`. Report whatever you had to do — if the browser wiring cannot be
exercised outside a browser at all, that is worth stating plainly rather than papering over.

## Measure, per file

| Measurement                                                   | Why it matters                                                                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Page count; whether a text layer exists                       | `looksScanned` — if her notes are scans, the PDF path **cannot** help her and she must photograph pages instead            |
| Wall-clock extraction time                                    | She is waiting on this, with no progress bar                                                                               |
| Characters and lines after `contentToLines` + `normalize`     | The real input size                                                                                                        |
| **Cards produced, and leftover lines, and the leftover rate** | **The headline number**                                                                                                    |
| Serialised draft bytes vs `DRAFT_SIZE_CEILING_BYTES` (1 MiB)  | Whether the "too big to survive a reload" path fires on her real notes                                                     |
| Peak process RSS during extraction                            | A proxy for whether an iPad survives the 82 MB file                                                                        |
| Provenance invariant over real input                          | Every normalized line in exactly one card's span or the leftover queue — never two, never none. Real input, not a fixture. |
| Count of `\uFFFD` or replacement runs                         | Text extracted without a ToUnicode CMap is gibberish                                                                       |

## The seven questions to answer explicitly

1. **Leftover rate.** Concretely: of her real lines, how many became cards? Show the first ten and last
   ten leftover lines verbatim (short excerpts are fine in your report; do not paste the whole file).
2. **The 82 MB file.** Does it complete, how long does it take, and how much memory does it need? Would
   a 4 GB iPad in Safari — which has a tighter budget than Node — plausibly survive it? If you cannot
   answer that, say so rather than guessing.
3. **Two-column layouts.** Board handouts are often two columns. PDF.js emits text items in content
   order, so columns can interleave into nonsense sentences that still parse into confident, wrong
   cards. Check whether the output sentences are coherent, and whether `contentItemsToLines` has any
   notion of column or x-position at all.
4. **The draft ceiling.** Does the big file exceed 1 MiB? If so, confirm the message that appears is the
   honest one (everything accepted is already saved; only the unreviewed remainder is at risk) and not
   a silent failure or a truncated draft.
5. **Text-layer quality.** Are there replacement characters, missing diacritics, or ligature damage
   (`ﬁ` instead of `fi`)? These produce cards that look fine and are subtly wrong — which for a
   licensure exam is worse than an empty result.
6. **Duplication.** Do the two files overlap in content? If the same topic appears in both, she gets
   duplicate cards and the parser has no dedup. Report the overlap you can see; do not build dedup.
7. **Anything that throws.** Encrypted files, malformed pages, a page whose fonts are absent. What does
   she see — a clear message, or a dead screen?

## Then: stop and report, do not fix

**Do not change any implementation in `src/`.** Not `parse.ts`, not `pdf-lines.ts`, not the OCR path.
One sample of two documents is not enough evidence to rewrite a parser, and the fixes need their own
go-ahead like every other change here.

You **may** add a test if it passes and locks in behaviour you have now confirmed on real input, using a
**synthetic** fixture that reproduces the _shape_ you observed — a two-column layout, a wrapped line, a
ligature. Do not commit real note text as a fixture.

Report in this order:

1. **The measurements table**, both files.
2. **The headline answer**: how much typing does this actually save her on her real notes?
3. **Findings ranked by impact on her use**, not by how interesting they were to find. For each: what
   you observed, the smallest input that reproduces it, and what you think the fix is.
4. **What you could not test and why** — name it, do not paper over it.
5. **A proposed next step**, with the honest option that "the parser needs work before she relies on it"
   included as a legitimate answer.

## What only a human can check — hand this list back

Say plainly that these were not tested, because no agent in this project has a browser or a device:

- Whether the file picker works on the real iPad, and how bad an 82 MB upload feels over her connection.
- Whether the screen looks frozen during extraction (there is no progress indicator to trust).
- Whether the review screen is actually pleasant to use for a batch of her own cards.
- **Whether the photo tab rescues a scanned PDF**, which it must be used manually for.
- Whether the result made her faster at all, which is the only measure that finally matters.
