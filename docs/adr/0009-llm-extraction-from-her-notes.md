# ADR 0009 — LLM extraction from her notes, behind our own endpoint

- **Status:** Proposed — awaiting the owner's approval. Nothing is built until this is `Accepted`.
- **Date:** 2026-10
- **Amends:** [ADR 0004](0004-no-llm-in-runtime.md) (one named exception to the LLM ban),
  [ADR 0006](0006-in-app-notifications-only.md) (one stateless function now exists)

## Context

**ADR 0004 rejected this exact idea, and it was right to at the time.** Its alternatives section
considered _"LLM only for parsing structure (not content)"_ and rejected it, on four grounds: it is a
runtime dependency, a key, a network call, and a failure mode — and on one empirical claim: **"the
deterministic parser covers the structured cases that actually occur."**

**That claim is now refuted by her real material.** Measured on the BoardPal handout:

- **the watermark is interleaved _within_ body lines**, in roughly a dozen fragmentations per page —
  `e j a m e n d i o l a @ g m a i l . c o m` and 1,400-odd join decisions, 799 of them from a
  fallback that had to be corrected because it merged sections. A repeated-line filter cannot catch it,
  and neither can any reading-order heuristic;
- **multi-column tables are serialised column-wise** — `Point / Why it is called the silent killer /
Primary (essential) hypertension / …` is a three-column table flattened into a false reading order.
  PDF.js does expose x and y per text item, so a layout-aware parser could beat this, but that is a
  parser project, not a rule.

Both failures are **structural**, not lexical. They are what a model is good at and what a regex layer
provably is not. So the rejection's supporting claim no longer holds on this input.

**Cost is not the obstacle it sounds like.** Per the vendor's published rates, one BoardPal-sized
handout (≈18k input tokens, ~50 cards) costs roughly **$0.004** on the cheap model — under half a cent.
The owner holds a $100 balance and has capped spending at **≤ $1/day**.

**A key cannot be held safely in a browser, and that is the whole reason a server is needed.** Any
`VITE_*` build variable is baked into the JavaScript bundle and served to every visitor; the repository
is public and the deployment sits on a public URL. And a rate limiter in the client cannot bound spend
at all, because an attacker holding the key calls the vendor directly and never loads our app. Both
controls the owner asked for are server-side properties.

**Her notes contain personal identifiers.** The BoardPal watermark embeds her name (`Marbie Jade`, and
OCR reads it `Marble Jade` on other lines) and her email address, dozens of times per page. Anything
transmitted must be scrubbed first.

**Constraints that survive from ADR 0004 and are not in question:** no cards may be _generated_ from
model knowledge; a wrong card is worse than a missing one on a licensure exam.

## Decision

**One stateless serverless function may call one external LLM, for extraction only, on text scrubbed of
personal identifiers on the device. It never generates, never stores, and never receives a document.**

1. **One function, same Vercel project** — `api/extract.ts`. Stateless: it writes nothing to any
   database, so there is **no data-model change and no Dexie migration**. Cards land in Dexie through
   the existing repositories as they do today.
2. **The key is a function-only environment variable.** It must never appear in a `VITE_*` name, which
   means "inline this into the client bundle". It must never be logged, and upstream error bodies must
   never be returned verbatim, because they can echo request details.
3. **Extract only, never generate.** Every returned card must carry the **source span it came from**,
   and the model is instructed to return only text present in the input. The reference is stored with
   the card, so a wrong card is visible as a wrong card rather than being memorised silently.
4. **The document is never uploaded — only text.** A PDF's watermark is _pixels_; scrubbing the
   extracted text cannot touch it. Extracted text plus images stay on the device; the file does not
   travel.
5. **Scrub on the device, and enforce it at the outbound boundary.** A pure `scrubPII(text)` runs before
   the request is built, **and** `src/lib/api-client.ts` — the single existing choke point for network
   calls — re-checks and refuses to send if an identifier pattern survives. The control lives where it
   cannot be skipped by a future caller.
6. **She reviews before anything is saved.** Extraction is additive to the existing review screen;
   nothing auto-commits. This is also what keeps requirement 3 honest.
7. **Disclosure in the UI, without naming the vendor.** The button is labelled **"AI Card maker"**, and
   one plain sentence beside it says her notes are **sent to an AI service** to make the cards. The
   vendor is named in this ADR and in code, not in her copy.
8. **Spend is capped at ≤ $1/day**, enforced server-side, with the account balance as the outer bound.
   Model: the cheap tier. `max_tokens`: 4096.
9. **Chunk by greedy section packing**, not by fixed windows: accumulate blank-line blocks up to
   ≈10k input tokens or ≈60 expected cards, never splitting a section unless it alone exceeds the
   budget. **The 4096 output cap binds before the input budget does**, which is why the card estimate
   is the real constraint. A stable, byte-identical system prompt is sent every call so the provider's
   prefix cache makes the instruction overhead ~50× cheaper after the first request.
10. **The vendor is behind our endpoint.** The client talks only to `/api/extract`; it never holds a
    vendor URL, model name, or prompt. The provider can be swapped without touching the client.
11. **The deterministic parser stays, and stays the default.** Extraction is an additional path she
    chooses, not a replacement. If it fails, is expensive, or produces worse cards, the button can be
    removed and nothing else changes.

## Consequences

### Good

- **Cards from her actual material become possible.** The two failures left standing are the two a
  model handles and a parser cannot, so this is aimed at a measured defect rather than a preference.
- **The reversible one.** Extraction is additive: same repositories, same review screen, no migration,
  and the old path is untouched. That is the single most important property here, because it means being
  wrong is cheap.
- **Bounded, measured cost.** Order of a fraction of a cent per handout, capped daily at $1 and backed
  by a prepaid balance that cannot be exceeded.
- **The privacy exposure is bounded and specific**, rather than open-ended: documents never travel,
  identifiers are removed on-device, and only the words of the notes are sent.
- **Everything except card generation stays offline.** The paste path, the parser, review, the timer,
  the tracker and the flashcards loop are unchanged; only the new button needs the network.
- **A real security boundary for the key**, which is what the owner actually asked for.

### Bad / cost

- **The privacy promise changes, and scrubbing is a mitigation rather than a guarantee.** We have direct
  evidence that identifiers arrive _fragmented_ (`e j a m e n d i o l a @ …`), which is exactly the shape
  a naive matcher misses. A determined reviewer could still find residual personal data in transmitted
  text. The honest claim is "we remove what we can recognise", never "nothing personal is sent".
- **All four things ADR 0004 counted as its good news return:** a runtime dependency, a key, a network
  call, and a failure mode — plus a vendor account and a bill.
- **Card generation stops working offline.** Accepted deliberately by the owner: she has network almost
  always. But it is a real regression in an app whose premise is offline-first, and it must not spread.
- **Non-determinism.** Model output may vary between runs, so card _content_ cannot be asserted in tests.
  Containment: the scrubber, the chunker and the request builder are pure and unit-tested; the model
  call is mocked; and the response is schema-validated before it can reach the review screen.
- **The daily cap needs shared state, which is one piece more than "a function and a variable".**
  Serverless instances do not share memory, so an exact $1/day ceiling requires a small external counter
  (Vercel KV or Upstash, free tier) keyed per day with a TTL. Without it the cap degrades to a per-IP
  approximation. This is recorded rather than glossed because it is the only new _service_.
- **The endpoint is reachable by anyone who finds it, until Workflow S lands.** There is no auth to
  check yet. Containment is the daily cap plus the balance: worst case is one day's cap. Real auth
  arrives with S, when the function can verify a token instead of trusting an IP.
- **Six documents currently forbid this**, and all must change in the same commit or the repository
  contradicts itself: `CLAUDE.md` (Boundary 1, the "no backend" bullet, the two-AI-boundaries section),
  `AGENTS.md`, `CONTRIBUTING.md` (two rows), `BUILD_GUIDE.md` §2, and the two ADRs amended above.
- **A new deploy-time coupling.** The function and the client ship together, and a rewrite rule stands
  between them: `vercel.json`'s SPA catch-all `"/((?!.*\\.).*)"` also matches `/api/extract`, which
  contains no dot. If rewrites are evaluated before the filesystem, the function is unreachable and the
  client receives `index.html` with a **200** — a confusing failure with no error to read. This must be
  verified against the real deployment, and the negative lookahead widened to exclude `api/` if needed.

## Alternatives considered

- **Keep the deterministic parser only.** Rejected: honest about what it is, but it leaves two measured,
  structural failures that it cannot reach, and the owner has decided the trade.
- **Generate cards from the model's own knowledge.** Rejected unchanged from ADR 0004: a hallucinated
  drug interaction becomes a memorised wrong answer. Extraction-only, with the source span on every
  card, is the version of this that does not have that failure mode.
- **The key in a `VITE_*` variable.** Rejected outright — not a risk to be mitigated but a disclosure.
  The bundle is public and the repository is public.
- **Bring-your-own-key stored on the device.** Rejected: the provider's API is built for server-side
  callers and direct browser calls are a known cross-origin failure, so it may not work at all; and a
  key sitting in IndexedDB is readable by anything with device access, which does not meet "stored
  safely".
- **A separate service** (Cloudflare Workers, Supabase Edge). Rejected: another account, another deploy
  target, and a cross-origin boundary to maintain, for no benefit over a same-origin function.
- **Send only section headings to reduce exposure.** Rejected: without the body text the model cannot
  quote a source span, and the cards get worse — which would defeat the reason for the change.
- **On-device model (WebLLM / transformers.js).** Unchanged rejection from ADR 0004: tens to hundreds of
  megabytes on a 3 GB iPad, and still non-deterministic.
- **Cloud OCR instead of local OCR.** Unchanged rejection: a key, a billing account, and it breaks the
  offline image path that currently works.
