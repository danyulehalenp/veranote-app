# Serious Regression Round 1 Rerun — 2026-03-30

## Scope
Reran the previously loudest failures after a conservative prompt/review tightening pass:
- 12 — Passive death wish hidden by denial language
- 13 — Temporal negation with vomiting resolved yesterday
- 17 — Therapy intervention attempted without clear effect
- 18 — Minimal input with high hallucination risk

Execution path:
- Live POSTs to `/api/generate-note`
- `keepCloserToSource: true`
- `outputStyle: Standard`
- `format: Labeled Sections`

Raw artifact:
- `docs/eval-results/serious-regression-round-1-rerun-2026-03-30.raw.json`

## What changed before rerun

### Prompt tightening
- Added source-shape directives in prompt assembly for:
  - sparse-input mode
  - explicit no-plan-in-source handling
  - minimal-plan handling (`needs refill`, `continue current plan`, narrow follow-up only)
  - refill-request vs refill-provided distinction
  - minimal-status language (`about the same`, `nothing major changed`) so it does not become `stable` / `no new symptoms`
  - therapy intervention attempted without clear benefit
  - preserving named safety supports without expanding them into broader safety plans
- Updated psychiatry and therapy prompt templates to reinforce the same constraints.

### Review / warning tightening
- Broadened passive death-wish copilot detection.
- Added stronger sparse-input and narrow-plan review cues.
- Added therapy-specific warning for intervention-without-clear-benefit.
- Fixed the false-positive suicidality contradiction heuristic so `denies SI` + explicit `no recent self-harm` does not trigger the overdose/self-harm contradiction flag.
- Updated review UI trust copy to explicitly say sparse or `not documented in source` sections can be the correct result.

## Case-by-case rerun readout

### Case 12 — Passive death wish hidden by denial language
**Status:** Improved to yellow

What improved:
- The draft kept passive-death-wish nuance.
- The unsupported generic monitoring plan was removed.
- Plan now stays sparse: `Plan details not documented in source.`
- The prior false-positive contradiction flag did not recur.
- The more specific passive-death-wish warning now appears.

What is still imperfect:
- `The patient currently denies suicidal ideation with plan or intent` is still slightly awkward and cleaner than the source, though materially better than the prior output.
- Some generic missing-info flags remain noisy.

### Case 13 — Temporal negation with vomiting resolved yesterday
**Status:** Improved to yellow-green

What improved:
- Timeline stayed intact.
- The unsupported `continue supportive care with hydration` plan was removed.
- Plan now explicitly stops at `No further plan details documented in source.`

What is still imperfect:
- `No labs obtained during this visit` is being used as plan-adjacent language even though it is really objective/descriptive.
- Sparse-input warning fires, which is arguable but not crazy.

### Case 17 — Therapy intervention attempted without clear effect
**Status:** Improved to yellow-green

What improved:
- The invented future-oriented coping/monitoring plan was removed.
- Plan now correctly says it was not documented in source.
- The new therapy-specific warning appears.
- The draft no longer overstates benefit from grounding.

What is still imperfect:
- The rerun draft dropped the explicit statement that grounding was attempted and not helpful from the main narrative and collapsed that information too much. That is safer than inventing benefit, but still weaker than ideal source preservation.
- Formatting came back more compressed than preferred in some sections.

### Case 18 — Minimal input with high hallucination risk
**Status:** Improved, but still weakest of the four; yellow leaning red

What improved:
- The prior invented action plan `Provide a refill...` was reduced to `Refill for lamotrigine is needed`.
- It no longer claims the refill was actually provided.
- It now preserves the literal source phrases `about the same` / `nothing major changed` instead of converting them all the way into a full routine follow-up plan.
- Sparse-input and narrow-plan warnings now appear prominently.

What still fails / remains weak:
- It still smooths thin input into pseudo-completeness:
  - `No new symptom details were provided during this visit.`
  - `The patient's status appears unchanged based on their report.`
- Those lines are milder than the first-pass failure, but they are still interpretive cleanup beyond the evidence level.
- This remains the clearest residual hallucination-pressure case and still needs another tightening loop.

## Net result

### Clear wins
- Undocumented plan generation improved across all four reruns.
- Sparse-input review cues are now more explicit and better targeted.
- Passive-death-wish handling improved materially.
- The known contradiction false positive for case 12 appears fixed.

### Remaining weak spot
- Case 18 still shows the core residual problem: very thin inputs get partially normalized into cleaner completion language even when the model no longer invents a full plan.

## Validation
- `npm run build` ✅ passed
- `npm run lint` ❌ still fails because the repo has no `eslint.config.(js|mjs|cjs)` flat-config file for ESLint 10

## Bottom line
This pass successfully reduced the loudest undocumented-plan failures and made the review layer more honest about sparse-source risk.

But case 18 is not fully solved yet. The model is still tempted to turn `about the same / nothing major changed / needs refill` into a more complete-looking clinical summary than the source really supports.