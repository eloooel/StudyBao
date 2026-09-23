# PNLE scope — verified from the official PRC program

Reference for the deck taxonomy. **This is the authoritative source; third-party "PNLE TOS" pages
are not.**

## Source

| Field | Value |
| --- | --- |
| Document | *Program of the Nurses Licensure Examination on Feb. 26-27, 2026* |
| Issued by | Professional Regulation Commission / Professional Regulatory Board of Nursing |
| Approved | December 01, 2025 |
| Signed | Leah Primitiva S. Paquiz, Chairperson, PRB of Nursing |
| Certified correct | Atty. Lovelika T. Bautista, Chief, PRB Secretariat Division |
| Pages | 8 |
| Obtained | Provided directly by the project owner |
| Extraction | PyMuPDF `get_text()` for pages 1–3; pages 4–8 are scanned images and were read visually |

**Pages 4–8 are not part of the exam scope.** They are the full text of *PRC Memorandum Order No. 52,
s. 2020* ("Examination Measures"), signed by Chairman Teofilo S. Pilando, Jr., published in the
Business Mirror September 15, 2020, effective immediately. It covers legal bases, definitions of
moral turpitude, prohibited acts, and miscellaneous provisions — i.e. exam conduct rules, not content.

> **Template artifact.** Every page footer reads *"Program of the Nurses Licensure Examination (NLE)
> November 4-5, 2025"* while the title and schedule say February 26-27, 2026. PRC reuses the document
> template between sittings — which is good news, because it means the **scope structure below is
> stable across sittings** even though the dates change.

## The five parts (verbatim)

> This Nurse Licensure Examination consists of five (5) parts namely:

1. **Nursing Practice I** — Care of Individuals, Families, Population Groups and Community (Community
   Health Nursing)
2. **Nursing Practice II** — Part 1: Care of Mother, Adolescent (Well Clients), At Risk or With
   Problems (Acute & Chronic); Part 2: Human Growth and Development
3. **Nursing Practice III** — Care of Clients with Problems in Surgery, Oxygenation, Fluid and
   Electrolytes, Infectious, Inflammatory and Immunologic Response, Cellular Aberrations (Acute and
   Chronic)
4. **Nursing Practice IV** — Care of Client with Problems in Nutrition, and Gastro-Intestinal,
   Metabolism and Endocrine. Perception and Coordination (Acute and Chronic)
5. **Nursing Practice V** — Care of Clients with Maladaptive Patterns of Behavior (Acute and Chronic);
   Care of Clients with Life-Threatening Condition, Acutely Ill/Multi-Organ Problems, High Acuity and
   Emergency Situation

## Major subject areas (verbatim)

> The tests draw basic knowledge, skills and attitudes in the major subject areas i.e., Fundamentals
> of Nursing including Professional Adjustments, Maternal and Child Nursing, Community Health and
> Communicable Disease Nursing, Nursing of Adolescents, Adults and Aged, and Mental Health and
> Psychiatric Nursing.

## Integrated knowledge areas (verbatim)

> The following areas of knowledge will be integrated in each of the above-named subject areas:

Anatomy and Physiology · Nutrition and Diet Therapy · Pathophysiology · Parasitology and Microbiology ·
Pharmacology and Therapeutics

> Nursing process serves as the framework in the nursing care of individuals, families, population
> groups and communities in various stages of development in health care setting.

## Schedule (verbatim, for the Feb 2026 sitting)

| Day | Time | Part |
| --- | --- | --- |
| Thu Feb 26 | 7:00–7:45 AM | General instructions, filling out of forms |
| Thu Feb 26 | 8:00–10:00 AM | Nursing Practice I |
| Thu Feb 26 | 11:30 AM–1:30 PM | Nursing Practice II (Parts 1 & 2) |
| Thu Feb 26 | 2:30–4:30 PM | Nursing Practice III |
| Fri Feb 27 | 8:00–10:00 AM | Nursing Practice IV |
| Fri Feb 27 | 11:30 AM–1:30 PM | Nursing Practice V |

**Five two-hour sessions across two days.** Each slot is 2 hours — the document does **not** state an
item count per part.

## What the official document does NOT contain — and why that matters

**There is no Table of Specifications and no per-topic item weight in this document.** Verified by
reading all 8 pages. The scope is descriptive, not quantified.

This is a product constraint, not a footnote:

- **Do not build a "this topic is worth X% of the exam" weighting into the dashboard.** There is no
  official number to use, so any percentage would be invented, and she would allocate scarce study
  time by it.
- Weight weak-topic surfacing by **her own review data** plus simple coverage of the five parts.
- If a reviewer or a prep site shows a percentage table, treat it as that vendor's estimate.

### Worked example of why this rule exists

A widely-indexed prep site ("NLE November 2027" guide) publishes a "5 Subjects" breakdown with
**different content for every part** than the official program — it labels Nursing Practice I as
"Foundations of Nursing", Nursing Practice II as "Care of Mother, Child and Family", and Nursing
Practice V as "Care of Clients Across Lifespan" including Community Health Nursing. The official
program says Nursing Practice I *is* Community Health Nursing, and Nursing Practice V is maladaptive
behavior plus life-threatening/high-acuity care.

That page also asserts "each 100 items" and topic weights. The official program states no item counts.
**A prep site can be confidently wrong about the exam's own structure.** Use `prc.gov.ph`, not a
study blog, and not this file either — this file is a transcription and could itself contain an error.

## How this maps to the data model

- **Five decks**, named and ordered exactly as the official parts. She will sit five papers; the app
  should mirror that.
- **Integrated knowledge areas become tags on cards**, not decks. Tagging gives a second analysis axis
  ("pharmacology is my weak spot across all five parts") without duplicating cards into two decks.
- The **major subject areas** (Fundamentals, Maternal & Child, Community Health, Adolescents/Adults/
  Aged, Mental Health) are a third, older framing. They cut across the five parts. Do not seed them as
  decks; if useful, they can become a second tag dimension later.

## Verification checklist for a future sitting

**Her sitting is Friday, February 26, 2027.** The Feb 2026 program was approved 2025-12-01 for a
2026-02-26 exam — an 87-day lead — so the **February 2027 program is expected around early December
2026**. Re-run this check then, before she has thousands of cards filed under the current taxonomy.

When the next program is published, confirm in five minutes:

1. Are there still exactly five Nursing Practice parts, with the same scopes? (Expected: yes — the
   template has been reused across sittings.)
2. Have the exam dates changed? (Expected: yes.)
3. Has an item count or weight table been added? (Expected: no. If one appears, the "no invented
   weights" rule can be revisited.)

Source to re-fetch: `prc.gov.ph` → Examination Schedule / Downloads → the program PDF for the
Feb 2027 NLE. Note that `web_fetch` cannot read PDFs directly; download it and extract with PyMuPDF
(`get_text()` for text pages, and read scanned pages visually).
