# ADR 0004 — No LLM in the shipped product

- **Status:** Accepted
- **Date:** 2026-02 (planning)
- **Related:** ADR 0001, `CLAUDE.md` (the "two AI boundaries" section)

## Context

This repo is built _with_ AI coding agents and is _for_ a person preparing for a licensure exam. Those
two facts are easy to confuse, so the boundary is written down here explicitly.

The concrete feature under pressure is auto-generating flashcards from uploaded notes. The obvious
"modern" implementation is to send the text to a model and ask for question/answer pairs.

## Decision

**The shipped application contains no LLM and makes no model calls.**

- Flashcard generation is **Tesseract.js OCR** (client-side) plus a **deterministic pattern parser**,
  with unmatched text routed to a manual "Needs Review" queue. Nothing is silently dropped.
- There is no runtime API key, no model SDK, no inference endpoint, and no "AI" feature.
- **AI agents may be used to write this code.** That is a development-time activity, governed by
  `CLAUDE.md` and the runbooks in `docs/ai/`. It does not put a model in the product.

## Consequences

**Good**

- **Zero runtime cost**, forever. No key to leak, no quota to blow, no per-request billing, no vendor
  account.
- **Works offline.** OCR and parsing run on-device, consistent with ADR 0001's local-first stance.
- **Privacy.** Her notes and study history never leave her devices except to her own sync database.
- **No hallucinated flashcards.** This is the decisive argument. A model that invents a plausible but
  wrong drug interaction produces a flashcard that she memorizes, and a wrong flashcard is actively
  worse than a missing one on a licensure exam.
- **Deterministic and testable.** Parser behaviour can be asserted in unit tests; model output cannot.

**Bad / cost**

- Lower recall on messy or handwritten input. Mitigated by shipping three ingest paths and defaulting
  to the highest-fidelity one (paste / PDF text), and by recommending her phone's built-in text
  recognition (iOS Live Text / Google Lens) for handwriting, which is free and better than Tesseract.
- More manual review effort than a model would require. Accepted: the review queue is the honest
  version of that work, and the correctness bar justifies it.
- Resisting the temptation later. Adding "just a small model call" for explanations or summaries is
  exactly the change this ADR exists to require a conversation about.

## Alternatives considered

- **LLM-based card generation.** Rejected on hallucination risk, offline requirement, cost, and
  privacy — in that order of importance.
- **LLM only for parsing structure (not content).** Still a runtime dependency, a key, a network call,
  and a failure mode; the deterministic parser covers the structured cases that actually occur.
- **On-device small model (e.g. WebLLM / transformers.js).** Rejected: tens to hundreds of megabytes
  of download on a phone, battery cost, and still non-deterministic — for a task a regex layer solves.
- **Cloud OCR with a free monthly quota (e.g. Cloud Vision).** Rejected: requires an API key and a
  billing account, and violates the offline requirement. Also the guide's premise is "free tools only".
