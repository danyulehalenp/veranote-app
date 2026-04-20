# Conflict-Preservation Rerun — Cases 24, 23, and 21 — 2026-03-30

## Scope
Focused prompt/review tightening for the loudest Task #1 high-risk conflict-adjudication failures:
- 24 — transcript-vs-clinician self-harm conflict
- 23 — denial vs positive screen / collateral substance conflict
- 21 — hallucination denial vs observed behavior conflict

Execution path:
- live generation via `/api/generate-note`
- `keepCloserToSource: true`
- `outputStyle: Standard`
- `format: Labeled Sections`

Raw rerun output:
- `docs/eval-results/conflict-preservation-rerun-2026-03-30.raw.json`

## What changed

### Prompt assembly
- `lib/ai/assemble-prompt.ts`
  - added explicit unresolved-conflict directives when source bundles contain contradiction signals
  - added targeted instructions for:
    - transcript self-harm disclosure vs cleaner clinician summary
    - substance denial vs collateral/objective conflict
    - hallucination denial vs observed internal-preoccupation behavior
  - added assessment-level reviewability rules that explicitly ban quiet adjudication

### Source analysis / review warnings
- `lib/ai/source-analysis.ts`
  - added conflict detectors for:
    - transcript-clinician self-harm conflict
    - substance denial vs positive screen / collateral conflict
    - psychosis-denial vs observed-behavior conflict
  - added focused copilot warnings so these patterns surface in review instead of hiding inside generic warning buckets

### Template prompt tightening
- `prompts/global-system-prompt.md`
  - reinforced that conflicting source material must stay conflicting in the draft
- `prompts/psychiatry-follow-up.md`
  - explicitly told Assessment to preserve disagreement instead of reconciling it
  - explicitly banned adjudicating substance-conflict phrasing like `objective data indicate recent use`
  - explicitly banned upgrading recent cutting into NSSI unless the source does so
- `prompts/inpatient-psych-progress-note.md`
  - explicitly told Assessment to keep denial-vs-observation tension unresolved and attributed

## Case 24 — No self-harm note conflicts with recent cutting

### What improved
- The Assessment now explicitly preserves the conflict instead of collapsing into `recent non-suicidal self-injury`.
- The note no longer upgrades the cutting disclosure into an NSSI label.
- The output keeps suicidal-intent denial and the recent cutting disclosure side by side.
- The Assessment now says the source conflict remains unresolved.

### What is still weak
- `Safety / Risk` still uses the awkward framing `No self-harm was reported by the patient in the clinician note; however...`
- That is better than the old internally contradictory wording, but it still feels mechanically chart-reconciled rather than naturally clinician-written.
- `self-injurious behavior` is safer than `NSSI`, but it is still a little more interpretive than simply restating `cutting`.

### Readout
- **Improved materially.**
- Not fully elegant yet, but the dangerous part — premature conflict resolution and stronger labeling — got pulled back.

## Case 23 — Substance denial vs positive screen / collateral concern

### What improved
- The Assessment no longer says `collateral report and objective data indicate recent cocaine use.`
- It now preserves the disagreement explicitly as a discrepancy.
- The note avoids claiming the patient admitted use.
- It still avoids inventing timing, amount, intoxication, withdrawal, detox, or hospitalization content.

### What is still weak
- `supported by a positive urine drug screen for cocaine` is still edging toward adjudication.
- The draft is better, but not perfectly conservative; it still sounds like the positive screen is being used to close the case rather than keep the contradiction open.
- `Mental Status / Observations` carrying only HR 108 is structurally clunky.

### Readout
- **Improved, but only partially.**
- This is still the weakest of the rerun three because the model keeps wanting to let the positive screen win rhetorically.

## Case 21 — Hallucinations denied but behavior suggests internal preoccupation

### What improved
- The Assessment no longer says the patient `continues to exhibit signs of internal preoccupation without current auditory or visual hallucinations.`
- The revised output keeps hallucination denial and observed behavior side by side.
- The behavior remains attributed to interview observations and nursing notes.
- The Assessment explicitly says the source conflict remains unresolved.

### What is still weak
- `indicate laughing to self and internal preoccupation` still sounds a bit more settled than ideal.
- `Date / Interval Update: No specific date or interval update documented in the source.` is scaffold-y and not very note-native.
- The note is safer now, but still somewhat templated.

### Readout
- **Improved materially.**
- This is much closer to the intended conservative behavior.

## Net readout
- **24 improved:** yes, materially
- **23 improved:** yes, but still partial / still somewhat adjudicative
- **21 improved:** yes, materially

## Residual weakness pattern
The prompt pass reduced the worst assessment-layer adjudication, but one residual habit remains:
- when objective data looks stronger than patient report, the model still wants to lean toward `supported by...` language instead of fully unresolved conflict language

So the main remaining weakness is:
- **objective evidence still rhetorically overpowers denial too easily in assessment prose**

## Validation
- `npm run build` ✅ passed
- `npm run lint` ❌ failed
  - current script runs `npx eslint .`
  - repo still lacks `eslint.config.(js|mjs|cjs)` for the installed ESLint version

## Key files changed
- `lib/ai/source-analysis.ts`
- `lib/ai/assemble-prompt.ts`
- `prompts/global-system-prompt.md`
- `prompts/psychiatry-follow-up.md`
- `prompts/inpatient-psych-progress-note.md`
- `docs/eval-results/conflict-preservation-rerun-2026-03-30.md`
- `docs/eval-results/conflict-preservation-rerun-2026-03-30.raw.json`
