# Prompt — measure whether an LLM beats the parser on the same text

Hand this to a fresh agent. **This is an evaluation, not a feature.** Nothing ships from it; no server
is created, no runtime code changes, and the "no LLM in the runtime" boundary
([ADR 0004](adr/0004-no-llm-in-runtime.md)) is **not** crossed by writing it.

---

You are picking up **StudyBao**, a PNLE study app for one person. Her exam is **Friday 26 February 2027**.
The app is live and she uses it.

## The question you are answering

**On the same pasted text, does DeepSeek produce more _usable_ cards than the deterministic parser?**

Everything else is subordinate to that one comparison. If the answer is no, a proposal gets dropped. If
it is yes, it justifies a much larger piece of work — so this is worth doing carefully and cheaply.

## Read first, in this order

1. [`docs/INGEST-TEXT-BASELINE.md`](INGEST-TEXT-BASELINE.md) — the **parser side is already measured**
   on the exact input you are about to use. Do not re-derive it; reproduce it.
2. [`docs/adr/0009-llm-extraction-from-her-notes.md`](adr/0009-llm-extraction-from-her-notes.md) — the
   proposal under test. Read the **Bad / cost** section especially; it names the risks you are checking.
3. [`docs/adr/0010-several-decks-per-part.md`](adr/0010-several-decks-per-part.md) — the deck model, so
   "which deck would these cards go in" is not a mystery. Irrelevant to the measurement itself.
4. `scripts/ingest-fitness.mjs` — the existing harness. Yours should feel like its sibling.

## The input

```
D:\Downloads\boardpal-ocr-paste.txt     66,997 bytes, sha256 ACB06FD5E4D8D9DB…
```

This is her own **Select All → Copy** from a watermarked, rasterised 21-page handout, pasted into a
file. **Check it exists and hash-matches before starting**; do not trust the path or the size in this
document.

That file contains **her personal data**: her name appears ~142 times and her email address ~40 times,
in a dozen fragmented spellings, because a watermark runs across the page and the OCR chops it.

## The fairness rule — this is the part that is easy to get wrong

**Both paths must run on byte-identical text, and it must be the scrubbed text.**

The naive version runs the parser on the raw paste and the AI on ... whatever the script sends. Those
are two different inputs, so a difference in card count could be caused by the scrubbing rather than by
the model, and the whole measurement is void.

So: **scrub once, write the scrubbed text to a temp file, run both paths against that one file.** The
script must print the SHA-256 of the exact bytes both paths consumed, so the fairness is checkable
rather than asserted.

## The key — strict rules, non-negotiable

- The key comes from **`process.env.DEEPSEEK_API_KEY`**, or from `.env` (gitignored). **Nothing else.**
- **Never print the key.** Not in a log, not in an error, not in a `--verbose` dump, not truncated "for
  debugging". If the request fails, print the **status and response body**, never the request headers.
- **Never commit it**, and never write it into a file in the repo.
- **Fail fast and clearly when it is missing**, before doing any work: one sentence telling the operator
  to set it in their own shell. That is the only acceptable behaviour, and you should test it.
- You are not expected to have the key. **Write the script so somebody else can run it**, and say plainly
  in your report that you did not run the model yourself if you could not.

## What to build

### 1. `scripts/scrub-pii.mjs` — a first, throwaway scrubber

Not the production one. Enough to keep her address off a third party during the experiment:

- **collapse letter-spaced runs first**, then match emails. A plain email regex finds 35 matches in this
  text; de-spacing first finds a different 32; **neither is a superset**, so do both passes and redact
  the union. This is measured, not theoretical.
- a denylist of `marbiejademendiola`, `marbie`, `marble`, `mendiola`, `jade`, `boardpal`,
  case-insensitive — and say in your report how many of each you replaced.
- phone-shaped runs (there are none in this file; keep the rule anyway).
- **Report the residual count**: after scrubbing, count email-shaped runs and denylist hits again. It
  will not be zero. Say what remains and where — that number is the honest measure of a scrubber, and
  it is one of the things this evaluation exists to learn.

### 2. `scripts/extract-comparison.mjs` — the harness

Runs both paths, prints one side-by-side comparison.

**Parser path:** shell out to or import from `scripts/ingest-fitness.mjs` rather than reimplementing it —
its numbers are the baseline, and a second parser implementation would measure the wrong thing.

**Model path:** OpenAI-compatible chat completions at `https://api.deepseek.com/chat/completions`,
model **`deepseek-flash`** (not the Pro tier — 4–7× the price for this task), JSON output mode.
**Verify the API shape against <https://api-docs.deepseek.com/> before writing it** — do not trust this
paragraph.

Requirements on the model call:

- **Extract only, never generate.** Every card must carry the **verbatim source span** it came from. The
  model is not permitted to add facts, explain, summarise, or improve the wording.
- **`max_tokens: 4096`.** This is why chunking is unavoidable: ~40 tokens per card means a single call
  can return at most ~100 cards, and the parser already gets 138 on this input. **Chunk by greedy
  section packing** — accumulate blank-line blocks up to roughly 10k input tokens, never splitting a
  section unless one alone exceeds the budget. Send a **byte-identical system prompt** on every call so
  the provider's prefix cache works.
- One call per chunk, sequentially. If a chunk fails, report it and **carry on** — partial results are
  the point.
- Validate the response against a schema before counting anything. A malformed response is a finding,
  not something to coerce.

### 3. `docs/INGEST-AI-COMPARISON-RESULT.md` — what it found

Leave the file written by whoever runs it, or with your own "not run" note plus the instructions. It
must include:

- the **SHA-256 of the exact input both paths consumed**;
- the **exact system prompt**, verbatim, so it can be reviewed;
- the token usage the API reports, and the **computed cost** at the published off-peak rate;
- the residual-PII counts from the scrubber.

## The metric — compare on cards she would keep, not on count

An LLM will very probably return _more_ rows than 138, because it will cheerfully turn prose into
question/answer pairs. **That is not an improvement.** A plausible but wrong card gets memorised, and on
a licensure exam that is worse than a missing one.

So report, for **each** path:

|                                                                                    | Parser | Model |
| ---------------------------------------------------------------------------------- | ------ | ----- |
| Cards produced                                                                     |        |       |
| Distinct fronts                                                                    |        |       |
| Fronts shared by more than one card                                                |        |       |
| **Fronts ≤3 characters** (watermark junk)                                          |        |       |
| **Fronts that still contain a scrubber miss** (name, address fragment, `boardpal`) |        |       |
| Medically _wrong_ cards, judged by reading                                         |        |       |

That last row has no automatic measure. **Read a sample of at least 20 cards from each path and say
what you saw.** Two things count as wrong: a fact not present in the source span (the model invented
it), and a front/back pair whose meaning is inverted or spliced across a table boundary.

Also dump both card lists in full to a file so a human can check your judgement. Put them **outside the
repo** or gitignore them — they contain her notes.

## What not to do

- **Do not build the feature.** No `api/` directory, no client changes, no `api-client` changes, no UI.
  ADR 0009 stays `Proposed`.
- **Do not add a dependency** unless there is no alternative. Node 22 has global `fetch`.
- **Do not weaken any check to make something pass**, and do not "fix" the parser in this task — if you
  find a parser defect, write it down.
- **Do not send anything but the scrubbed text.** Not the PDF, not the raw paste, not her name.

## Verify

```bash
node --version                       # expect 22+, for global fetch
npm run typecheck && npm run lint:check && npx prettier --check .
npm run test:coverage                # must still pass, untouched
```

Plus three checks of your own, and report each:

1. **Without the key**, the script exits with a clear one-line message and makes no network call.
2. **With a deliberately broken key**, the failure prints a status and a body and **no header, no key**.
3. **The scrubber's residual count** is printed, not assumed to be zero.

## Report back

State plainly:

1. **Did you run the model?** If not, say so, and give the exact command the operator should run.
2. The two columns of the table above.
3. The **fairness evidence**: the input hash both paths consumed.
4. What you read in the sample, including anything that looked medically wrong.
5. Your honest read: **is this worth building, on this evidence?** You may say no. A clean "the parser
   already gets what is there" is a successful outcome for this task, not a failure.
6. Anything you could not judge.

**One caution about scope.** The decision here is narrow: _does the model beat the parser on this text?_
A "yes" does **not** mean the BoardPal problem is solved — those files have no text layer at all, so
somebody still has to paste them by hand, and on the Windows laptop nothing can. Say that out loud in
your report rather than letting a good result imply more than it shows.
