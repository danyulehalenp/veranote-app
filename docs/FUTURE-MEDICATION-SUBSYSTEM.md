# Future Architecture Note — Medication Subsystem (Deferred)

This document preserves the **larger medication subsystem idea** as future-project architecture.

It is **not** current implementation scope for the app prototype.
If this document starts driving near-term work, the project is probably drifting.

## Why this is deferred

Right now the app's main job is narrower:
- transform source material into a reviewable draft
- preserve truth better than a generic note generator
- make unsupported medication claims easier to catch

That means the current project needs a **small medication guardrail layer**, not a big medication platform.

See current-scope doc:
- `docs/MEDICATION-GUARDRAILS-V1.md`

## What belongs in the future medication subsystem

If the product later proves it needs deeper medication handling, the larger subsystem could include:

### 1. Medication entity normalization
- brand/generic mapping
- canonical medication identity
- formulation-aware normalization
- route / strength / unit parsing
- scheduled vs PRN normalization

### 2. Medication-source reconciliation model
- patient report vs clinician note vs chart med list vs MAR vs collateral
- confidence / provenance per medication claim
- active vs historical vs discontinued state tracking
- unresolved-conflict representation rather than forced merge

### 3. Medication timeline representation
- start / stop / increase / decrease / not-started / held / resumed events
- relative chronology handling (`last week`, `3 weeks ago`, `since discharge`)
- support for delayed symptom change after medication changes

### 4. Medication-specific review UX
- med statement evidence links
- explicit med-conflict review cards
- side-effect / adherence / efficacy evidence buckets
- formulation-sensitive warning cues

### 5. Medication eval pack and regression discipline
- dedicated medication regression suite
- canonical failure taxonomy
- threshold-based acceptance gates for med fidelity

### 6. Optional future integrations
- drug dictionary / RxNorm-style normalization
- prescribing / refill workflow support
- interaction checking
- structured medication import from external systems

## What does *not* belong in the current build

Do **not** pull the following into V1 just because they are good ideas:
- full medication database integration
- backend reconciliation service
- structured medication state store spanning multiple encounters
- canonical medication truth engine
- advanced interaction or prescribing logic
- generalized pharmacy-quality normalization pipeline

Those may be valuable later. They are not the current wedge.

## Re-entry criteria

This larger subsystem should come back into play only if most of the following become true:
- current prompt/review guardrails are no longer enough for recurring medication failures
- medication fidelity remains a top blocker after evidence-linked review is working
- users need consistent medication handling across many note types or encounters
- the product has a clear reason to invest in medication structure rather than broader general trust work
- the team is ready to support extra architecture without derailing the prototype

## Practical roadmap sequence

1. **Now:** keep medication work in prompt/review/eval guardrails only
2. **Next:** strengthen evidence-linked medication review and regression coverage
3. **Later:** add lightweight structured medication claim extraction if review data shows it is worth it
4. **Only after that:** decide whether a true medication subsystem is justified

## Bottom line

Preserve this as an architecture note, not a to-do list.

The current prototype should solve:
- medication truth preservation
- medication conflict visibility
- medication overstatement prevention

It should **not** try to become a medication infrastructure project yet.
