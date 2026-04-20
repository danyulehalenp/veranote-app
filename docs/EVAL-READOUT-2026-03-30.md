# Veranote — Eval Readout (2026-03-30)

> Legacy note: older internal materials may still refer to this product as `Clinical Documentation Transformer`. The canonical product name is now **Veranote**.

## Purpose

This readout captures the most likely current fidelity weak spots based on inspection of the app’s generation/review logic, current prompt constraints, and the starter eval set.

This is not a full scored benchmark run yet. It is a practical pre-benchmark assessment used to guide the next build step.

## What was reviewed

- generation path in `lib/ai/generate-note.ts`
- prompt assembly in `lib/ai/assemble-prompt.ts`
- intake behavior in `components/note/new-note-form.tsx`
- current trust/review UX and persisted section review workflow
- starter eval cases in `docs/eval-cases/`

## Strengths of current implementation

### 1. Stronger source-faithfulness posture than a generic prompt app
The app now explicitly instructs the model to:
- make every sentence supportable from source
- omit weakly supported claims rather than guess
- preserve source-shaped wording when safer
- prefer sparse but faithful over polished fiction

That is the correct direction and should reduce obvious hallucination pressure.

### 2. Better source separation at intake
The structured source sections reduce one common failure mode where collateral, transcript, and objective data blur together before generation even starts.

### 3. Better review workflow than before
The new review UX and per-section review state make it more likely that a clinician actually catches drift rather than skimming one large block of text.

## Most likely weak spots right now

## 1. Attribution drift between patient, collateral, and objective data
### Risk level: High

Why:
- The app collects separated source sections, which is good.
- But the actual generation still passes a combined representation into one prompt-driven draft step.
- There is not yet visible evidence-linking from draft claims back to source blocks.

Most vulnerable eval cases:
- `05-collateral-conflict-adolescent.md`
- `06-objective-data-conflict.md`
- `09-risk-language-safety.md`

Likely failure pattern:
- patient denial + collateral concern may be flattened into one cleaner statement
- narrative language may swallow objective contradictions
- attribution labels may disappear in polished prose

What to build next:
- source-linking/highlighting by section or sentence
- stronger prompt formatting that explicitly preserves attribution labels when conflict exists

## 2. Safety-language flattening
### Risk level: High

Why:
- Safety wording is exactly where models like to "clean up" nuance.
- Even with temperature 0 and better instructions, passive death wish vs active SI is a fragile distinction.

Most vulnerable eval case:
- `09-risk-language-safety.md`

Likely failure pattern:
- passive death-wish language gets collapsed into either full denial or overstated suicidality
- source nuance about plan/intent may be overcompressed

What to build next:
- safety-specific prompt constraints
- source-linked review callouts for risk-language sections
- dedicated eval runs for risk language before prompt revisions are accepted

## 3. Timeline smoothing
### Risk level: Medium-High

Why:
- The system asks for a cleaner note, and many models compress chronology into a smoother current-state summary.
- This is especially risky when symptoms were worse previously but improved only partially.

Most vulnerable eval cases:
- `04-timeline-sensitive-follow-up.md`
- `10-inpatient-psych-progress.md`

Likely failure pattern:
- old symptoms become current
- current partial improvement becomes full improvement
- last-occurrence timing gets softened into vaguer language

What to build next:
- stronger prompt rules around historical vs current framing
- timeline-sensitive eval cases used as standing regression blockers

## 4. Medication-detail drift
### Risk level: Medium-High

Why:
- Dose changes are easy for models to normalize incorrectly, especially when objective med lists lag behind clinician notes.
- The app is prompt-driven, not citation-driven.

Most vulnerable eval case:
- `02-medication-dose-change.md`

Likely failure pattern:
- wrong active dose
- contradictory med list resolved incorrectly
- side effects overstated as resolved or minimized incorrectly

What to build next:
- medication conflict prompts that explicitly preserve clinician-note vs med-list mismatch
- source-linked display for med statements in review

## 5. Sparse-source padding
### Risk level: Medium

Why:
- The current prompting is much better than before, but note-generation models still tend to round sparse input into standard note language.
- This may show up as harmless-looking filler that is still unsupported.

Most vulnerable eval cases:
- `01-sparse-psych-follow-up.md`
- `07-therapy-process-note.md`
- `08-general-medical-follow-up.md`

Likely failure pattern:
- unsupported ROS/MSE flourishes
- treatment-plan boilerplate
- stronger interpretation than the source justifies

What to build next:
- sentence-level evidence review
- optional "strict sparse mode" phrasing for thin inputs

## Where the app is probably strongest right now

The app is probably strongest on:
- ordinary structured follow-up drafts with reasonably complete source input
- workflows where the clinician is willing to review section by section
- cases where the main risk is generic over-polish rather than hard contradiction

## Where the app is still most clinically vulnerable

The app is still most vulnerable when:
- multiple sources disagree
- safety wording is nuanced
- medication history conflicts with current lists
- chronology matters to meaning
- the source is sparse but the template shape invites filler

## Practical recommendation

### Next build priority
Build **source-linking/highlighting in review** next.

Reason:
- It directly addresses the current highest-risk failure modes.
- It makes the new per-section review state more meaningful.
- It creates a stronger basis for real eval scoring instead of vibe-based approval.

### Next evaluation priority
Run a real manual benchmark using these 5 cases first:
1. `02-medication-dose-change.md`
2. `04-timeline-sensitive-follow-up.md`
3. `05-collateral-conflict-adolescent.md`
4. `09-risk-language-safety.md`
5. `10-inpatient-psych-progress.md`

These should act as the first serious fidelity gate.

## Bottom line

The app is getting more trustworthy, and the review workflow is now materially better. But the next trust ceiling is not more polish — it is evidence traceability.

Right now the app is closest to:
- "clinically promising prototype with better guardrails"

It is not yet:
- "source-traceable documentation tool with strong regression discipline"

That next jump comes from source-linking plus repeated eval against the high-risk cases above.
