# Veranote — V1 Scope

> Legacy note: older internal materials may still refer to this product as `Clinical Documentation Transformer`. The canonical product name is now **Veranote**.

## Purpose

V1 should help a clinician turn messy, source-based input into a more structured, editable draft note **without inventing facts**.

This version is not trying to replace clinical judgment, automate billing strategy, or become a full EHR. The job is narrower and more useful:

- accept real clinician/source input
- produce a cleaner draft in a known note format
- make source review easy
- make unsupported or missing information visible instead of guessed

## Product wedge

Start with note types where source-to-draft transformation is valuable and trust matters more than flash.

### In scope for V1

1. **Psychiatry follow-up note**
2. **Therapy/progress note**
3. **General medical follow-up / SOAP-style note**
4. **Inpatient psych progress note**

These align with the current prompt set and product direction already in the prototype.

### Out of scope for V1

- ambient listening/live capture
- autonomous coding of diagnoses or billing levels
- EHR integration
- production compliance/enterprise controls
- broad specialty expansion beyond the current prompt wedge
- one-click finalization with no clinician review

## Primary user promise

> Give the app rough clinical input, and it will return a draft that is more organized and readable than the source while staying faithful to what was actually provided.

## Core requirements

### 1. Source-grounded drafting
The draft must be grounded in provided source material.

Required behavior:
- do not invent symptoms, dates, meds, doses, labs, histories, or plans
- preserve negations and uncertainty correctly
- keep timeline details accurate when present
- distinguish patient report from collateral report when relevant
- flag missing or unclear information rather than filling gaps
- for medications specifically, preserve unresolved medication conflict instead of silently reconciling it

Medication handling in this phase stays intentionally small:
- see `docs/MEDICATION-GUARDRAILS-V1.md` for the immediate medication slice
- see `docs/FUTURE-MEDICATION-SUBSYSTEM.md` for deferred future architecture that is **not** part of current implementation scope

### 2. Reviewable output
The app must make it easy for a clinician to verify whether the draft is justified.

Required behavior:
- source remains visible during review
- draft can be edited directly
- review should support section-by-section checking
- missing/unclear items should be separated from contradiction warnings when possible
- rewrite tools should improve wording, not add unsupported content

### 3. Useful structure
The app should improve note organization enough to save time.

Required behavior:
- output matches the selected note style/template
- sections are readable and clinically usable
- formatting is consistent enough to edit quickly
- sparse input should still produce a sparse but usable draft rather than padded filler

### 4. Lightweight continuity
The prototype should preserve work without adding premature complexity.

Required behavior:
- drafts can be saved and revisited
- examples/templates remain easy to load
- local/prototype persistence is acceptable for V1

## Acceptance criteria

V1 is good enough when all of these are mostly true:

### Clinical trust criteria
- A clinician can review a draft and usually identify support for each substantive claim in the source.
- The app avoids obvious hallucinations in high-risk areas:
  - meds/doses
  - dates/timeline
  - negations
  - suicide/safety language
  - collateral-vs-patient attribution
- When the source is thin, the output stays thin instead of becoming fiction.

### Workflow criteria
- A user can go from intake → generated draft → review → export without confusion.
- The review screen clearly communicates that clinician review is required.
- Edits are easier to make than rewriting from scratch.

### Product criteria
- The app clearly does one thing well: transform rough source material into a reviewable draft.
- It does not pretend to be a complete documentation platform yet.

## UX principles for V1

- **Truer over cleaner.** If forced to choose, pick accuracy over polish.
- **Visible evidence beats hidden magic.** Keep source context available during review.
- **Missing beats fabricated.** Empty or flagged is better than wrong.
- **Editable beats brittle.** Make it easy for the clinician to fix wording.
- **Narrow beats fake-general.** A few trustworthy note flows beat broad unreliable coverage.

## Recommended build order after current pass

1. Add stronger source-linking/highlighting in review
2. Persist per-section review state
3. Build formal fidelity eval cases and run them routinely
4. Improve section parsing across prompt/template shapes
5. Only then decide whether persistence/backend complexity needs to grow

## Definition of done for this V1 phase

This phase is done when the app can reliably demo a small set of note types with:
- grounded drafting
- visible evidence during review
- clear missing-data behavior
- trustworthy editing/rewrite behavior
- repeatable evaluation against representative test cases
